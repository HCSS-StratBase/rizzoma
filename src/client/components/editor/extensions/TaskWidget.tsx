import { Node } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionProps } from '@tiptap/suggestion';
import './TaskWidget.css';

type TaskUser = { id: string; label: string };

type TaskWidgetOptions = {
  /** Wave/topic ID the task belongs to. */
  waveId: string;
  /** Blip ID the task is anchored under (may be empty for topic root). */
  blipId: string;
  /** Currently signed-in user — always first in the assignee picker. */
  currentUser: TaskUser | null;
  /** Real participants from `/api/waves/:id/participants`. */
  participants: TaskUser[];
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/**
 * Merge the current user + wave participants into a deduped suggestion list.
 * Self is always first so "assign to me" is the default path.
 */
function buildAssigneeList(opts: TaskWidgetOptions): TaskUser[] {
  const out: TaskUser[] = [];
  const seen = new Set<string>();
  if (opts.currentUser) {
    out.push({ id: opts.currentUser.id, label: `${opts.currentUser.label} (me)` });
    seen.add(opts.currentUser.id);
  }
  for (const p of opts.participants) {
    if (seen.has(p.id)) continue;
    out.push(p);
    seen.add(p.id);
  }
  return out;
}

async function createTaskOnServer(
  opts: TaskWidgetOptions,
  assignee: TaskUser,
  dueDate: string,
): Promise<string | null> {
  try {
    // Strip the "(me)" suffix back out before sending to the server.
    const cleanLabel = assignee.label.replace(/ \(me\)$/, '');
    const r = await fetch('/api/tasks', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        waveId: opts.waveId,
        topicId: opts.waveId, // topic id == wave id in this schema
        blipId: opts.blipId,
        taskText: '',
        assigneeId: assignee.id,
        assigneeName: cleanLabel,
        dueDate: dueDate || undefined,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.id || data.taskId || null;
  } catch {
    return null;
  }
}

async function toggleTaskOnServer(taskId: string): Promise<boolean | null> {
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/toggle`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!r.ok) return null;
    const data = await r.json();
    return Boolean(data.isCompleted);
  } catch {
    return null;
  }
}

export const TaskWidgetNode = Node.create<TaskWidgetOptions>({
  name: 'taskWidget',
  group: 'inline',
  inline: true,
  atom: true,

  addOptions() {
    return {
      waveId: '',
      blipId: '',
      currentUser: null,
      participants: [],
    };
  },

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
      assigneeId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-assignee-id') || '',
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes['assigneeId']) return {};
          return { 'data-assignee-id': attributes['assigneeId'] };
        },
      },
      taskId: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-task-id') || '',
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes['taskId']) return {};
          return { 'data-task-id': attributes['taskId'] };
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
    // Mark overdue so CSS can color it red.
    if (dueDate && !done) {
      const d = new Date(String(dueDate));
      if (!isNaN(d.getTime()) && d.getTime() < Date.now()) classes.push('task-overdue');
    }

    return [
      'span',
      { ...HTMLAttributes, 'data-task-widget': '', class: classes.join(' ') },
      `${check} ${assignee}${dateStr}`,
    ];
  },

  addProseMirrorPlugins() {
    const opts = this.options;

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('taskSuggestion'),
        char: '~',
        items: ({ query }: { query: string }) => {
          const pool = buildAssigneeList(opts);
          return pool
            .filter(u => u.label.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 6);
        },
        command: ({ editor, range, props: user }: { editor: any; range: any; props: TaskUser }) => {
          const dateStr = window.prompt('Due date (YYYY-MM-DD, or leave empty):', '') || '';
          // Fire-and-forget the POST; we still insert the visual widget
          // immediately so the editor stays responsive. The server ID
          // is patched into the node attrs when the POST resolves.
          const cleanLabel = user.label.replace(/ \(me\)$/, '');
          const tempNode = {
            type: 'taskWidget',
            attrs: {
              assignee: cleanLabel,
              assigneeId: user.id,
              taskId: '',
              dueDate: dateStr,
              done: false,
            },
          };
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              tempNode,
              { type: 'text', text: ' ' },
            ])
            .run();
          // Patch in the real taskId once the server doc exists.
          createTaskOnServer(opts, user, dateStr).then(taskId => {
            if (!taskId) return;
            // Walk the document and patch the most recent taskWidget
            // matching this assignee that still has an empty taskId.
            const tr = editor.state.tr;
            let patched = false;
            editor.state.doc.descendants((node: any, pos: number) => {
              if (patched) return false;
              if (node.type.name !== 'taskWidget') return;
              if (node.attrs.taskId) return;
              if (node.attrs.assigneeId !== user.id) return;
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, taskId });
              patched = true;
              return false;
            });
            if (patched) editor.view.dispatch(tr);
          });
        },
        render: () => {
          let element: HTMLDivElement | null = null;
          let currentItems: TaskUser[] = [];
          let selectedIndex = 0;
          let currentCommand: ((props: TaskUser) => void) | null = null;

          const updateDOM = () => {
            if (!element) return;
            element.innerHTML = currentItems.length
              ? currentItems.map((user, i) =>
                  `<button class="mention-item${i === selectedIndex ? ' is-selected' : ''}" data-index="${i}">${user.label}</button>`
                ).join('')
              : '<div class="mention-item is-empty">No users found</div>';
          };

          return {
            onStart: (props: SuggestionProps<TaskUser>) => {
              element = document.createElement('div');
              element.className = 'mention-list';
              element.style.position = 'fixed';
              element.style.zIndex = '9999';
              element.addEventListener('click', (e) => {
                const btn = (e.target as HTMLElement).closest('[data-index]');
                if (btn && currentCommand) {
                  const item = currentItems[Number(btn.getAttribute('data-index'))];
                  if (item) currentCommand(item);
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
            onUpdate: (props: SuggestionProps<TaskUser>) => {
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
              if (!currentItems.length) return false;
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
                const item = currentItems[selectedIndex];
                if (item && currentCommand) {
                  currentCommand(item);
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

/**
 * Click handler for rendered task widgets — toggles the server-side task
 * state and flips the `task-done` class. Attached at the document level so
 * it works for every blip on the page without needing per-widget listeners.
 */
export function installTaskWidgetToggleHandler() {
  if (typeof document === 'undefined') return;
  if ((window as any).__rizzomaTaskToggleInstalled) return;
  (window as any).__rizzomaTaskToggleInstalled = true;
  document.addEventListener('click', async (e) => {
    const target = (e.target as HTMLElement)?.closest('[data-task-widget]');
    if (!target) return;
    const taskId = target.getAttribute('data-task-id');
    if (!taskId) return;
    e.stopPropagation();
    const nextState = await toggleTaskOnServer(taskId);
    if (nextState === null) return;
    target.classList.toggle('task-done', nextState);
    target.classList.toggle('task-overdue', !nextState && (() => {
      const raw = target.getAttribute('data-due-date') || '';
      if (!raw) return false;
      const d = new Date(raw);
      return !isNaN(d.getTime()) && d.getTime() < Date.now();
    })());
    // Flip the leading checkbox glyph in the text content.
    const txt = target.textContent || '';
    if (nextState && txt.startsWith('\u2610')) target.textContent = '\u2611' + txt.slice(1);
    else if (!nextState && txt.startsWith('\u2611')) target.textContent = '\u2610' + txt.slice(1);
  }, true);
}
