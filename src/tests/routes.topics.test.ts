import express from 'express';
import cookieParser from 'cookie-parser';
import topicsRouter from '../server/routes/topics';
import { requestId } from '../server/middleware/requestId';

describe('routes: /api/topics', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId());
  // minimal session shim
  app.use((req: any, _res, next) => { req.session = { userId: 'u1', csrfToken: 't' }; next(); });
  app.use('/api/topics', topicsRouter);

  beforeAll(() => {
    // Mock global fetch used by couch helpers, but forward real HTTP requests to the local app server
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
        // Return a couple of topic docs
        return okResp({ docs: [
          { _id: 't2', type: 'topic', title: 'Second', createdAt: Date.now() - 1000 },
          { _id: 't1', type: 'topic', title: 'First', createdAt: Date.now() - 2000 },
        ] });
      }
      if (method === 'POST' && /\/[^/]+$/.test(path)) {
        // insertDoc for topic create
        return okResp({ ok: true, id: 't-new', rev: '1-x' }, 201);
      }
      if (method === 'GET' && /\/[^/]+$/.test(path)) {
        // getDoc for update/delete
        return okResp({ _id: 't1', type: 'topic', title: 'First', authorId: 'u1', createdAt: 1, updatedAt: 1, _rev: '1-a' });
      }
      if (method === 'PUT' && /\/[^/]+$/.test(path)) {
        // updateDoc
        return okResp({ ok: true, id: 't1', rev: '2-b' });
      }
      if (method === 'DELETE' && /\/[^/]+$/.test(path)) {
        // deleteDoc
        return okResp({ ok: true, id: 't1', rev: '3-c' });
      }
      if (method === 'GET' && /_design\/waves_by_creation_date\/_view/.test(path)) {
        return okResp({ rows: [ { key: Date.now() - 5000, value: 'w1' }, { key: Date.now() - 4000, value: 'w2' } ] });
      }
      // default
      return okResp({}, 404);
    }) as any;
  });

  it('lists topics with hasMore computation', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics?limit=1`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(Array.isArray(body.topics)).toBe(true);
    expect(body.topics.length).toBe(1);
    expect(body.hasMore).toBe(true);
  });

  it('creates a topic (requires CSRF + session)', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ title: 'New Topic' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(201);
    expect(body.id).toBe('t-new');
  });

  it('updates a topic (owner required)', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics/t1`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': 't' }, body: JSON.stringify({ title: 'Edited' }) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.rev).toBe('2-b');
  });

  it('searches topics via Mango regex with paging', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics?q=first&limit=2&offset=0`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(Array.isArray(body.topics)).toBe(true);
  });

  it('deletes a topic (owner required)', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics/t1`, { method: 'DELETE', headers: { 'x-csrf-token': 't' } });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.rev).toBe('3-c');
  });

  it('falls back to legacy view when no modern docs and shapes results', async () => {
    // Replace fetch to simulate no modern docs
    const orig = global.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return (orig as any)(url, init);
      }
      const okResp = (obj: any, status = 200) => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: 'OK',
        text: async () => JSON.stringify(obj),
        json: async () => obj,
      } as any);
      if (method === 'POST' && path.endsWith('/_find')) {
        return okResp({ docs: [] });
      }
      if (method === 'GET' && /_design\/waves_by_creation_date\/_view/.test(path)) {
        return okResp({ rows: [ { key: 1, value: 'legacy-1' } ] });
      }
      return okResp({}, 404);
    }) as any;

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics?limit=5`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.topics[0].id).toMatch(/^legacy:/);
    expect(body.topics[0].title).toBe('(legacy) wave');

    global.fetch = orig as any;
  });
});
