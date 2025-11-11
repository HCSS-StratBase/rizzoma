import express, { type Request, type NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import cookieParser from 'cookie-parser';
import topicsRouter from '../server/routes/topics';
import { requestId } from '../server/middleware/requestId';
import type { AddressInfo } from 'net';

describe('routes: /api/topics edge cases', () => {
  function makeApp(session: { userId?: string; csrfToken?: string } | undefined) {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(requestId());
    app.use((req: Request & { session?: (Session & Partial<SessionData> & { userId?: string; csrfToken?: string }) }, _res, next: NextFunction) => {
      req.session = Object.assign(session || {}, {} as Session & Partial<SessionData>);
      next();
    });
    app.use('/api/topics', topicsRouter);
    return app;
  }

  beforeEach(() => {
    // reset fetch per test; forward real HTTP calls to the local test server
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const okResp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && path.endsWith('/_find')) {
        return okResp({ docs: [] });
      }
      if (method === 'GET' && /\/[^/]+$/.test(path)) {
        return okResp({ _id: 't1', type: 'topic', title: 'First', authorId: 'other', createdAt: 1, updatedAt: 1, _rev: '1-a' });
      }
      if (method === 'PUT' && /\/[^/]+$/.test(path)) {
        return okResp({ ok: true, id: 't1', rev: '2-b' });
      }
      return okResp({}, 404);
    }) as typeof global.fetch;
  });

  it('rejects POST without session (CSRF fails first -> 403)', async () => {
    const app = makeApp({});
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ title: 'Nope' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(403);
    expect(body.error).toBeDefined();
  });

  it('rejects PATCH when not owner (403)', async () => {
    const app = makeApp({ userId: 'u1', csrfToken: 't' });
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics/t1`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ title: 'x' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(403);
    expect(body.error).toBe('forbidden');
  });
});
