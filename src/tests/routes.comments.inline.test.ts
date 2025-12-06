import express from 'express';
import cookieParser from 'cookie-parser';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { requestId } from '../server/middleware/requestId';

describe('routes: inline comments threading', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId());
  app.use((req: any, _res, next) => {
    req.session = { userId: 'inline-user', userName: 'Inline Tester' };
    next();
  });

  const inlineDocs: any[] = [];
  const realFetch = global.fetch as any;

  beforeAll(async () => {
    process.env['FEAT_INLINE_COMMENTS'] = '1';
    const { inlineCommentsRouter } = await import('../server/routes/inlineComments');
    app.use('/api', inlineCommentsRouter);

    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      const body = init?.body ? JSON.parse(init.body) : undefined;
      const okResp = (obj: any, status = 200) => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: 'OK',
        text: async () => JSON.stringify(obj),
        json: async () => obj,
      });

      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }

      if (method === 'GET' && path.includes('/_design/comments/_view/by_blip')) {
        const keyParam = u.searchParams.get('key');
        let key: string | undefined;
        if (keyParam) {
          try {
            key = JSON.parse(keyParam);
          } catch {
            key = keyParam;
          }
        }
        const rows = inlineDocs
          .filter((doc) => doc.blipId === key)
          .map((doc) => ({ id: doc._id, key: doc.blipId, value: null, doc }));
        return okResp({ rows });
      }

      if (method === 'POST' && path.endsWith('/_find')) {
        return okResp({ docs: [] });
      }

      if (method === 'POST' && /\/[^/]+$/.test(path)) {
        const doc = body || {};
        inlineDocs.push(doc);
        return okResp({ ok: true, id: doc._id || 'doc', rev: '1-abc' }, 201);
      }

      if (method === 'GET' && /\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split('/').pop() || '');
        const found = inlineDocs.find((doc) => doc._id === id);
        if (found) return okResp(found);
        return okResp({}, 404);
      }

      if (method === 'PUT' && /\/[^/]+$/.test(path)) {
        const doc = body || {};
        const idx = inlineDocs.findIndex((d) => d._id === doc._id);
        if (idx >= 0) inlineDocs[idx] = doc;
        return okResp({ ok: true, id: doc._id || 'doc', rev: '2-abc' });
      }

      if (method === 'DELETE' && /\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split('/').pop() || '');
        const idx = inlineDocs.findIndex((d) => d._id === id);
        if (idx >= 0) inlineDocs.splice(idx, 1);
        return okResp({ ok: true, id, rev: '3-def' });
      }

      return okResp({}, 404);
    }) as any;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it('threads inline comments and supports resolve/reopen', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseRange = { start: 0, end: 5, text: 'hello' };

    const rootResp = await fetch(`http://127.0.0.1:${port}/api/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blipId: 'b1', content: 'Root', range: baseRange }),
    });
    const rootBody = await rootResp.json();
    const root = rootBody.comment;

    const replyResp = await fetch(`http://127.0.0.1:${port}/api/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ blipId: 'b1', content: 'Child', range: baseRange, parentId: root.id }),
    });
    const replyBody = await replyResp.json();
    const reply = replyBody.comment;

    expect(reply.parentId).toBe(root.id);
    expect(reply.rootId).toBe(root.id);
    expect(reply.range).toMatchObject(baseRange);

    const listResp = await fetch(`http://127.0.0.1:${port}/api/blip/b1/comments`);
    const list = await listResp.json();
    expect(list.comments).toHaveLength(2);
    expect(list.comments.find((c: any) => c.id === root.id)?.parentId).toBeUndefined();
    expect(list.comments.find((c: any) => c.id === reply.id)?.parentId).toBe(root.id);

    const resolveResp = await fetch(`http://127.0.0.1:${port}/api/comments/${encodeURIComponent(root.id)}/resolve`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved: true }),
    });
    expect(resolveResp.status).toBe(200);

    const afterResolve = inlineDocs.find((doc) => doc._id === root.id);
    expect(afterResolve?.resolved).toBe(true);
    expect(afterResolve?.resolvedAt).toBeDefined();

    const reopenResp = await fetch(`http://127.0.0.1:${port}/api/comments/${encodeURIComponent(root.id)}/resolve`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved: false }),
    });
    expect(reopenResp.status).toBe(200);
    const afterReopen = inlineDocs.find((doc) => doc._id === root.id);
    expect(afterReopen?.resolved).toBe(false);
    expect(afterReopen?.resolvedAt).toBeNull();

    server.close();
  });
});
