import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import session from 'express-session';

const connectMock = vi.fn(() => Promise.resolve());
const onMock = vi.fn();
const pingMock = vi.fn(() => Promise.resolve('PONG'));
const quitMock = vi.fn(() => Promise.resolve('OK'));
const createClientMock = vi.fn(() => ({
  connect: connectMock,
  on: onMock,
  ping: pingMock,
  quit: quitMock,
  isOpen: true,
}));
const redisStoreMock = vi.fn();

vi.mock('redis', () => ({
  __esModule: true,
  createClient: createClientMock,
}));

vi.mock('connect-redis', () => {
  class RedisStoreMock {
    constructor(opts: unknown) {
      redisStoreMock(opts);
    }
    get(_sid: string, cb: (err: unknown, sess?: unknown) => void) { cb(null, undefined); }
    set(_sid: string, _sess: unknown, cb?: (err?: unknown) => void) { cb?.(); }
    destroy(_sid: string, cb?: (err?: unknown) => void) { cb?.(); }
    on() { return this; }
  }
  return { __esModule: true, default: RedisStoreMock };
});

describe('session middleware storage', () => {
  afterEach(() => {
    delete process.env['SESSION_STORE'];
    delete process.env['REDIS_URL'];
    delete process.env['SESSION_SECRET'];
    delete process.env['SESSION_SECRET_PREVIOUS'];
    createClientMock.mockClear();
    connectMock.mockClear();
    onMock.mockClear();
    redisStoreMock.mockClear();
    pingMock.mockClear();
    quitMock.mockClear();
    vi.resetModules();
  });

  it('uses Redis 5 session storage by default', async () => {
    process.env['REDIS_URL'] = 'redis://redis.example:6379';
    const { sessionMiddleware } = await import('../server/middleware/session');

    const middleware = sessionMiddleware();

    expect(typeof middleware).toBe('function');
    expect(createClientMock).toHaveBeenCalledWith({ url: 'redis://redis.example:6379' });
    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function));
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(redisStoreMock).toHaveBeenCalledWith(expect.objectContaining({
      prefix: 'rizzoma:sess:',
    }));
  });

  it('keeps an explicit memory-store fallback for local tests', async () => {
    process.env['SESSION_STORE'] = 'memory';
    const { sessionMiddleware } = await import('../server/middleware/session');

    const middleware = sessionMiddleware();

    expect(typeof middleware).toBe('function');
    expect(createClientMock).not.toHaveBeenCalled();
    expect(redisStoreMock).not.toHaveBeenCalled();
  });

  it('refuses the development secret in production', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['SESSION_STORE'] = 'memory';
    const { sessionMiddleware } = await import('../server/middleware/session');

    expect(() => sessionMiddleware()).toThrow(/SESSION_SECRET/);
    process.env['NODE_ENV'] = 'test';
  });

  it.each([
    'REPLACE_WITH_A_RANDOM_SECRET',
    'change-me',
    'short-production-secret',
  ])('refuses weak or placeholder production secret %s', async secret => {
    process.env['NODE_ENV'] = 'production';
    process.env['SESSION_STORE'] = 'memory';
    process.env['SESSION_SECRET'] = secret;
    const { sessionMiddleware } = await import('../server/middleware/session');

    expect(() => sessionMiddleware()).toThrow(/at least 32 characters/);
    process.env['NODE_ENV'] = 'test';
  });

  it('refuses a weak previous verifier in production', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['SESSION_STORE'] = 'memory';
    process.env['SESSION_SECRET'] = 'new-production-secret-with-at-least-32-characters';
    process.env['SESSION_SECRET_PREVIOUS'] = 'dev-secret-change-me';
    const { sessionMiddleware } = await import('../server/middleware/session');

    expect(() => sessionMiddleware()).toThrow(/SESSION_SECRET_PREVIOUS/);
    process.env['NODE_ENV'] = 'test';
  });

  it('supports a previous secret during a no-logout rotation', async () => {
    const sharedStore = new session.MemoryStore();
    process.env['SESSION_STORE'] = 'memory';
    const { sessionMiddleware } = await import('../server/middleware/session');

    // Create a real persisted session and cookie with the old signing secret.
    process.env['NODE_ENV'] = 'test';
    process.env['SESSION_SECRET'] = 'old-production-secret-with-at-least-32-characters';
    const oldApp = express();
    oldApp.use(sessionMiddleware(sharedStore));
    oldApp.get('/login', (req: any, res) => {
      req.session.userId = 'existing-user';
      res.json({ ok: true });
    });
    const oldServer = oldApp.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => oldServer.once('listening', resolve));
    const oldAddress = oldServer.address() as import('net').AddressInfo;
    const login = await fetch(`http://127.0.0.1:${oldAddress.port}/login`);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    await new Promise<void>(resolve => oldServer.close(() => resolve()));
    expect(cookie).toContain('rizzoma.sid=');

    // Verify that the new primary accepts that exact old cookie through the
    // normal express-session middleware and resolves the same stored identity.
    process.env['NODE_ENV'] = 'production';
    process.env['SESSION_SECRET'] = 'new-production-secret-with-at-least-32-characters';
    process.env['SESSION_SECRET_PREVIOUS'] = 'old-production-secret-with-at-least-32-characters';
    const newApp = express();
    newApp.use(sessionMiddleware(sharedStore));
    newApp.get('/me', (req: any, res) => res.json({ userId: req.session.userId || null }));
    const newServer = newApp.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => newServer.once('listening', resolve));
    const newAddress = newServer.address() as import('net').AddressInfo;
    const me = await fetch(`http://127.0.0.1:${newAddress.port}/me`, {
      headers: { cookie: cookie || '' },
    });
    const body = await me.json() as { userId: string | null };
    await new Promise<void>(resolve => newServer.close(() => resolve()));

    expect(body.userId).toBe('existing-user');
    process.env['NODE_ENV'] = 'test';
  });

  it('reports Redis health and closes the client cleanly', async () => {
    process.env['REDIS_URL'] = 'redis://redis.example:6379';
    const { closeSessionStore, sessionMiddleware, sessionStoreHealth } = await import('../server/middleware/session');
    sessionMiddleware();

    await expect(sessionStoreHealth()).resolves.toMatchObject({ status: 'ok', mode: 'redis' });
    await closeSessionStore();
    expect(pingMock).toHaveBeenCalledTimes(1);
    expect(quitMock).toHaveBeenCalledTimes(1);
  });

  it('bounds Redis readiness when PING never settles', async () => {
    vi.useFakeTimers();
    try {
      process.env['REDIS_URL'] = 'redis://redis.example:6379';
      pingMock.mockImplementationOnce(() => new Promise(() => {}));
      const { sessionMiddleware, sessionStoreHealth } = await import('../server/middleware/session');
      sessionMiddleware();

      const health = sessionStoreHealth();
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(health).resolves.toMatchObject({
        status: 'error',
        mode: 'redis',
        error: 'Redis PING timed out after 2000ms',
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
