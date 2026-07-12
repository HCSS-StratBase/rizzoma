import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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

const TASK_ID = 'task:11111111-1111-4111-8111-111111111111';
const TASK_HTML = `<p>Ship release <span class="task-widget" data-task-widget="" data-task-id="${TASK_ID}" data-assignee-id="viewer" data-assignee="Viewer">\u2610 Viewer</span></p>`;
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

  const renderView = (onUpdate = vi.fn()) => {
    act(() => {
      root.render(
        <div onClick={onUpdate}>
          <InlineHtmlRenderer
            taskBlipId="topic-root-id"
            html={TASK_HTML}
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
      data: { tasks: [{ id: TASK_ID, isCompleted: true }] },
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
          data: { tasks: [{ id: TASK_ID, isCompleted: false }] },
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
        signal: expect.any(AbortSignal),
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
          data: { tasks: [{ id: TASK_ID, isCompleted: false }] },
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
});
