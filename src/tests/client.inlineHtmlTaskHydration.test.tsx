import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StarterKit from '@tiptap/starter-kit';
import { Editor } from '@tiptap/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  api: vi.fn(),
  ensureCsrf: vi.fn(async () => 'csrf-test'),
}));

vi.mock('../client/lib/api', () => ({
  api: apiMocks.api,
  ensureCsrf: apiMocks.ensureCsrf,
}));

import { InlineHtmlRenderer } from '../client/components/blip/InlineHtmlRenderer';
import {
  requestTaskCompletionHydration,
  TaskWidgetNode,
} from '../client/components/editor/extensions/TaskWidget';

const TASK_ID = 'task:11111111-1111-4111-8111-111111111111';
const SECOND_TASK_ID = 'task:22222222-2222-4222-8222-222222222222';
const TASK_HTML = `<p>Ship release <span class="task-widget" data-task-widget="" data-task-id="${TASK_ID}" data-assignee-id="viewer" data-assignee="Viewer">\u2610 Viewer</span></p>`;
const TWO_TASK_HTML = `<p>First <span class="task-widget" data-task-widget="" data-task-id="${TASK_ID}" data-assignee-id="viewer" data-assignee="Viewer">\u2610 Viewer</span> Second <span class="task-widget" data-task-widget="" data-task-id="${SECOND_TASK_ID}" data-assignee-id="viewer" data-assignee="Viewer">\u2610 Viewer</span></p>`;
const BY_BLIP_PATH = '/api/tasks/by-blip/topic-root-id';
const TOGGLE_PATH = `/api/tasks/${encodeURIComponent(TASK_ID)}/toggle`;

