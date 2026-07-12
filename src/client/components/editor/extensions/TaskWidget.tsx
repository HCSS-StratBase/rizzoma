import { Node, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionProps } from '@tiptap/suggestion';
import { api, ensureCsrf } from '../../../lib/api';
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

export type TaskCompletion = { id: string; isCompleted: boolean; canToggle?: boolean };
type TaskCompletionResponse = { tasks?: TaskCompletion[] };

export type TaskCompletionSnapshot = {
  completions: Map<string, boolean>;
  toggleableTaskIds: Set<string>;
};

const TASK_WIDGET_SYNC_META = 'rizzomaTaskWidgetServerSync';
const TASK_WIDGET_REFRESH_META = 'rizzomaTaskWidgetRefresh';
const taskWidgetDurabilityKey = new PluginKey<{ refreshRequest: number }>('taskWidgetDurability');

type PendingTaskMutation = {
  blipId: string;
  promise: Promise<boolean | null>;
};

// A view-mode task toggle can still commit after React replaces the static
// renderer with TipTap. Keep writes outside either component's lifecycle so
// they are never aborted into an ambiguous client/server state. Hydration
// waits for every mutation on the blip before reading the side documents.
const pendingTaskMutations = new Map<string, PendingTaskMutation>();
const pendingTaskMutationsByBlip = new Map<string, Set<Promise<boolean | null>>>();
const taskMutationRevisions = new Map<string, number>();

function bumpTaskMutationRevision(blipId: string): void {
  taskMutationRevisions.set(blipId, (taskMutationRevisions.get(blipId) || 0) + 1);
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

async function waitForPendingTaskMutations(blipId: string, signal?: AbortSignal): Promise<void> {
  for (;;) {
    if (signal?.aborted) throw abortError();
    const pending = [...(pendingTaskMutationsByBlip.get(blipId) || [])];
    if (pending.length === 0) return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      void Promise.allSettled(pending).then(finish);
    });
  }
}

function taskIdsKey(view: Pick<EditorView, 'state'>): string {
  const ids: string[] = [];
  view.state.doc.descendants((node) => {
    if (node.type.name !== 'taskWidget') return true;
    const taskId = String(node.attrs['taskId'] || '');
    if (taskId) ids.push(taskId);
    return false;
  });
  return [...new Set(ids)].sort().join(',');
}

/**
 * Force the durability plugin to refresh on the next editor lifecycle edge.
 * Call this before loading/switching content when entering edit mode: an empty
 * topic-root editor stays request-free, while an already-populated editor is
 * revalidated after a confirmed parity-view toggle.
 */
export function requestTaskCompletionHydration(editor: Editor | null | undefined): boolean {
  if (!editor || editor.isDestroyed) return false;
  const transaction = editor.state.tr
    .setMeta(TASK_WIDGET_REFRESH_META, true)
    .setMeta('addToHistory', false)
    .setMeta('preventUpdate', true);
  editor.view.dispatch(transaction);
  return true;
}

