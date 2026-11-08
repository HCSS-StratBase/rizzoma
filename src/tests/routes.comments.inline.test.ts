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
    req.session = req.get('x-test-anonymous') === '1'
      ? { csrfToken: 'token' }
      : { userId: 'inline-user', userName: 'Inline Tester', csrfToken: 'token' };
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
        const selector = (body && body.selector) || {};
        const docs = inlineDocs.filter((doc) =>
          Object.entries(selector).every(([k, v]) => (doc as any)[k] === v),
        );
        return okResp({ docs });
      }

      if (method === 'POST' && /\/[^/]+$/.test(path)) {
        const doc = body || {};
        inlineDocs.push(doc);
        return okResp({ ok: true, id: doc._id || 'doc', rev: '1-abc' }, 201);
      }

      if (method === 'GET' && /\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split('/').pop() || '');
        if (id === 'b1') {
          return okResp({ _id: 'b1', type: 'blip', waveId: 'w1', content: '<p>hello</p>', createdAt: 1, updatedAt: 1 });
        }
        if (id === 'task-as-blip') {
          return okResp({ _id: id, _rev: '1-task', type: 'task', waveId: 'w1', content: 'task', createdAt: 1, updatedAt: 1 });
        }
        if (id === 'deleted-blip') {
          return okResp({ _id: id, _rev: '1-blip', type: 'blip', waveId: 'w1', deleted: true, content: 'deleted', createdAt: 1, updatedAt: 1 });
        }
        if (id === 'w1') {
          return okResp({ _id: 'w1', type: 'wave', title: 'Wave', authorId: 'inline-user', createdAt: 1, updatedAt: 1 });
        }
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
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'token' },
      body: JSON.stringify({ blipId: 'b1', content: 'Root', range: baseRange }),
    });
    const rootBody = await rootResp.json();
    const root = rootBody.comment;

    const replyResp = await fetch(`http://127.0.0.1:${port}/api/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'token' },
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
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'token' },
      body: JSON.stringify({ resolved: true }),
    });
    expect(resolveResp.status).toBe(200);

    const afterResolve = inlineDocs.find((doc) => doc._id === root.id);
    expect(afterResolve?.resolved).toBe(true);
    expect(afterResolve?.resolvedAt).toBeDefined();

    const reopenResp = await fetch(`http://127.0.0.1:${port}/api/comments/${encodeURIComponent(root.id)}/resolve`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'token' },
      body: JSON.stringify({ resolved: false }),
    });
    expect(reopenResp.status).toBe(200);
    const afterReopen = inlineDocs.find((doc) => doc._id === root.id);
    expect(afterReopen?.resolved).toBe(false);
    expect(afterReopen?.resolvedAt).toBeNull();

    server.close();
  });

  it('rejects non-comment documents as parents or mutation targets', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const task = {
      _id: 'task:confused-target',
      _rev: '1-task',
      type: 'task',
      blipId: 'b1',
      waveId: 'w1',
      userId: 'inline-user',
      content: 'Task content',
      range: { start: 0, end: 5, text: 'hello' },
      resolved: false,
    };
    inlineDocs.push(task);

    const headers = { 'content-type': 'application/json', 'x-csrf-token': 'token' };
    const asParent = await fetch(`http://127.0.0.1:${port}/api/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        blipId: 'b1',
        content: 'Must not attach',
        range: { start: 0, end: 5, text: 'hello' },
        parentId: task._id,
      }),
    });
    expect(asParent.status).toBe(400);

    const resolve = await fetch(`http://127.0.0.1:${port}/api/comments/${encodeURIComponent(task._id)}/resolve`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ resolved: true }),
    });
    expect(resolve.status).toBe(404);

    const remove = await fetch(`http://127.0.0.1:${port}/api/comments/${encodeURIComponent(task._id)}`, {
      method: 'DELETE',
      headers,
    });
    expect(remove.status).toBe(404);
    expect(inlineDocs.find((doc) => doc._id === task._id)).toEqual(task);

    server.close();
  });

  it('rejects non-blip and deleted backing documents on every inline-comment path', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const headers = { 'content-type': 'application/json', 'x-csrf-token': 'token' };
    const range = { start: 0, end: 4, text: 'test' };
    const taskComment = {
      _id: 'comment-task-backing', _rev: '1-comment', id: 'comment-task-backing',
      type: 'inline_comment', blipId: 'task-as-blip', userId: 'inline-user', userName: 'Inline Tester',
      content: 'comment', range, resolved: false, createdAt: 1, updatedAt: 1,
    };
    const deletedComment = {
      ...taskComment, _id: 'comment-deleted-backing', id: 'comment-deleted-backing', blipId: 'deleted-blip',
    };
    inlineDocs.push(taskComment, deletedComment);

    for (const [blipId, commentId, expected] of [
      ['task-as-blip', taskComment._id, 404],
      ['deleted-blip', deletedComment._id, 410],
    ] as const) {
      const list = await fetch(`http://127.0.0.1:${port}/api/blip/${blipId}/comments`);
      const create = await fetch(`http://127.0.0.1:${port}/api/comments`, {
        method: 'POST', headers, body: JSON.stringify({ blipId, content: 'new', range }),
      });
      const resolve = await fetch(`http://127.0.0.1:${port}/api/comments/${commentId}/resolve`, {
        method: 'PATCH', headers, body: JSON.stringify({ resolved: true }),
      });
      const remove = await fetch(`http://127.0.0.1:${port}/api/comments/${commentId}`, {
        method: 'DELETE', headers,
      });
      expect([list.status, create.status, resolve.status, remove.status]).toEqual([expected, expected, expected, expected]);
    }
    expect(inlineDocs).toEqual(expect.arrayContaining([taskComment, deletedComment]));
    server.close();
  });

  it('returns an explicit public DTO without email, revisions, or arbitrary stored fields', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    inlineDocs.push({
      _id: 'comment-public-safe', _rev: '7-secret', id: 'comment-public-safe', type: 'inline_comment',
      blipId: 'b1', userId: 'author-user', userName: 'Public Author', userEmail: 'secret@example.test',
      userAvatar: 'https://example.test/avatar.png', content: 'Visible comment',
      range: { start: 0, end: 5, text: 'hello' }, resolved: false, createdAt: 1, updatedAt: 1,
      arbitrarySecret: 'must-not-leak',
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/blip/b1/comments`, {
      headers: { 'x-test-anonymous': '1' },
    });
    const body = await response.json();
    const comment = body.comments.find((candidate: any) => candidate.id === 'comment-public-safe');

    expect(response.status).toBe(200);
    expect(comment).toMatchObject({ content: 'Visible comment', userName: 'Public Author' });
    expect(comment).not.toHaveProperty('userEmail');
    expect(comment).not.toHaveProperty('_rev');
    expect(comment).not.toHaveProperty('arbitrarySecret');
    server.close();
  });
});