describe('parity view task hydration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    apiMocks.api.mockReset();
    apiMocks.ensureCsrf.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderView = (onUpdate = vi.fn(), html = TASK_HTML) => {
    act(() => {
      root.render(
        <div onClick={onUpdate}>
          <InlineHtmlRenderer
            taskBlipId="topic-root-id"
            html={html}
            inlineChildren={[]}
            expandedSet={new Set()}
            renderInlineChild={() => null}
          />
        </div>,
      );
    });
    return onUpdate;
  };

  const flushReactAsyncWork = async () => {
    for (let pass = 0; pass < 4; pass += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  };

  it('renders a static unchecked topic-root task as checked after authoritative hydration', async () => {
    apiMocks.api.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tasks: [{ id: TASK_ID, isCompleted: true, canToggle: false }] },
    });

    const onUpdate = renderView();

    await flushReactAsyncWork();
    const widget = container.querySelector<HTMLElement>('[data-task-widget]');
    expect(widget?.classList.contains('task-done')).toBe(true);
    expect(widget?.textContent).toBe('\u2611 Viewer');
    expect(apiMocks.api).toHaveBeenCalledWith(
      BY_BLIP_PATH,
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('sends exactly one nonqueued toggle and updates the visible glyph only after confirmation', async () => {
    let resolveToggle!: (value: unknown) => void;
    apiMocks.api.mockImplementation((path: string) => {
      if (path === BY_BLIP_PATH) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { tasks: [{ id: TASK_ID, isCompleted: false, canToggle: true }] },
        });
      }
      if (path === TOGGLE_PATH) {
        return new Promise((resolve) => { resolveToggle = resolve; });
      }
      throw new Error(`Unexpected API path: ${path}`);
    });

    const onUpdate = renderView();
    await flushReactAsyncWork();
    expect(container.querySelector('[data-task-widget]')?.textContent).toBe('\u2610 Viewer');
    const widget = container.querySelector<HTMLElement>('[data-task-widget]')!;

    act(() => {
      widget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      widget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    await flushReactAsyncWork();
    expect(apiMocks.ensureCsrf).toHaveBeenCalledTimes(1);
    expect(apiMocks.api.mock.calls.filter(([path]) => path === TOGGLE_PATH)).toHaveLength(1);
    expect(apiMocks.api).toHaveBeenCalledWith(
      TOGGLE_PATH,
      expect.objectContaining({
        method: 'POST',
        queueable: false,
      }),
    );
    expect(container.querySelector('[data-task-widget]')?.textContent).toBe('\u2610 Viewer');
    expect(onUpdate).not.toHaveBeenCalled();

    await act(async () => {
      resolveToggle({ ok: true, status: 200, data: { isCompleted: true } });
      await Promise.resolve();
    });

    await flushReactAsyncWork();
    const updated = container.querySelector<HTMLElement>('[data-task-widget]');
    expect(updated?.textContent).toBe('\u2611 Viewer');
    expect(updated?.classList.contains('task-done')).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('keeps the visible task unchecked after a failed toggle and creates no phantom state', async () => {
    apiMocks.api.mockImplementation(async (path: string) => {
      if (path === BY_BLIP_PATH) {
        return {
          ok: true,
          status: 200,
          data: { tasks: [{ id: TASK_ID, isCompleted: false, canToggle: true }] },
        };
      }
      if (path === TOGGLE_PATH) return { ok: false, status: 503, data: {} };
      throw new Error(`Unexpected API path: ${path}`);
    });

    const onUpdate = renderView();
    await flushReactAsyncWork();
    expect(container.querySelector('[data-task-widget]')?.textContent).toBe('\u2610 Viewer');

    act(() => {
      container.querySelector<HTMLElement>('[data-task-widget]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });

    await flushReactAsyncWork();
    expect(apiMocks.api.mock.calls.filter(([path]) => path === BY_BLIP_PATH).length).toBeGreaterThanOrEqual(2);
    expect(apiMocks.api.mock.calls.filter(([path]) => path === TOGGLE_PATH)).toHaveLength(1);
    expect(apiMocks.api.mock.calls.some(([path, init]) => path === '/api/tasks' && init?.method === 'POST')).toBe(false);
    const widget = container.querySelector<HTMLElement>('[data-task-widget]');
    expect(widget?.textContent).toBe('\u2610 Viewer');
    expect(widget?.classList.contains('task-done')).toBe(false);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('renders a hydrated public task without interactive button semantics when canToggle is false', async () => {
    apiMocks.api.mockResolvedValue({
      ok: true,
      status: 200,
      data: { tasks: [{ id: TASK_ID, isCompleted: true, canToggle: false }] },
    });

    renderView();
    await flushReactAsyncWork();

    const widget = container.querySelector<HTMLElement>('[data-task-widget]')!;
    expect(widget.textContent).toBe('\u2611 Viewer');
    expect(widget.getAttribute('role')).toBeNull();
    expect(widget.getAttribute('tabindex')).toBeNull();
    expect(widget.classList.contains('task-readonly')).toBe(true);
    widget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushReactAsyncWork();
    expect(apiMocks.ensureCsrf).not.toHaveBeenCalled();
    expect(apiMocks.api.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('does not let a stale full hydrate overwrite a different task confirmed later', async () => {
    const secondTogglePath = `/api/tasks/${encodeURIComponent(SECOND_TASK_ID)}/toggle`;
    let byBlipCalls = 0;
    let resolveStaleHydration!: (value: unknown) => void;
    let resolveSecondToggle!: (value: unknown) => void;
    apiMocks.api.mockImplementation((path: string) => {
      if (path === BY_BLIP_PATH) {
        byBlipCalls += 1;
        if (byBlipCalls === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            data: { tasks: [
              { id: TASK_ID, isCompleted: false, canToggle: true },
              { id: SECOND_TASK_ID, isCompleted: false, canToggle: true },
            ] },
          });
        }
        if (byBlipCalls === 2) {
          return new Promise((resolve) => { resolveStaleHydration = resolve; });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { tasks: [
            { id: TASK_ID, isCompleted: false, canToggle: true },
            { id: SECOND_TASK_ID, isCompleted: true, canToggle: true },
          ] },
        });
      }
      if (path === TOGGLE_PATH) return Promise.resolve({ ok: false, status: 503, data: {} });
      if (path === secondTogglePath) {
        return new Promise((resolve) => { resolveSecondToggle = resolve; });
      }
      throw new Error(`Unexpected API path: ${path}`);
    });

    renderView(vi.fn(), TWO_TASK_HTML);
    await flushReactAsyncWork();
    const widgets = () => [...container.querySelectorAll<HTMLElement>('[data-task-widget]')];

    act(() => widgets()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await flushReactAsyncWork();
    await vi.waitFor(() => expect(byBlipCalls).toBe(2));

    expect(widgets()[1]?.getAttribute('role')).toBe('button');
    act(() => widgets()[1]!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await vi.waitFor(() => expect(resolveSecondToggle).toBeTypeOf('function'));
    await act(async () => {
      resolveSecondToggle({ ok: true, status: 200, data: { isCompleted: true } });
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(widgets()[1]?.textContent).toBe('\u2611 Viewer'));

    await act(async () => {
      resolveStaleHydration({
        ok: true,
        status: 200,
        data: { tasks: [
          { id: TASK_ID, isCompleted: false, canToggle: true },
          { id: SECOND_TASK_ID, isCompleted: false, canToggle: true },
        ] },
      });
      await Promise.resolve();
    });
    await flushReactAsyncWork();

    expect(widgets()[1]?.textContent).toBe('\u2611 Viewer');
    expect(widgets()[1]?.classList.contains('task-done')).toBe(true);
  });

  it('finishes a view toggle across unmount before the newly loaded editor hydrates', async () => {
    let authoritativeState = false;
    let resolveToggle!: (value: unknown) => void;
    apiMocks.api.mockImplementation((path: string) => {
      if (path === BY_BLIP_PATH) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { tasks: [{ id: TASK_ID, isCompleted: authoritativeState, canToggle: true }] },
        });
      }
      if (path === TOGGLE_PATH) {
        return new Promise((resolve) => { resolveToggle = resolve; });
      }
      throw new Error(`Unexpected API path: ${path}`);
    });

    renderView();
    await flushReactAsyncWork();
    await vi.waitFor(() => {
      expect(container.querySelector<HTMLElement>('[data-task-widget]')?.getAttribute('role')).toBe('button');
    });
    act(() => {
      container.querySelector<HTMLElement>('[data-task-widget]')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });
    await flushReactAsyncWork();
    await vi.waitFor(() => expect(apiMocks.api.mock.calls.filter(([path]) => path === TOGGLE_PATH)).toHaveLength(1));

    // Entering edit replaces the parity-view renderer while its POST is in
    // flight. The write continues, and the empty root editor's first task
    // hydration waits for that known mutation to settle.
    act(() => root.render(null));
    const editorElement = document.createElement('div');
    document.body.appendChild(editorElement);
    const editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit as any,
        TaskWidgetNode.configure({
          waveId: 'topic-root-id',
          blipId: 'topic-root-id',
          currentUser: null,
          participants: [],
        }),
      ],
      content: '<p></p>',
    });
    requestTaskCompletionHydration(editor);
    editor.commands.setContent(TASK_HTML);
    await Promise.resolve();
    expect(apiMocks.api.mock.calls.filter(([path]) => path === BY_BLIP_PATH)).toHaveLength(1);

    authoritativeState = true;
    resolveToggle({ ok: true, status: 200, data: { isCompleted: true } });
    await vi.waitFor(() => {
      let done = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === 'taskWidget' && node.attrs['taskId'] === TASK_ID) {
          done = Boolean(node.attrs['done']);
          return false;
        }
        return true;
      });
      expect(done).toBe(true);
    });
    expect(apiMocks.api.mock.calls.filter(([path]) => path === BY_BLIP_PATH)).toHaveLength(2);
    expect(editorElement.querySelector('[data-task-widget]')?.textContent).toContain('\u2611');
    editor.destroy();
    editorElement.remove();
  });
});
