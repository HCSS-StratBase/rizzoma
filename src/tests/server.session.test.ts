import { afterEach, describe, expect, it, vi } from 'vitest';

const connectMock = vi.fn(() => Promise.resolve());
const onMock = vi.fn();
const createClientMock = vi.fn(() => ({ connect: connectMock, on: onMock }));
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
    createClientMock.mockClear();
    connectMock.mockClear();
    onMock.mockClear();
    redisStoreMock.mockClear();
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
});
