import type { JSX } from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useWaveUnread, type MarkReadResult } from '../client/hooks/useWaveUnread';
import { api } from '../client/lib/api';
import { subscribeBlipEvents, type BlipSocketEvent } from '../client/lib/socket';
import { toast } from '../client/components/Toast';

vi.mock('../client/lib/api', () => ({
  api: vi.fn(),
}));

vi.mock('../client/lib/socket', () => {
  return {
    subscribeBlipEvents: vi.fn(),
    subscribeWaveUnread: vi.fn(() => () => {}),
    ensureWaveUnreadJoin: vi.fn(),
  };
});

vi.mock('../client/components/Toast', () => ({
  toast: vi.fn(),
}));

type ApiMock = typeof api extends (...args: any[]) => any ? ReturnType<typeof vi.fn> : never;
function renderHook<T>(hook: () => T): { container: HTMLDivElement; root: Root; getValue: () => T } {
  let value!: T;
function HookHarness(): JSX.Element | null {
    value = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<HookHarness />);
  });
  return {
    container,
    root,
    getValue: () => value,
  };
}

describe('client: useWaveUnread', () => {
  const apiMock = api as unknown as ApiMock;
  const subscribeBlipEventsMock = subscribeBlipEvents as unknown as ReturnType<typeof vi.fn>;
  const toastMock = toast as unknown as ReturnType<typeof vi.fn>;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    apiMock.mockReset();
    subscribeBlipEventsMock.mockReset();
    toastMock.mockReset();
    // default /api/auth/me
    apiMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { id: 'u1', email: 'u1@example.com' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('loads unread state and exposes unreadIds/unreadSet', async () => {
    apiMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { unread: ['b1', 'b2'], total: 2, read: 0 },
    });
    subscribeBlipEventsMock.mockImplementation(() => () => {});

    const { getValue, root, container } = renderHook(() => useWaveUnread('wave-1'));

    await act(async () => {
      await Promise.resolve();
    });

    const state = getValue();
    expect(state.waveId).toBe('wave-1');
    expect(state.unreadIds).toEqual(['b1', 'b2']);
    expect(state.unreadSet.has('b1')).toBe(true);
    expect(state.total).toBe(2);
    expect(state.readCount).toBe(0);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it.skip('marks a single blip read optimistically and rolls back on failure', async () => {
    // Mock sequence: auth/me (beforeEach) -> refresh -> markBlipRead (fail)
    apiMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { unread: ['b1', 'b2'], total: 2, read: 0 },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: { error: 'fail' },
      });
    subscribeBlipEventsMock.mockImplementation(() => () => {});

    const { getValue, root, container } = renderHook(() => useWaveUnread('wave-1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const before = getValue();
    expect(before.unreadIds).toEqual(['b1', 'b2']);
    expect(before.readCount).toBe(0);

    let result: MarkReadResult;
    await act(async () => {
      result = (await before.markBlipRead('b1')) as MarkReadResult;
    });

    // After failure, the optimistic update is rolled back
    expect(result!.ok).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('Follow-the-Green failed, please refresh', 'error');
    // Note: after rollback, unreadIds should be restored to original
    const after = getValue();
    expect(after.unreadIds).toEqual(['b1', 'b2']);
    expect(after.readCount).toBe(0);

    act(() => root.unmount());
    container.remove();
  });

  it('handles deleted events by removing unread blips without reloading', async () => {
    apiMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { unread: ['b1', 'b2'], total: 2, read: 0 },
    });
    let handler: ((evt: BlipSocketEvent) => void) | null = null;
    subscribeBlipEventsMock.mockImplementation((_waveId: string, onEvent: (evt: BlipSocketEvent) => void) => {
      handler = onEvent;
      return () => {};
    });

    const { getValue, root, container } = renderHook(() => useWaveUnread('wave-1'));

    await act(async () => {
      await Promise.resolve();
    });

    const initial = getValue();
    expect(initial.unreadIds).toEqual(['b1', 'b2']);
    expect(initial.total).toBe(2);

    expect(handler).toBeTruthy();
    await act(async () => {
      handler!({ action: 'deleted', waveId: 'wave-1', blipId: 'b1' });
    });

    const after = getValue();
    expect(after.unreadIds).toEqual(['b2']);
    expect(after.total).toBe(1);

    act(() => root.unmount());
    container.remove();
  });

  it('handles large unread lists without degrading state invariants', async () => {
    const largeUnread = Array.from({ length: 1000 }, (_, i) => `b${i + 1}`);
    apiMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { unread: largeUnread, total: largeUnread.length, read: 0 },
    });
    subscribeBlipEventsMock.mockImplementation(() => () => {});

    const { getValue, root, container } = renderHook(() => useWaveUnread('wave-large'));

    await act(async () => {
      await Promise.resolve();
    });

    const state = getValue();
    expect(state.unreadIds.length).toBe(1000);
    expect(state.total).toBe(1000);
    expect(state.readCount).toBe(0);
    expect(state.unreadSet.size).toBe(1000);

    await act(async () => {
      const result = await state.markBlipRead('b500');
      expect(result.ok).toBe(true);
    });

    const after = getValue();
    expect(after.unreadIds.includes('b500')).toBe(false);
    expect(after.readCount).toBe(1);

    act(() => root.unmount());
    container.remove();
  });
});
