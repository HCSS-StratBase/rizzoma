import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import type { InlineComment } from '@shared/types/comments';
import { InlineComments } from '../client/components/editor/InlineComments';
import { FEATURES } from '@shared/featureFlags';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));
type TestEditor = ReturnType<typeof createMockEditor>;

function createMockEditor(host: HTMLDivElement, text = 'Hello inline comments') {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  const selection = { from: 0, to: 0 };
  const plugins: any[] = [];
  const editor: any = {
    state: {
      selection,
      plugins,
      doc: {
        textBetween: (from: number, to: number) => text.slice(from, to),
        content: { size: text.length },
      },
      tr: {
        setMeta: vi.fn(() => ({ type: 'mock-tr' })),
      },
      reconfigure: vi.fn(({ plugins: newPlugins }) => ({ plugins: newPlugins })),
    },
    view: {
      dom: host,
      updateState: vi.fn(),
      dispatch: vi.fn(),
    },
    isDestroyed: false,
    on: (event: string, cb: (...args: any[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    },
    off: (event: string, cb: (...args: any[]) => void) => {
      listeners[event] = (listeners[event] || []).filter((fn) => fn !== cb);
    },
    destroy: () => {
      editor.isDestroyed = true;
    },
  };
  return editor;
}

describe('client: inline comment popover interactions', () => {
  let editor: TestEditor;
  let container: HTMLDivElement;
  let root: Root;
  let host: HTMLDivElement;
  const fetchMock = vi.fn();
  const originalFetch = global.fetch;
  const blipId = 'wave1:blip1';

  beforeAll(() => {
    // jsdom does not implement scrollIntoView
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    }
    (FEATURES as any).INLINE_COMMENTS = true;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('fetch', fetchMock as any);
  });

  afterAll(() => {
    if (originalFetch) {
      global.fetch = originalFetch;
    }
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    editor = createMockEditor(host);

    // Add mock commented-text spans to simulate ProseMirror decorations
    const helloSpan = document.createElement('span');
    helloSpan.className = 'commented-text';
    helloSpan.setAttribute('data-comment-range', 'range-c1');
    helloSpan.textContent = 'Hello';
    host.appendChild(helloSpan);

    const commentsSpan = document.createElement('span');
    commentsSpan.className = 'commented-text';
    commentsSpan.setAttribute('data-comment-range', 'range-c2');
    commentsSpan.textContent = 'comments';
    host.appendChild(commentsSpan);

    const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size);
    const rangeFor = (snippet: string) => {
      const idx = fullText.indexOf(snippet);
      return { start: idx + 1, end: idx + 1 + snippet.length, text: snippet };
    };

    const sampleComments: InlineComment[] = [
      {
        id: 'c1',
        blipId,
        userId: 'u1',
        userName: 'Alice',
        content: 'First inline comment',
        range: rangeFor('Hello'),
        resolved: false,
        resolvedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
      {
        id: 'c2',
        blipId,
        userId: 'u2',
        userName: 'Bob',
        content: 'Second inline comment',
        range: rangeFor('comments'),
        resolved: false,
        resolvedAt: null,
        createdAt: 0,
        updatedAt: 0,
      },
    ];

    fetchMock.mockImplementation(async (path: RequestInfo, init?: RequestInit) => {
      const headers = { get: () => null };
      const method = (init?.method || 'GET').toUpperCase();
      if (typeof path === 'string' && path.includes('/comments') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ comments: sampleComments }),
          headers,
        };
      }
      if (typeof path === 'string' && path.includes('/comments/') && method === 'PATCH') {
        return { ok: true, status: 200, text: async () => '{}', headers };
      }
      return { ok: true, status: 200, text: async () => '{}', headers };
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(<InlineComments editor={editor as any} blipId={blipId} />);
    });
    await act(async () => {
      await flushPromises();
      await flushPromises();
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    host.remove();
    editor.destroy();
    fetchMock.mockReset();
  });

  it.skip('shows popover when hovering a highlight and allows resolve', async () => {
    const highlight = editor.view.dom.querySelector('.commented-text') as HTMLElement | null;
    expect(highlight).toBeTruthy();

    await act(async () => {
      highlight!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await flushPromises();
    });

    const popover = container.querySelector('.inline-comments-popover');
    expect(popover).toBeTruthy();
    expect(popover?.textContent).toContain('First inline comment');

    const resolveBtn = popover?.querySelector('.resolve-button') as HTMLButtonElement | null;
    expect(resolveBtn).toBeTruthy();

    await act(async () => {
      resolveBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
    });

    const resolved = popover?.querySelector('.inline-comment.resolved');
    expect(resolved).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/comments/c1/resolve'),
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ resolved: true }) })
    );
  });

  it.skip('supports Alt+Arrow navigation to focus comment anchors', async () => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
      await flushPromises();
    });

    const popover = container.querySelector('.inline-comments-popover');
    expect(popover).toBeTruthy();
    expect(popover?.classList.contains('pinned')).toBe(true);
  });

  it('shows a read-only banner when the user cannot add inline comments', async () => {
    await act(async () => root.unmount());
    editor.destroy();
    host.remove();
    host = document.createElement('div');
    document.body.appendChild(host);
    editor = createMockEditor(host, 'Hello inline comments');
    root = createRoot(container);
    await act(async () => {
      root.render(<InlineComments editor={editor as any} blipId={blipId} canComment={false} />);
    });
    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    const banner = container.querySelector('.inline-comment-nav .inline-comments-banner');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('read-only');
  });

  it('surfaces a retry banner when inline comments fail to load and recovers after retry', async () => {
    const headers = { get: () => null };
    let requestCount = 0;
    fetchMock.mockImplementation(async (path: RequestInfo, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (typeof path === 'string' && path.includes('/comments') && method === 'GET') {
        requestCount += 1;
        if (requestCount === 1) {
          return { ok: false, status: 500, text: async () => 'error', headers };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ comments: [] }),
          headers,
        };
      }
      return { ok: true, status: 200, text: async () => '{}', headers };
    });

    await act(async () => {
      root.unmount();
    });
    editor.destroy();
    host.remove();
    host = document.createElement('div');
    document.body.appendChild(host);
    editor = createMockEditor(host, 'Hello inline comments');
    root = createRoot(container);

    await act(async () => {
      root.render(<InlineComments editor={editor as any} blipId={blipId} />);
    });
    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    const banner = container.querySelector('[data-testid="inline-comments-error"]');
    expect(banner).toBeTruthy();
    const retryButton = banner?.querySelector('button');
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
      await flushPromises();
    });

    expect(requestCount).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-testid="inline-comments-error"]')).toBeNull();
  });

  it('notifies parents about inline comment status changes', async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    host.remove();
    const headers = { get: () => null };
    let requestCount = 0;
    fetchMock.mockImplementation(async (path: RequestInfo, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (typeof path === 'string' && path.includes('/comments') && method === 'GET') {
        requestCount += 1;
        if (requestCount === 1) {
          return { ok: false, status: 503, text: async () => 'maintenance', headers };
        }
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ comments: [] }),
          headers,
        };
      }
      return { ok: true, status: 200, text: async () => '{}', headers };
    });

    host = document.createElement('div');
    document.body.appendChild(host);
    editor = createMockEditor(host, 'Status tracking');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const statusSpy = vi.fn();

    await act(async () => {
      root.render(
        <InlineComments
          editor={editor as any}
          blipId={blipId}
          onStatusChange={statusSpy}
        />
      );
    });
    await act(async () => {
      await flushPromises();
      await flushPromises();
    });

    const errorCall = statusSpy.mock.calls.find(
      ([status]) => Boolean(status.loadError)
    );
    expect(errorCall?.[0].loadError).toContain('Inline comments are temporarily unavailable');

    const retryButton = container.querySelector('[data-testid="inline-comments-retry"]');
    expect(retryButton).toBeTruthy();
    await act(async () => {
      retryButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushPromises();
      await flushPromises();
    });

    const finalCall = statusSpy.mock.calls.at(-1)?.[0];
    expect(finalCall?.loadError).toBeNull();
    expect(finalCall?.isFetching).toBe(false);
  });

  it('shows a loading banner while inline comments are fetching', async () => {
    const headers = { get: () => null };
    let resolveFetch: (() => void) | null = null;
    fetchMock.mockImplementation(async (path: RequestInfo, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (typeof path === 'string' && path.includes('/comments') && method === 'GET' && !resolveFetch) {
        return new Promise((resolve) => {
          resolveFetch = () => resolve({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ comments: [] }),
            headers,
          });
        });
      }
      return {
        ok: true,
        status: 200,
        text: async () => '{}',
        headers,
      };
    });

    await act(async () => {
      root.unmount();
    });
    editor.destroy();
    host.remove();
    host = document.createElement('div');
    document.body.appendChild(host);
    editor = createMockEditor(host, 'Hello inline comments');
    root = createRoot(container);

    await act(async () => {
      root.render(<InlineComments editor={editor as any} blipId={blipId} />);
    });

    const loadingBanner = container.querySelector('[data-testid="inline-comments-loading"]');
    expect(loadingBanner).toBeTruthy();
    expect(loadingBanner?.textContent).toContain('Loading inline comments');

    await act(async () => {
      resolveFetch?.();
      await flushPromises();
      await flushPromises();
    });

    expect(container.querySelector('[data-testid="inline-comments-loading"]')).toBeNull();
  });
});