export function formatTaskDate(dateStr: string): string {
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

function createTaskId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `task:${globalThis.crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `task:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function toggleTaskOnServer(taskId: string, blipId: string): Promise<boolean | null> {
  const existing = pendingTaskMutations.get(taskId);
  if (existing) return existing.promise;

  bumpTaskMutationRevision(blipId);
  const promise = (async (): Promise<boolean | null> => {
    try {
      await ensureCsrf();
      const r = await api<{ isCompleted?: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}/toggle`, {
        method: 'POST',
        queueable: false,
      });
      if (!r.ok) return null;
      const data = r.data as { isCompleted?: boolean };
      return typeof data.isCompleted === 'boolean' ? data.isCompleted : null;
    } catch {
      return null;
    }
  })();

  pendingTaskMutations.set(taskId, { blipId, promise });
  const forBlip = pendingTaskMutationsByBlip.get(blipId) || new Set<Promise<boolean | null>>();
  forBlip.add(promise);
  pendingTaskMutationsByBlip.set(blipId, forBlip);
  void promise.finally(() => {
    if (pendingTaskMutations.get(taskId)?.promise === promise) pendingTaskMutations.delete(taskId);
    const currentForBlip = pendingTaskMutationsByBlip.get(blipId);
    currentForBlip?.delete(promise);
    if (currentForBlip?.size === 0) pendingTaskMutationsByBlip.delete(blipId);
    // Both success and failure settle the ordering boundary. A subsequent
    // snapshot must be newer than every request that began before this edge.
    bumpTaskMutationRevision(blipId);
  });
  return promise;
}

export async function loadTaskCompletionSnapshot(
  blipId: string,
  signal?: AbortSignal,
): Promise<TaskCompletionSnapshot | null> {
  if (!blipId) return { completions: new Map(), toggleableTaskIds: new Set() };
  try {
    // If a toggle crosses the view -> editor boundary, wait for its known
    // server result and only then issue GET. If another task mutates while GET
    // is running, discard that stale full snapshot and read again.
    while (!signal?.aborted) {
      await waitForPendingTaskMutations(blipId, signal);
      const revision = taskMutationRevisions.get(blipId) || 0;
      const response = await api<TaskCompletionResponse>(
        `/api/tasks/by-blip/${encodeURIComponent(blipId)}`,
        { cache: 'no-store', signal },
      );
      if (!response.ok || !response.data || typeof response.data !== 'object') return null;
      await waitForPendingTaskMutations(blipId, signal);
      if (revision !== (taskMutationRevisions.get(blipId) || 0)) continue;
      const tasks = Array.isArray(response.data.tasks) ? response.data.tasks : [];
      const validTasks = tasks.filter(
        (task): task is TaskCompletion => typeof task?.id === 'string',
      );
      return {
        completions: new Map(validTasks.map((task) => [task.id, Boolean(task.isCompleted)])),
        toggleableTaskIds: new Set(
          validTasks.filter((task) => task.canToggle === true).map((task) => task.id),
        ),
      };
    }
    return null;
  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError') return null;
    return null;
  }
}

/**
 * Reconcile rendered task widgets with the authoritative task side-docs.
 * `preventUpdate` keeps this server snapshot out of REST autosave: completion
 * is persisted by `/api/tasks/:id/toggle`, not by stale HTML attributes.
 */
export function applyTaskCompletionSnapshot(
  view: Pick<EditorView, 'state' | 'dispatch'>,
  completions: ReadonlyMap<string, boolean>,
): number {
  const transaction = view.state.tr;
  let changed = 0;
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'taskWidget') return true;
    const taskId = String(node.attrs['taskId'] || '');
    if (!taskId || !completions.has(taskId)) return false;
    const isCompleted = completions.get(taskId) === true;
    if (Boolean(node.attrs['done']) === isCompleted) return false;
    transaction.setNodeMarkup(pos, undefined, { ...node.attrs, done: isCompleted });
    changed += 1;
    return false;
  });
  if (changed > 0) {
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('preventUpdate', true);
    transaction.setMeta(TASK_WIDGET_SYNC_META, true);
    view.dispatch(transaction);
  }
  return changed;
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
    const dateStr = dueDate ? ` ${formatTaskDate(String(dueDate))}` : '';
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
    let activeView: EditorView | null = null;
    let hydrationGeneration = 0;
    let destroyed = false;
    let hydrationController: AbortController | null = null;
    let lastTaskIdsKey = '';
    let lastRefreshRequest = 0;
    let toggleableTaskIds = new Set<string>();
    const pendingToggles = new Set<string>();

    const hydrate = async (view: EditorView) => {
      const requestedTaskIdsKey = taskIdsKey(view);
      if (!requestedTaskIdsKey) {
        hydrationGeneration += 1;
        hydrationController?.abort();
        hydrationController = null;
        toggleableTaskIds = new Set();
        return;
      }
      const generation = ++hydrationGeneration;
      hydrationController?.abort();
      hydrationController = new AbortController();
      const snapshot = await loadTaskCompletionSnapshot(opts.blipId, hydrationController.signal);
      if (
        destroyed
        || generation !== hydrationGeneration
        || taskIdsKey(view) !== requestedTaskIdsKey
      ) return;
      // Do not retain authority from an older identity/access snapshot when
      // the current refresh is denied or fails. Generation checks come first
      // so an aborted stale request cannot revoke a newer successful grant.
      if (!snapshot) {
        toggleableTaskIds = new Set();
        return;
      }
      toggleableTaskIds = snapshot.toggleableTaskIds;
      applyTaskCompletionSnapshot(view, snapshot.completions);
    };

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
          const cleanLabel = user.label.replace(/ \(me\)$/, '');
          // The task document is derived only after this node is durably saved
          // with its blip. This stable client reference lets the server
          // reconcile idempotently without creating a phantom task first.
          const taskId = createTaskId();
          const tempNode = {
            type: 'taskWidget',
            attrs: {
              assignee: cleanLabel,
              assigneeId: user.id,
              taskId,
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
        },
        render: () => {
          let element: HTMLDivElement | null = null;
          let currentItems: TaskUser[] = [];
          let selectedIndex = 0;
          let currentCommand: ((props: TaskUser) => void) | null = null;

          const updateDOM = () => {
            if (!element) return;
            element.replaceChildren();
            if (currentItems.length) {
              currentItems.forEach((user, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `mention-item${index === selectedIndex ? ' is-selected' : ''}`;
                button.dataset['index'] = String(index);
                button.textContent = user.label;
                element!.appendChild(button);
              });
            } else {
              const empty = document.createElement('div');
              empty.className = 'mention-item is-empty';
              empty.textContent = 'No users found';
              element.appendChild(empty);
            }
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
      new Plugin({
        key: taskWidgetDurabilityKey,
        state: {
          init: () => ({ refreshRequest: 0 }),
          apply: (transaction, value) => transaction.getMeta(TASK_WIDGET_REFRESH_META)
            ? { refreshRequest: value.refreshRequest + 1 }
            : value,
        },
        view: (view) => {
          activeView = view;
          destroyed = false;
          lastTaskIdsKey = taskIdsKey(view);
          lastRefreshRequest = taskWidgetDurabilityKey.getState(view.state)?.refreshRequest || 0;
          // Large topics keep a TipTap editor behind every mounted blip. Only
          // task-bearing documents may issue an authorized by-blip snapshot.
          if (lastTaskIdsKey) void hydrate(view);
          return {
            update: (updatedView) => {
              activeView = updatedView;
              const nextTaskIdsKey = taskIdsKey(updatedView);
              const nextRefreshRequest = taskWidgetDurabilityKey.getState(updatedView.state)?.refreshRequest || 0;
              if (
                nextTaskIdsKey === lastTaskIdsKey
                && nextRefreshRequest === lastRefreshRequest
              ) return;
              lastTaskIdsKey = nextTaskIdsKey;
              lastRefreshRequest = nextRefreshRequest;
              if (nextTaskIdsKey) {
                void hydrate(updatedView);
              } else {
                hydrationGeneration += 1;
                hydrationController?.abort();
                hydrationController = null;
                toggleableTaskIds = new Set();
              }
            },
            destroy: () => {
              destroyed = true;
              hydrationGeneration += 1;
              hydrationController?.abort();
              hydrationController = null;
              activeView = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            click: (_view, event) => {
              const eventTarget = event.target;
              if (!(eventTarget instanceof Element)) return false;
              const target = eventTarget.closest<HTMLElement>('[data-task-widget]');
              const taskId = target?.getAttribute('data-task-id') || '';
              if (!taskId) return false;
              // Completion is visible to every reader, but only the author or
              // assignee receives canToggle=true from the access-checked API.
              if (!toggleableTaskIds.has(taskId)) return false;

              event.preventDefault();
              event.stopPropagation();
              if (pendingToggles.has(taskId)) return true;
              pendingToggles.add(taskId);
              // A snapshot started before this mutation must never overwrite
              // the newer toggle response if the requests complete out of order.
              hydrationGeneration += 1;
              hydrationController?.abort();

              void toggleTaskOnServer(taskId, opts.blipId).then((isCompleted) => {
                if (destroyed || !activeView) return;
                if (isCompleted === null) {
                  void hydrate(activeView);
                  return;
                }
                // A full snapshot started by a different failed task can be
                // older than this confirmed write. Invalidate it before
                // merging the per-task server result.
                hydrationGeneration += 1;
                hydrationController?.abort();
                applyTaskCompletionSnapshot(activeView, new Map([[taskId, isCompleted]]));
              }).finally(() => {
                pendingToggles.delete(taskId);
              });
              return true;
            },
          },
        },
      }),
    ];
  },
});
