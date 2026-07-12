import { beforeEach, describe, expect, it, vi } from 'vitest';

const socketState = vi.hoisted(() => {
  const socket: any = {
    connected: true,
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(() => {
      socket.connected = false;
      return socket;
    }),
    connect: vi.fn(() => {
      socket.connected = true;
      return socket;
    }),
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
});
