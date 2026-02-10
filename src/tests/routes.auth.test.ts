import { vi, describe, it, expect, beforeAll } from 'vitest';

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
      (req as any).session = {
        userId: undefined,
        userEmail: undefined,
        userName: undefined,
        destroy: (cb: () => void) => cb(),
      };
      next();
    });
    app.use('/api/auth', authRouter);
  }, 30000); // bcrypt with 10 rounds is CPU-heavy on WSL2

  it('registers a new user', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'new@example.com', password: 'pw123456' })
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
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'dup@example.com', password: 'pw123456' })
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
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'user@example.com', password: 'pw123456' })
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.id).toBe('u1');
  });
});
