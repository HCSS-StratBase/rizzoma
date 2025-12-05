import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { EditorSearch } from '../client/components/EditorSearch';
import * as apiModule from '../client/lib/api';

const apiMock = vi.spyOn(apiModule, 'api');

describe('client: EditorSearch', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    apiMock.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders snippets and jump action, supports pagination', async () => {
    apiMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        results: [{ waveId: 'w1', blipId: 'b1', updatedAt: 123, snippet: 'Hello search snippet' }],
        nextBookmark: 'bm1',
      },
    });
    apiMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        results: [{ waveId: 'w2', updatedAt: 456, snippet: 'Second page' }],
        nextBookmark: null,
      },
    });
    act(() => {
      root.render(<EditorSearch initialQuery="search" />);
    });
    const searchButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent?.includes('Search'));
    expect(searchButton).toBeTruthy();
    await act(async () => {
      Simulate.click(searchButton!);
    });
    await act(async () => { await Promise.resolve(); });
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Hello search snippet');
    const jumpButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent?.includes('Jump'));
    expect(jumpButton).toBeTruthy();
    window.location.hash = '#';
    await act(async () => {
      jumpButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(window.location.hash).toContain('/wave/');
    const loadMore = [...container.querySelectorAll('button')].find((btn) => btn.textContent?.includes('Load more'));
    expect(loadMore).toBeTruthy();
    await act(async () => {
      Simulate.click(loadMore!);
    });
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Second page');
    expect(apiMock).toHaveBeenCalledTimes(2);
    expect(String(apiMock.mock.calls[1]?.[0])).toContain('bookmark=bm1');
  });
});
