import StarterKit from '@tiptap/starter-kit';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requestTaskCompletionHydration,
  TaskWidgetNode,
} from '../client/components/editor/extensions/TaskWidget';

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
      data: { tasks: [{ id: TASK_ID, isCompleted: true, canToggle: true }] },
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
        return { ok: true, status: 200, data: { tasks: [{ id: TASK_ID, isCompleted: authoritativeState, canToggle: true }] } };
      }
      if (path === `/api/tasks/${encodeURIComponent(TASK_ID)}/toggle` && init?.method === 'POST') {
        authoritativeState = !authoritativeState;
        return { ok: true, status: 200, data: { isCompleted: authoritativeState } };
      }
      throw new Error(`Unexpected API request: ${path}`);
    });

    const onUpdate = vi.fn();
    const first = createTaskEditor(UNCHECKED_HTML, onUpdate);
    await vi.waitFor(() => {
      expect(taskDone(first.editor)).toBe(false);
      expect(apiMocks.api.mock.calls.filter(([path]) => path === '/api/tasks/by-blip/blip-private')).toHaveLength(1);
    });
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

  it('does not request a by-blip snapshot for a taskless editor', async () => {
    const { editor } = createTaskEditor('<p>No task widgets here</p>');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiMocks.api).not.toHaveBeenCalled();
    requestTaskCompletionHydration(editor);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiMocks.api).not.toHaveBeenCalled();
    editor.destroy();
  });

  it('hydrates task content loaded after the topic-root editor was created empty', async () => {
    apiMocks.api.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tasks: [{ id: TASK_ID, isCompleted: true, canToggle: true }] },
    });
    const { editor, element } = createTaskEditor('<p></p>');

    requestTaskCompletionHydration(editor);
    expect(apiMocks.api).not.toHaveBeenCalled();
    editor.commands.setContent(UNCHECKED_HTML);

    await vi.waitFor(() => expect(taskDone(editor)).toBe(true));
    expect(apiMocks.api.mock.calls.filter(([path]) => path === '/api/tasks/by-blip/blip-private')).toHaveLength(1);
    expect(element.querySelector('[data-task-widget]')?.textContent).toContain('\u2611');
    editor.destroy();
  });

  it('does not send a toggle when the access snapshot marks the task read-only', async () => {
    apiMocks.api.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tasks: [{ id: TASK_ID, isCompleted: false, canToggle: false }] },
    });
    const { editor, element } = createTaskEditor();
    await vi.waitFor(() => expect(apiMocks.api).toHaveBeenCalledTimes(1));

    element.querySelector<HTMLElement>('[data-task-widget]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiMocks.ensureCsrf).not.toHaveBeenCalled();
    expect(apiMocks.api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(taskDone(editor)).toBe(false);
    editor.destroy();
  });

  it('revokes stale editor authority on denial and recovers it after reconnect', async () => {
    let byBlipCalls = 0;
    let accessRestored = false;
    apiMocks.api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/tasks/by-blip/blip-private') {
        byBlipCalls += 1;
        if (byBlipCalls === 1 || accessRestored) {
          return {
            ok: true,
            status: 200,
            data: { tasks: [{ id: TASK_ID, isCompleted: false, canToggle: true }] },
          };
        }
        return { ok: false, status: 403, data: {} };
      }
      if (path === `/api/tasks/${encodeURIComponent(TASK_ID)}/toggle` && init?.method === 'POST') {
        return { ok: true, status: 200, data: { isCompleted: true } };
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
    const { editor, element } = createTaskEditor();
    await vi.waitFor(() => expect(byBlipCalls).toBe(1));

    requestTaskCompletionHydration(editor);
    await vi.waitFor(() => expect(byBlipCalls).toBe(2));
    element.querySelector<HTMLElement>('[data-task-widget]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(apiMocks.ensureCsrf).not.toHaveBeenCalled();
    expect(apiMocks.api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(taskDone(editor)).toBe(false);

    accessRestored = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(byBlipCalls).toBe(3));
    element.querySelector<HTMLElement>('[data-task-widget]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => {
      expect(apiMocks.api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    });
    await vi.waitFor(() => expect(taskDone(editor)).toBe(true));
    editor.destroy();
  });

  it('makes a newly inserted task toggleable after its durable save refreshes side-doc authority', async () => {
    let saved = false;
    apiMocks.api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/api/tasks/by-blip/blip-private') {
        return {
          ok: true,
          status: 200,
          data: { tasks: saved ? [{ id: TASK_ID, isCompleted: false, canToggle: true }] : [] },
        };
      }
      if (path === `/api/tasks/${encodeURIComponent(TASK_ID)}/toggle` && init?.method === 'POST') {
        return { ok: true, status: 200, data: { isCompleted: true } };
      }
      throw new Error(`Unexpected API request: ${path}`);
    });
    const { editor, element } = createTaskEditor('<p></p>');

    editor.commands.setContent(UNCHECKED_HTML);
    await vi.waitFor(() => {
      expect(apiMocks.api.mock.calls.filter(([path]) => path === '/api/tasks/by-blip/blip-private')).toHaveLength(1);
    });
    element.querySelector<HTMLElement>('[data-task-widget]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiMocks.api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);

    // Mirrors RizzomaBlip/RizzomaTopicDetail after their successful durable
    // content save. The side document now exists and grants canToggle.
    saved = true;
    requestTaskCompletionHydration(editor);
    await vi.waitFor(() => {
      expect(apiMocks.api.mock.calls.filter(([path]) => path === '/api/tasks/by-blip/blip-private')).toHaveLength(2);
    });
    element.querySelector<HTMLElement>('[data-task-widget]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => expect(taskDone(editor)).toBe(true));
    expect(apiMocks.api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
    editor.destroy();
  });
});
