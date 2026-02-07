import { Node } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionProps } from '@tiptap/suggestion';
import './TaskWidget.css';

// Reuse the same mock users as mentions
const mockUsers = [
  { id: '1', label: 'John Doe' },
  { id: '2', label: 'Jane Smith' },
  { id: '3', label: 'Bob Johnson' },
  { id: '4', label: 'Alice Brown' },
  { id: '5', label: 'Charlie Davis' },
];

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export const TaskWidgetNode = Node.create({
  name: 'taskWidget',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      assignee: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-assignee'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes['assignee']) return {};
          return { 'data-assignee': attributes['assignee'] };
        },
      },
      dueDate: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-due-date'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes['dueDate']) return {};
          return { 'data-due-date': attributes['dueDate'] };
        },
      },
      done: {
        default: false,
        parseHTML: (element: HTMLElement) => element.classList.contains('task-done'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes['done']) return {};
          return { class: 'task-done' };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-task-widget]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    const assignee = HTMLAttributes['data-assignee'] || HTMLAttributes['assignee'] || '';
    const dueDate = HTMLAttributes['data-due-date'] || HTMLAttributes['dueDate'] || '';
    const done = HTMLAttributes['done'] || HTMLAttributes['class'] === 'task-done';
    const check = done ? '\u2611' : '\u2610';
    const dateStr = dueDate ? ` ${formatDate(String(dueDate))}` : '';
    const classes = ['task-widget'];
    if (done) classes.push('task-done');

    return [
      'span',
      { ...HTMLAttributes, 'data-task-widget': '', class: classes.join(' ') },
      `${check} ${assignee}${dateStr}`,
    ];
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('taskSuggestion'),
        char: '~',
        items: ({ query }: { query: string }) => {
          return mockUsers
            .filter(u => u.label.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 5);
        },
        command: ({ editor, range, props: user }: { editor: any; range: any; props: { id: string; label: string } }) => {
          const dateStr = window.prompt('Due date (YYYY-MM-DD, or leave empty):', '') || '';
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: 'taskWidget',
                attrs: { assignee: user.label, dueDate: dateStr, done: false },
              },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => {
          let element: HTMLDivElement | null = null;
          let currentItems: Array<{ id: string; label: string }> = [];
          let selectedIndex = 0;
          let currentCommand: ((props: any) => void) | null = null;

          const updateDOM = () => {
            if (!element) return;
            element.innerHTML = currentItems.length
              ? currentItems.map((user, i) =>
                  `<button class="mention-item${i === selectedIndex ? ' is-selected' : ''}" data-index="${i}">${user.label}</button>`
                ).join('')
              : '<div class="mention-item is-empty">No users found</div>';
          };

          return {
            onStart: (props: SuggestionProps<{ id: string; label: string }>) => {
              element = document.createElement('div');
              element.className = 'mention-list';
              element.style.position = 'fixed';
              element.style.zIndex = '9999';
              element.addEventListener('click', (e) => {
                const btn = (e.target as HTMLElement).closest('[data-index]');
                if (btn && currentCommand) {
                  currentCommand(currentItems[Number(btn.getAttribute('data-index'))]);
                }
              });

              currentItems = props.items;
              currentCommand = props.command;
              selectedIndex = 0;
              updateDOM();

              const rect = props.clientRect?.();
              if (rect && element) {
                element.style.left = `${rect.left}px`;
                element.style.top = `${rect.bottom + 4}px`;
              }
              document.body.appendChild(element);
            },
            onUpdate: (props: SuggestionProps<{ id: string; label: string }>) => {
              currentItems = props.items;
              currentCommand = props.command;
              selectedIndex = 0;
              updateDOM();

              const rect = props.clientRect?.();
              if (rect && element) {
                element.style.left = `${rect.left}px`;
                element.style.top = `${rect.bottom + 4}px`;
              }
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'ArrowUp') {
                selectedIndex = (selectedIndex + currentItems.length - 1) % currentItems.length;
                updateDOM();
                return true;
              }
              if (props.event.key === 'ArrowDown') {
                selectedIndex = (selectedIndex + 1) % currentItems.length;
                updateDOM();
                return true;
              }
              if (props.event.key === 'Enter') {
                if (currentItems[selectedIndex] && currentCommand) {
                  currentCommand(currentItems[selectedIndex]);
                }
                return true;
              }
              if (props.event.key === 'Escape') {
                return true;
              }
              return false;
            },
            onExit: () => {
              element?.remove();
              element = null;
            },
          };
        },
      } as any),
    ];
  },
});
