import { describe, expect, it, vi } from 'vitest';
import { drainAndFlushForShutdown } from '../server/lib/gracefulShutdown';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('graceful shutdown ordering', () => {
  it('keeps the session store open until HTTP drain and Yjs persistence finish', async () => {
    const http = deferred();
    const yjs = deferred();
    const calls: string[] = [];
    const closeSocket = vi.fn(async () => { calls.push('socket'); });
    const flushCollaborativeState = vi.fn(() => {
      calls.push('yjs-start');
      return yjs.promise;
    });
    const closeSessionStore = vi.fn(async () => { calls.push('redis'); });

    const shutdown = drainAndFlushForShutdown({
      closeSocket,
      httpClosed: http.promise,
      flushCollaborativeState,
      closeSessionStore,
    });
    await vi.waitFor(() => expect(flushCollaborativeState).toHaveBeenCalledOnce());
    expect(calls).toEqual(['socket', 'yjs-start']);

    yjs.resolve();
    await Promise.resolve();
    expect(closeSessionStore).not.toHaveBeenCalled();

    http.resolve();
    await shutdown;
    expect(calls).toEqual(['socket', 'yjs-start', 'redis']);
  });

  it('does not report success when collaborative persistence fails', async () => {
    const closeSessionStore = vi.fn(async () => {});
    await expect(drainAndFlushForShutdown({
      closeSocket: async () => {},
      httpClosed: Promise.resolve(),
      flushCollaborativeState: async () => { throw new Error('Couch unavailable'); },
      closeSessionStore,
    })).rejects.toThrow('Couch unavailable');
    expect(closeSessionStore).not.toHaveBeenCalled();
  });
});
