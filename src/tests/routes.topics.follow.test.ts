import topicsRouter from '../server/routes/topics';

type Doc = Record<string, any> & { _id: string; _rev?: string };

describe('routes: /api/topics follow + list enrichment', () => {
  const docs = new Map<string, Doc>();
  let revCounter = 1;

  const findRoute = (method: string, path: string) => {
    return (topicsRouter as any).stack.find((layer: any) => layer.route?.path === path && layer.route?.methods?.[method.toLowerCase()]);
  };

  const runRoute = async (
    method: string,
    path: string,
    { params = {}, query = {}, body, session }: { params?: Record<string, string>; query?: Record<string, string>; body?: any; session?: any } = {},
  ) => {
    const layer = findRoute(method, path);
    if (!layer) throw new Error(`Route ${method} ${path} not found`);
    const handlers = layer.route.stack.map((stackEntry: any) => stackEntry.handle) as Array<(req: any, res: any, next: () => void) => any>;
    const req: any = {
      method,
      params,
      query,
      body,
      session: session ?? { userId: 'u1', csrfToken: 'token' },
      headers: { host: 'localhost', 'x-csrf-token': 'token' },
      protocol: 'http',
      get(header: string) { return (this.headers || {})[header.toLowerCase()]; },
    };
    const res: any = {
      statusCode: 200,
      body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: any) { this.body = payload; return this; },
      send(payload: any) { this.body = payload; return this; },
    };
    const runHandler = (handler: (req: any, res: any, next: (err?: any) => void) => any) =>
      new Promise<void>((resolve, reject) => {
        let nextCalled = false;
        const next = (err?: any) => {
          if (nextCalled) return;
          nextCalled = true;
          if (err) reject(err);
          else resolve();
        };
        try {
          const result = handler(req, res, next);
          if (result && typeof (result as Promise<any>).then === 'function') {
            (result as Promise<any>).then(() => {
              if (!nextCalled) resolve();
            }).catch(reject);
          } else if (handler.length < 3) {
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      });

    for (const handler of handlers) {
      await runHandler(handler);
    }
    return res;
  };

  beforeEach(() => {
    docs.clear();
    revCounter = 1;
  });

  beforeAll(() => {
    process.env['NODE_ENV'] = 'test';
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      const okResp = (obj: unknown, status = 200) =>
        new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

      if (method === 'POST' && path.endsWith('/_index')) {
        return okResp({ ok: true });
      }

      if (method === 'POST' && path.endsWith('/_find')) {
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as { selector?: Record<string, any> };
        const selector = body.selector ?? {};
        const type = selector['type'];
        let resultDocs: Doc[] = [];

        if (type === 'topic') {
          resultDocs = Array.from(docs.values()).filter((doc) => doc.type === 'topic');
        } else if (type === 'topic_follow') {
          resultDocs = Array.from(docs.values()).filter((doc) => doc.type === 'topic_follow' && doc.userId === selector['userId']);
        } else if (type === 'read' || type === 'blip') {
          resultDocs = [];
        }

        return okResp({ docs: resultDocs });
      }

      if (method === 'GET' && path.includes('/project_rizzoma/')) {
        const id = decodeURIComponent(path.split('/project_rizzoma/')[1] || '');
        const doc = docs.get(id);
        if (!doc) return okResp({ error: 'not_found' }, 404);
        return okResp(doc);
      }

      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Doc;
        const id = body._id || `doc-${revCounter}`;
        const rev = `${revCounter}-x`;
        revCounter += 1;
        docs.set(id, { ...body, _id: id, _rev: rev });
        return okResp({ ok: true, id, rev }, 201);
      }

      if (method === 'PUT' && path.includes('/project_rizzoma/')) {
        const id = decodeURIComponent(path.split('/project_rizzoma/')[1] || '');
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Doc;
        const rev = `${revCounter}-x`;
        revCounter += 1;
        docs.set(id, { ...body, _id: id, _rev: rev });
        return okResp({ ok: true, id, rev });
      }

      if (method === 'DELETE' && path.includes('/project_rizzoma/')) {
        const id = decodeURIComponent(path.split('/project_rizzoma/')[1] || '');
        docs.delete(id);
        return okResp({ ok: true, id, rev: `${revCounter}-x` });
      }

      return realFetch(url, init);
    }) as typeof global.fetch;
  });

  it('creates and removes topic follow docs', async () => {
    docs.set('t1', { _id: 't1', type: 'topic', title: 'T1', createdAt: 1, updatedAt: 1 });
    const follow = await runRoute('POST', '/:id/follow', { params: { id: 't1' } });
    expect([200, 201]).toContain(follow.statusCode ?? 200);
    expect(follow.body?.isFollowed).toBe(true);
    expect(docs.has('topic_follow:u1:t1')).toBe(true);

    const unfollow = await runRoute('POST', '/:id/unfollow', { params: { id: 't1' } });
    expect(unfollow.statusCode ?? 200).toBe(200);
    expect(unfollow.body?.isFollowed).toBe(false);
    expect(docs.has('topic_follow:u1:t1')).toBe(false);
  });

  it('enriches topic list with author, snippet, and follow state', async () => {
    docs.set('t1', {
      _id: 't1',
      type: 'topic',
      title: 'Hello',
      content: '<p>Hello <strong>world</strong></p>',
      authorId: 'u2',
      createdAt: 10,
      updatedAt: 12,
    });
    docs.set('u2', { _id: 'u2', type: 'user', email: 'alice@example.com', name: 'Alice', avatar: 'https://example.com/a.png' });
    docs.set('topic_follow:u1:t1', {
      _id: 'topic_follow:u1:t1',
      type: 'topic_follow',
      userId: 'u1',
      topicId: 't1',
      createdAt: 20,
      updatedAt: 20,
    });

    const resp = await runRoute('GET', '/', { session: { userId: 'u1', csrfToken: 'token' } });
    expect(resp.statusCode ?? 200).toBe(200);
    expect(Array.isArray(resp.body?.topics)).toBe(true);
    const topic = resp.body?.topics?.[0];
    expect(topic?.authorName).toBe('Alice');
    expect(topic?.authorAvatar).toBe('https://example.com/a.png');
    expect(topic?.snippet).toBe('Hello world');
    expect(topic?.isFollowed).toBe(true);
  });
});
