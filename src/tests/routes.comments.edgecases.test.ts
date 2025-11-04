import express from 'express';
import cookieParser from 'cookie-parser';
import commentsRouter from '../server/routes/comments';
import { requestId } from '../server/middleware/requestId';

describe('routes: comments edge cases', () => {
  function makeApp(session: any) {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(requestId());
    app.use((req: any, _res, next) => { req.session = session; next(); });
    app.use('/api', commentsRouter);
    return app;
  }

  beforeEach(() => {
    const realFetch = global.fetch as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const okResp = (obj: any, status = 200) => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: 'OK',
        text: async () => JSON.stringify(obj),
        json: async () => obj,
      } as any);
      const notFound = () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => JSON.stringify({ error: 'not_found' }) } as any);

      if (method === 'GET' && /\/[^/]+$/.test(path)) {
        // getDoc
        if (path.endsWith('/c404')) return notFound();
        return okResp({ _id: 'c1', type: 'comment', topicId: 't1', authorId: 'owner', content: 'y', createdAt: 1, updatedAt: 1, _rev: '1-a' });
      }
      if (method === 'PUT' && /\/[^/]+$/.test(path)) {
        return okResp({ ok: true, id: 'c1', rev: '2-b' });
      }
      if (method === 'DELETE' && /\/[^/]+$/.test(path)) {
        return okResp({ ok: true, id: 'c1', rev: '3-c' });
      }
      return okResp({}, 404);
    }) as any;
  });

  it('rejects POST without session (401)', async () => {
    const app = makeApp({ csrfToken: 't' });
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics/t1/comments`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ content: 'x' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(401);
    expect(body.error).toBe('unauthenticated');
  });

  it('rejects PATCH when not owner (403)', async () => {
    const app = makeApp({ userId: 'not-owner', csrfToken: 't' });
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/comments/c1`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ content: 'z' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(403);
    expect(body.error).toBe('forbidden');
  });

  it('returns 404 on update when doc missing', async () => {
    const app = makeApp({ userId: 'owner', csrfToken: 't' });
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/comments/c404`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ content: 'z' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(404);
    expect(body.error).toBe('not_found');
  });
});
