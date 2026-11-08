import { beforeEach, describe, expect, it, vi } from 'vitest';
import session from 'express-session';

const credentialState = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  lookupError: null as Error | null,
  disconnectSessionSockets: vi.fn(() => 0),
}));

vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn(async (id: string) => {
    if (credentialState.lookupError) throw credentialState.lookupError;
    const doc = credentialState.docs.get(id);
    if (!doc) throw new Error('404 not_found');
    return { ...doc };
  }),
}));
vi.mock('../server/lib/socket.js', () => ({
  disconnectSessionSockets: credentialState.disconnectSessionSockets,
}));

import { checkSessionCredentialVersion } from '../server/lib/sessionCredentials.js';
import { sessionCredentialGuard } from '../server/middleware/sessionCredentials.js';
import { revokeUserSessions, sessionMiddleware } from '../server/middleware/session.js';

describe('credential generation session invalidation', () => {
  beforeEach(() => {
    credentialState.docs.clear();
    credentialState.lookupError = null;
    credentialState.disconnectSessionSockets.mockClear();
    credentialState.docs.set('user-1', { _id: 'user-1', type: 'user', authVersion: 0 });
  });

  it('accepts anonymous and matching legacy/current generations', async () => {
    expect(await checkSessionCredentialVersion(undefined)).toMatchObject({ status: 'valid' });
    expect(await checkSessionCredentialVersion({ userId: 'user-1' })).toEqual({
      status: 'valid', userId: 'user-1', authVersion: 0,
    });
    credentialState.docs.set('user-1', { _id: 'user-1', type: 'user', authVersion: 3 });
    expect(await checkSessionCredentialVersion({ userId: 'user-1', authVersion: 3 })).toMatchObject({ status: 'valid' });
  });

  it('fails closed on a reset generation mismatch, deleted user, or database outage', async () => {
    credentialState.docs.set('user-1', { _id: 'user-1', type: 'user', authVersion: 1 });
    expect(await checkSessionCredentialVersion({ userId: 'user-1', authVersion: 0 })).toEqual({
      status: 'invalid', userId: 'user-1', authVersion: 1,
    });
    expect(await checkSessionCredentialVersion({ userId: 'missing', authVersion: 0 })).toMatchObject({ status: 'invalid' });
    credentialState.lookupError = new Error('503 couch unavailable');
    expect(await checkSessionCredentialVersion({ userId: 'user-1', authVersion: 0 })).toMatchObject({ status: 'unavailable' });
  });

  it('destroys and disconnects a stale HTTP session before protected routing', async () => {
    credentialState.docs.set('user-1', { _id: 'user-1', type: 'user', authVersion: 2 });
    const destroy = vi.fn((callback: (error?: unknown) => void) => callback());
    const clearCookie = vi.fn();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    await sessionCredentialGuard()(
      { session: { userId: 'user-1', authVersion: 1, destroy }, sessionID: 'sid-1' } as any,
      { clearCookie, status, json } as any,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(credentialState.disconnectSessionSockets).toHaveBeenCalledWith('sid-1');
    expect(clearCookie).toHaveBeenCalledWith('rizzoma.sid', expect.any(Object));
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: 'session_invalidated' }));
  });

  it('eagerly removes every matching MemoryStore session and preserves other users', async () => {
    const store = new session.MemoryStore();
    sessionMiddleware(store);
    await Promise.all([
      new Promise<void>((resolve, reject) => store.set('alice-1', { userId: 'alice' } as any, (error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => store.set('alice-2', { userId: 'alice' } as any, (error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => store.set('bob-1', { userId: 'bob' } as any, (error) => error ? reject(error) : resolve())),
    ]);

    expect(await revokeUserSessions('alice')).toBe(2);
    const remaining = await new Promise<Record<string, unknown>>((resolve, reject) => {
      store.all((error, sessions) => error ? reject(error) : resolve((sessions || {}) as Record<string, unknown>));
    });
    expect(Object.keys(remaining)).toEqual(['bob-1']);
  });
});
