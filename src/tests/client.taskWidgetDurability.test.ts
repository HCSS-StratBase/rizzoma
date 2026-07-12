import StarterKit from '@tiptap/starter-kit';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskWidgetNode } from '../client/components/editor/extensions/TaskWidget';

const apiMocks = vi.hoisted(() => ({
  api: vi.fn(),
  ensureCsrf: vi.fn(async () => 'csrf-test'),
}));

vi.mock('../client/lib/api', () => ({
  api: apiMocks.api,
  ensureCsrf: apiMocks.ensureCsrf,
}));

const TASK_ID = 'task:11111111-1111-4111-8111-111111111111';
const UNCHECKED_HTML = `<p>Ship release <span data-task-widget="" data-task-id="${TASK_ID}" data-assignee-id="viewer" data-assignee="Viewer"></span></p>`;

function createTaskEditor(
  content = UNCHECKED_HTML,
  onUpdate?: () => void,
): { editor: Editor; element: HTMLDivElement } {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit as any,
      TaskWidgetNode.configure({
        waveId: 'topic-private',
        blipId: 'blip-private',
        currentUser: null,
        participants: [],
      }),
    ],
    content,
    onUpdate,
  });
  return { editor, element };
}

function taskDone(editor: Editor): boolean | undefined {
  let done: boolean | undefined;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'taskWidget' && node.attrs['taskId'] === TASK_ID) {
      done = Boolean(node.attrs['done']);
      return false;
    }
    return true;
  });
  return done;
}

describe('task widget durable completion', () => {
  beforeEach(() => {
    apiMocks.api.mockReset();
    apiMocks.ensureCsrf.mockClear();
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('hydrates an unchecked stored widget from the authoritative by-blip state on reload', async () => {
    apiMocks.api.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tasks: [{ id: TASK_ID, isCompleted: true }] },
    });
    const onUpdate = vi.fn();
    const { editor, element } = createTaskEditor(UNCHECKED_HTML, onUpdate);

    await vi.waitFor(() => expect(taskDone(editor)).toBe(true));

    const widget = element.querySelector<HTMLElement>('[data-task-widget]');
    expect(widget?.classList.contains('task-done')).toBe(true);
    expect(widget?.textContent).toContain('\u2611');
    expect(apiMocks.api).toHaveBeenCalledWith(
      '/api/tasks/by-blip/blip-private',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
    expect(onUpdate).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('uses the nonqueued server toggle result and rehydrates that state in a fresh editor', async () => {
    let authoritativeState = false;
    apiMocks.api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/tasks/by-blip/blip-private') {
        return { ok: true, status: 200, data: { tasks: [{ id: TASK_ID, isCompleted: authoritativeState }] } };
      }
      if (path === `/api/tasks/${encodeURIComponent(TASK_ID)}/toggle` && init?.method === 'POST') {
        authoritativeState = !authoritativeState;
        return { ok: true, status: 200, data: { isCompleted: authoritativeState } };
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    const onUpdate = vi.fn();
    const first = createTaskEditor(UNCHECKED_HTML, onUpdate);
    await vi.waitFor(() => expect(taskDone(first.editor)).toBe(false));
    first.element.querySelector<HTMLElement>('[data-task-widget]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => expect(taskDone(first.editor)).toBe(true));
    expect(apiMocks.ensureCsrf).toHaveBeenCalledTimes(1);
    expect(apiMocks.api).toHaveBeenCalledWith(
      `/api/tasks/${encodeURIComponent(TASK_ID)}/toggle`,
      { method: 'POST', queueable: false },
    );
    expect(onUpdate).not.toHaveBeenCalled();
    first.editor.destroy();
    first.element.remove();

    // Persisted blip HTML is intentionally still unchecked. A newly mounted
    // editor must render the completed server side-doc, not that stale attr.
    const reloaded = createTaskEditor(UNCHECKED_HTML);
    await vi.waitFor(() => expect(taskDone(reloaded.editor)).toBe(true));
    expect(reloaded.element.querySelector('[data-task-widget]')?.textContent).toContain('\u2611');
    reloaded.editor.destroy();
  });
});
