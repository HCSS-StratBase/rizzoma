import express from 'express';
import cookieParser from 'cookie-parser';
import commentsRouter from '../server/routes/comments';
import { requestId } from '../server/middleware/requestId';

describe('routes: /api/topics/:id/comments', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId());
  app.use((req: any, _res, next) => { req.session = { userId: 'u1', csrfToken: 't' }; next(); });
  app.use('/api', commentsRouter);

  beforeAll(() => {
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
      if (method === 'POST' && path.endsWith('/_find')) {
        return okResp({ docs: [
          { _id: 'c1', type: 'comment', topicId: 't1', authorId: 'u1', content: 'hello', createdAt: 1, updatedAt: 1 },
          { _id: 'c2', type: 'comment', topicId: 't1', authorId: 'u2', content: 'world', createdAt: 2, updatedAt: 2 },
        ] });
      }
      if (method === 'POST' && path.match(/\/[^/]+$/)) {
        // insertDoc
        return okResp({ ok: true, id: 'c1', rev: '1-abc' }, 201);
      }
      return okResp({}, 404);
    }) as any;
  });

  it('rejects POST without CSRF header', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics/t1/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'x' }),
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(403);
    expect(body.error).toBe('csrf_failed');
  });

  it('creates comment with CSRF header', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics/t1/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 't' },
      body: JSON.stringify({ content: 'x' }),
    });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(201);
    expect(body.id).toBe('c1');
  });

  it('lists comments with pagination', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics/t1/comments?limit=1`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.comments.length).toBe(1);
    expect(body.hasMore).toBe(true);
  });
});
