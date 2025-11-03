import express from 'express';
import cookieParser from 'cookie-parser';
import { requestId } from '../server/middleware/requestId';
import bcrypt from 'bcrypt';

// Mock redis + connect-redis to avoid real connections in tests
jest.mock('redis', () => ({
  __esModule: true,
  createClient: () => ({
    connect: () => Promise.resolve(),
    on: () => void 0,
  }),
}));
jest.mock('connect-redis', () => ({
  __esModule: true,
  default: class RedisStore {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts: any) {}
  },
}));

describe('routes: /api/auth', () => {
  let app: express.Express;
  let goodHash = '';

  beforeAll(async () => {
    goodHash = await bcrypt.hash('pw123456', 10);
    // Mock global fetch used by couch helpers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      const body = init?.body ? JSON.parse(init.body.toString()) : undefined;
      const okResp = (obj: any, status = 200) => ({ ok: status >= 200 && status < 300, status, statusText: 'OK', text: async () => JSON.stringify(obj) } as any);
      if (method === 'POST' && path.endsWith('/_find')) {
        // Branch by selector to simulate existing users and login
        const sel = body?.selector || {};
        if (sel.email === 'dup@example.com') return okResp({ docs: [{ _id: 'u-dup', type: 'user', email: 'dup@example.com', passwordHash: goodHash }] });
        if (sel.email === 'user@example.com') return okResp({ docs: [{ _id: 'u1', type: 'user', email: 'user@example.com', passwordHash: goodHash }] });
        return okResp({ docs: [] });
      }
      if (method === 'POST' && /\/[^/]+$/.test(path)) {
        // insertDoc for user
        return okResp({ ok: true, id: 'u-new', rev: '1-x' }, 201);
      }
      return okResp({}, 404);
    }) as any;

    const authRouter = (await import('../server/routes/auth')).default;
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(requestId());
    app.use('/api/auth', authRouter);
  });

  it('registers a new user', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
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
    const port = (server.address() as any).port;
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
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'user@example.com', password: 'pw123456' })
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.id).toBe('u1');
  });
});

