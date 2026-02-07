import { Node } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionProps } from '@tiptap/suggestion';

// Mock tags – in production these would be extracted from topic content
const defaultTags = [
  'todo', 'done', 'important', 'question', 'idea',
  'bug', 'feature', 'discuss', 'blocked', 'review',
];

export const TagNode = Node.create({
  name: 'tag',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      tag: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-tag'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes['tag']) return {};
          return { 'data-tag': attributes['tag'] };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-tag]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      'span',
      { ...HTMLAttributes, class: 'tag-widget' },
      `#${HTMLAttributes['data-tag'] || HTMLAttributes['tag'] || ''}`,
    ];
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('tagSuggestion'),
        char: '#',
        items: ({ query }: { query: string }) => {
          return defaultTags
            .filter(t => t.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8);
        },
        command: ({ editor, range, props: tag }: { editor: any; range: any; props: string }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              { type: 'tag', attrs: { tag } },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        render: () => {
          let element: HTMLDivElement | null = null;
          let currentItems: string[] = [];
          let selectedIndex = 0;
          let currentCommand: ((props: string) => void) | null = null;

          const updateDOM = () => {
            if (!element) return;
            element.innerHTML = currentItems.length
              ? currentItems.map((tag, i) =>
                  `<button class="mention-item${i === selectedIndex ? ' is-selected' : ''}" data-index="${i}">#${tag}</button>`
                ).join('')
              : '<div class="mention-item is-empty">No tags found</div>';
          };

          return {
            onStart: (props: SuggestionProps<string>) => {
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

              currentItems = props.items as string[];
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
            onUpdate: (props: SuggestionProps<string>) => {
              currentItems = props.items as string[];
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
