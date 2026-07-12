import { vi, describe, it, expect, beforeAll, beforeEach } from 'vitest';

const logoutState = vi.hoisted(() => ({
  events: [] as string[],
  disconnectSessionSockets: vi.fn(() => { logoutState.events.push('disconnect'); return 0; }),
}));

vi.mock('../server/lib/socket.js', () => ({
  disconnectSessionSockets: logoutState.disconnectSessionSockets,
}));

// Use bcryptjs in tests to avoid native binding issues
vi.mock('bcrypt', async () => {
  const mod: any = await import('bcryptjs');
  return { ...mod, default: mod };
});

// Mock redis + connect-redis to avoid real connections in tests
vi.mock('redis', () => ({
  __esModule: true,
  createClient: () => ({
    connect: () => Promise.resolve(),
    on: () => void 0,
  }),
}));

// Support both default and named import styles for RedisStore in tests
vi.mock('connect-redis', () => {
  class RedisStoreMock {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts: any) {}
    on() {/* no-op */}
    // minimal required store API
    get(_sid: string, cb: (err: any, sess?: any) => void) { cb(null, undefined); }
    set(_sid: string, _sess: any, cb?: (err?: any) => void) { cb?.(); }
    destroy(_sid: string, cb?: (err?: any) => void) { cb?.(); }
  }
  return { __esModule: true, default: RedisStoreMock, RedisStore: RedisStoreMock };
});

import express from 'express';
import cookieParser from 'cookie-parser';
import { requestId } from '../server/middleware/requestId';
import bcrypt from 'bcrypt';

describe('routes: /api/auth', () => {
  let app: express.Express;
  let goodHash = '';
  const inviteToken = 'valid-email-invitation-token-for-registration-123456789';

  beforeAll(async () => {
    goodHash = await bcrypt.hash('pw123456', 10);
    // Mock global fetch used by couch helpers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const body = init?.body ? JSON.parse((init.body as string).toString()) as Record<string, unknown> : undefined;
      const okResp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && path.endsWith('/_find')) {
        // Branch by selector to simulate existing users and login
        const sel = (body?.['selector'] as Record<string, unknown> | undefined) || {};
        if (sel['email'] === 'dup@example.com') return okResp({ docs: [{ _id: 'u-dup', type: 'user', email: 'dup@example.com', passwordHash: goodHash }] });
        if (sel['email'] === 'user@example.com') return okResp({ docs: [{ _id: 'u1', type: 'user', email: 'user@example.com', passwordHash: goodHash }] });
        if (sel['type'] === 'participant' && sel['inviteTokenHash']) {
          return okResp({ docs: [{
            _id: 'pending-new-user',
            type: 'participant',
            email: 'new@example.com',
            status: 'pending',
            inviteTokenHash: sel['inviteTokenHash'],
            inviteExpiresAt: Date.now() + 60_000,
          }] });
        }
        return okResp({ docs: [] });
      }
      if (method === 'POST' && /\/[^/]+$/.test(path)) {
        // insertDoc for user
        return okResp({ ok: true, id: 'u-new', rev: '1-x' }, 201);
      }
      return okResp({}, 404);
    }) as typeof global.fetch;

    const authRouter = (await import('../server/routes/auth')).default;
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(requestId());
    // Add mock session middleware
    app.use((req, _res, next) => {
      (req as any).sessionID = 'test-session-id';
      (req as any).session = {
        userId: undefined,
        userEmail: undefined,
        userName: undefined,
        csrfToken: 'test-csrf-token',
        destroy: (cb: (error?: Error) => void) => {
          logoutState.events.push('destroy');
          cb(req.get('x-test-destroy-fail') === '1' ? new Error('store unavailable') : undefined);
        },
      };
      next();
    });
    app.use('/api/auth', authRouter);
  }, 30000); // bcrypt with 10 rounds is CPU-heavy on WSL2

  beforeEach(() => {
    logoutState.events.length = 0;
    logoutState.disconnectSessionSockets.mockClear();
  });

  it('registers a new user', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf-token' }, body: JSON.stringify({ email: 'new@example.com', password: 'new-password-123', inviteToken })
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(201);
    expect(body.id).toBe('u-new');
  });

  it('rejects duplicate email', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf-token' }, body: JSON.stringify({ email: 'dup@example.com', password: 'new-password-123' })
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(409);
    expect(body.error).toBe('email_in_use');
  });

  it('logs in a user', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf-token' }, body: JSON.stringify({ email: 'user@example.com', password: 'pw123456' })
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.id).toBe('u1');
  });

  it.each(['/register', '/login'])('rejects %s without a CSRF token', async (path) => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: path === '/register' ? 'new@example.com' : 'user@example.com',
        password: path === '/register' ? 'new-password-123' : 'pw123456',
        ...(path === '/register' ? { inviteToken } : {}),
      }),
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(403);
    expect(body.error).toBe('csrf_failed');
  });

  it('reports a failed durable session revocation instead of claiming logout success', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf-token', 'x-test-destroy-fail': '1' },
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(503);
    expect(body.error).toBe('revocation_failed');
    expect(resp.headers.get('set-cookie')).toBeNull();
    expect(logoutState.disconnectSessionSockets).not.toHaveBeenCalled();
    expect(logoutState.events).toEqual(['destroy']);
  });

  it('clears the cookie and disconnects sockets only after durable revocation succeeds', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf-token' },
    });
    server.close();

    expect(resp.status).toBe(200);
    expect(resp.headers.get('set-cookie')).toContain('rizzoma.sid=');
    expect(logoutState.disconnectSessionSockets).toHaveBeenCalledWith('test-session-id');
    expect(logoutState.events).toEqual(['destroy', 'disconnect']);
  });
});
