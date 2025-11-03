import express from 'express';
import cookieParser from 'cookie-parser';
import topicsRouter from '../server/routes/topics';
import { requestId } from '../server/middleware/requestId';

describe('routes: /api/topics edge cases', () => {
  function makeApp(session: any) {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(requestId());
    app.use((req: any, _res, next) => { req.session = session; next(); });
    app.use('/api/topics', topicsRouter);
    return app;
  }

  beforeEach(() => {
    // reset fetch per test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      const okResp = (obj: any, status = 200) => ({ ok: status >= 200 && status < 300, status, statusText: 'OK', text: async () => JSON.stringify(obj) } as any);
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
    }) as any;
  });

  it('rejects POST without session (401)', async () => {
    const app = makeApp({});
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ title: 'Nope' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(401);
    expect(body.error).toBe('unauthenticated');
  });

  it('rejects PATCH when not owner (403)', async () => {
    const app = makeApp({ userId: 'u1', csrfToken: 't' });
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics/t1`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ title: 'x' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(403);
    expect(body.error).toBe('forbidden');
  });
});

