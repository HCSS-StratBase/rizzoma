import { beforeEach, describe, expect, it, vi } from 'vitest';

const socketState = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const socket: any = {
    connected: true,
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return socket;
    }),
    off: vi.fn((event: string, handler?: (...args: any[]) => void) => {
      if (handler) handlers.get(event)?.delete(handler);
      else handlers.delete(event);
      return socket;
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
      return socket;
    }),
    connect: vi.fn(() => {
      socket.connected = true;
      return socket;
    }),
    receive(event: string, payload?: unknown) {
      handlers.get(event)?.forEach((handler) => handler(payload));
    },
  };
  return { socket, io: vi.fn(() => socket) };
});

vi.mock('socket.io-client', () => ({ io: socketState.io }));

import { getSocket, refreshSocketSession } from '../client/lib/socket';

describe('client socket session identity', () => {
  beforeEach(() => {
    socketState.socket.connected = true;
    vi.clearAllMocks();
  });

  it('disconnects and reconnects the singleton after an in-place session change', () => {
    expect(getSocket()).toBe(socketState.socket);
    const refreshed = refreshSocketSession();

    expect(refreshed).toBe(socketState.socket);
    expect(socketState.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketState.socket.connect).toHaveBeenCalledTimes(1);
  });

  it('reconnects a server-disconnected logout socket without a redundant disconnect', () => {
    getSocket();
    socketState.socket.connected = false;
    refreshSocketSession();

    expect(socketState.socket.disconnect).not.toHaveBeenCalled();
    expect(socketState.socket.connect).toHaveBeenCalledTimes(1);
  });

  it('surfaces session expiry and never auto-reconnects the stale identity', () => {
    const toast = vi.fn();
    const authChanged = vi.fn();
    window.addEventListener('toast', toast);
    window.addEventListener('rizzoma:auth-changed', authChanged);
    getSocket();

    socketState.socket.receive('session:ended', { reason: 'expired' });

    expect(socketState.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socketState.socket.connect).not.toHaveBeenCalled();
    expect((toast.mock.calls[0]?.[0] as CustomEvent).detail.message).toContain('session expired');
    expect((authChanged.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
      authenticated: false,
      reason: 'expired',
    });
    window.removeEventListener('toast', toast);
    window.removeEventListener('rizzoma:auth-changed', authChanged);
  });
});
