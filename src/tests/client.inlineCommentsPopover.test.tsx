import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { InlineComment } from '@shared/types/comments';
import { InlineComments } from '../client/components/editor/InlineComments';
import { FEATURES } from '@shared/featureFlags';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('client: inline comment popover interactions', () => {
  let editor: Editor;
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
    editor = new Editor({
      element: host,
      extensions: [StarterKit],
      content: '<p>Hello inline comments</p>',
    });

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

  it('shows popover when hovering a highlight and allows resolve', async () => {
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

  it('supports Alt+Arrow navigation to focus comment anchors', async () => {
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
    editor = new Editor({
      element: host,
      extensions: [StarterKit],
      content: '<p>Hello inline comments</p>',
    });
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
    editor = new Editor({
      element: host,
      extensions: [StarterKit],
      content: '<p>Hello inline comments</p>',
    });
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
    editor = new Editor({
      element: host,
      extensions: [StarterKit],
      content: '<p>Status tracking</p>',
    });
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
    editor = new Editor({
      element: host,
      extensions: [StarterKit],
      content: '<p>Hello inline comments</p>',
    });
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
