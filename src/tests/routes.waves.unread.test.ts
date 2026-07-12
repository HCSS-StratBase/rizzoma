import wavesRouter from '../server/routes/waves';

const makeBlips = () => ([
  { id: 'b1', content: 'one', createdAt: 1, updatedAt: 1, children: [ { id: 'b1a', content: 'one a', createdAt: 2, updatedAt: 2 } ] },
  { id: 'b2', content: 'two', createdAt: 3, updatedAt: 3 },
]);

const cloneBlips = (nodes: any[]): any[] => nodes.map((n) => ({ ...n, children: cloneBlips(n.children || []) }));

describe('routes: /api/waves unread/next', () => {
  let waveBlips = makeBlips();
  let readDocs: Array<Record<string, unknown>> = [];
  let selfFetchPaths: string[] = [];
  let holdConcurrentReadPuts = false;
  let concurrentReadPutArrivals = 0;
  let releaseConcurrentReadPuts: (() => void) | undefined;
  let concurrentReadPutBarrier: Promise<void> = Promise.resolve();
  let holdConcurrentReadPosts = false;
  let concurrentReadPostArrivals = 0;
  let releaseConcurrentReadPosts: (() => void) | undefined;
  let concurrentReadPostBarrier: Promise<void> = Promise.resolve();
  let failNextReadPutStatus: number | undefined;
  const findRoute = (method: string, path: string) => {
    return (wavesRouter as any).stack.find((layer: any) => layer.route?.path === path && layer.route?.methods?.[method.toLowerCase()]);
  };

  const runRoute = async (
    method: string,
    path: string,
    { params = {}, query = {}, body }: { params?: Record<string, string>; query?: Record<string, string>; body?: any } = {},
  ) => {
    const layer = findRoute(method, path);
    if (!layer) throw new Error(`Route ${method} ${path} not found`);
    const handlers = layer.route.stack.map((e: any) => e.handle) as Array<(req: any, res: any, next: (err?: any) => void) => any>;
    const req: any = {
      method,
      params,
      query,
      body,
      session: { userId: 'u1', csrfToken: 'token' },
      headers: { host: 'localhost', 'x-csrf-token': 'token' },
      protocol: 'http',
      get(header: string) { return (this.headers || {})[header.toLowerCase()]; },
    };
    const res: any = {
      statusCode: 200,
      headers: {} as Record<string, unknown>,
      body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: any) { this.body = payload; return this; },
      send(payload: any) { this.body = payload; return this; },
      setHeader(name: string, value: unknown) { (this.headers as any)[name.toLowerCase()] = value; },
      getHeader(name: string) { return (this.headers as any)[name.toLowerCase()]; },
    };
    for (const handler of handlers) {
      await new Promise<void>((resolve, reject) => {
        let done = false;
        const next = (err?: any) => { if (done) return; done = true; err ? reject(err) : resolve(); };
        try {
          const r = handler(req, res, next);
          if (r && typeof r.then === 'function') r.then(() => { if (!done) { done = true; resolve(); } }).catch(reject);
        } catch (e) { reject(e); }
      });
    }
    return res;
  };

  beforeEach(() => {
    waveBlips = makeBlips();
    readDocs = [];
    selfFetchPaths = [];
    holdConcurrentReadPuts = false;
    concurrentReadPutArrivals = 0;
    releaseConcurrentReadPuts = undefined;
    concurrentReadPutBarrier = Promise.resolve();
    holdConcurrentReadPosts = false;
    concurrentReadPostArrivals = 0;
    releaseConcurrentReadPosts = undefined;
    concurrentReadPostBarrier = Promise.resolve();
    failNextReadPutStatus = undefined;
  });

  beforeAll(() => {
    process.env['NODE_ENV'] = 'test';
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      // Forward local API routes except the tree fetch we stub
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/waves/')) {
        selfFetchPaths.push(path);
        // If fetching just the wave detail (not unread/next/read), return stub tree
        if (method === 'GET' && /^\/api\/waves\/[^/]+$/.test(path)) {
          const body = {
            id: 'w1', title: 'W1', createdAt: 1,
            blips: cloneBlips(waveBlips),
          };
          return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return realFetch(url, init);
      }
      const okResp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && path.endsWith('/_find')) {
        const sel = (JSON.parse((init?.body as string | undefined) ?? '{}') as { selector?: Record<string, unknown> }).selector ?? {};
        if (sel['type'] === 'read') {
          return okResp({ docs: readDocs.slice() as unknown[] });
        }
        // Handle blip queries - return flattened blips with _id and timestamps
        if (sel['type'] === 'blip') {
          const flatBlips = cloneBlips(waveBlips);
          const docs: any[] = [];
          const flatten = (nodes: any[]) => {
            for (const n of nodes) {
              docs.push({ _id: n.id, type: 'blip', waveId: sel['waveId'] || 'w1', content: n.content, createdAt: n.createdAt, updatedAt: n.updatedAt });
              if (n.children) flatten(n.children);
            }
          };
          flatten(flatBlips);
          return okResp({ docs });
        }
        return okResp({ docs: [] });
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        // insert read doc
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Record<string, unknown>;
        if (holdConcurrentReadPosts) {
          concurrentReadPostArrivals += 1;
          if (concurrentReadPostArrivals === 2) releaseConcurrentReadPosts?.();
          await concurrentReadPostBarrier;
        }
        if (readDocs.some((doc) => doc['_id'] === body['_id'])) {
          return okResp({ error: 'conflict', reason: 'Document update conflict.' }, 409);
        }
        const stored = { ...body, _rev: '1-x' };
        readDocs.push(stored);
        const id = (typeof body['_id'] === 'string' && body['_id'] !== '') ? body['_id'] as string : 'r1';
        return okResp({ ok: true, id, rev: '1-x' }, 201);
      }
      if (method === 'GET' && /\/project_rizzoma\/.+/.test(path)) {
        const id = decodeURIComponent(path.slice(path.lastIndexOf('/') + 1));
        const doc = readDocs.find((candidate) => candidate['_id'] === id);
        return doc
          ? okResp({ ...doc })
          : okResp({ error: 'not_found', reason: 'missing' }, 404);
      }
      if (method === 'PUT' && /\/project_rizzoma\/.+/.test(path)) {
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Record<string, unknown>;
        if (failNextReadPutStatus) {
          const status = failNextReadPutStatus;
          failNextReadPutStatus = undefined;
          return okResp({ error: 'storage_failure', reason: 'simulated storage failure' }, status);
        }
        if (holdConcurrentReadPuts) {
          concurrentReadPutArrivals += 1;
          if (concurrentReadPutArrivals === 2) releaseConcurrentReadPuts?.();
          await concurrentReadPutBarrier;
        }
        const idx = readDocs.findIndex((d) => d['_id'] === body['_id']);
        if (idx < 0) return okResp({ error: 'not_found', reason: 'missing' }, 404);
        const current = readDocs[idx]!;
        if (body['_rev'] !== current['_rev']) {
          return okResp({ error: 'conflict', reason: 'Document update conflict.' }, 409);
        }
        const nextRevision = Number.parseInt(String(current['_rev'] || '0').split('-', 1)[0] || '0', 10) + 1;
        const stored = { ...body, _rev: `${nextRevision}-x` };
        readDocs[idx] = stored;
        return okResp({ ok: true, id: body['_id'] || 'r1', rev: stored._rev });
      }
      return okResp({}, 404);
    }) as typeof global.fetch;
  });

  it('returns unread list when no reads present', async () => {
    const resp = await runRoute('GET', '/:id/unread', { params: { id: 'w1' } });
    const body = resp.body;
    expect(resp.statusCode ?? 200).toBe(200);
    expect(body.unread).toEqual(['b1', 'b1a', 'b2']);
    expect(body.total).toBe(3);
    expect(body.read).toBe(0);
    expect(selfFetchPaths).toEqual([]);
  });

  it('next returns first unread, then advances after marking read', async () => {
    let r = await runRoute('GET', '/:id/next', { params: { id: 'w1' } });
    let b = r.body;
    expect(b.next).toBe('b1');
    // mark b1 as read
    await runRoute('POST', '/:waveId/blips/:blipId/read', { params: { waveId: 'w1', blipId: 'b1' } });
    // next after b1 should be b1a
    r = await runRoute('GET', '/:id/next', { params: { id: 'w1' }, query: { after: 'b1' } });
    b = r.body;
    expect(b.next).toBe('b1a');
  });

  it('returns a blip to unread when updated after being read', async () => {
    await runRoute('POST', '/:waveId/blips/:blipId/read', { params: { waveId: 'w1', blipId: 'b1' } });
    const firstReadAt = Number((readDocs[0] as any)?.readAt || 0);
    waveBlips[0].updatedAt = firstReadAt + 10;
    const resp = await runRoute('GET', '/:id/unread', { params: { id: 'w1' } });
    const body = resp.body;
    expect(body.unread).toContain('b1');
  });

  it('updates existing read timestamps when marking read again', async () => {
    await runRoute('POST', '/:waveId/blips/:blipId/read', { params: { waveId: 'w1', blipId: 'b1' } });
    const firstReadAt = Number((readDocs[0] as any)?.readAt || 0);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await runRoute('POST', '/:waveId/blips/:blipId/read', { params: { waveId: 'w1', blipId: 'b1' } });
    const secondReadAt = Number((readDocs[0] as any)?.readAt || 0);
    expect(secondReadAt).toBeGreaterThan(firstReadAt);
  });

  it('updates a legacy random-ID read marker without creating a duplicate', async () => {
    readDocs = [{
      _id: 'legacy-read-marker',
      _rev: '1-x',
      type: 'read',
      userId: 'u1',
      waveId: 'w1',
      blipId: 'b1',
      readAt: 1,
    }];

    const response = await runRoute('POST', '/:waveId/blips/:blipId/read', {
      params: { waveId: 'w1', blipId: 'b1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.id).toBe('legacy-read-marker');
    expect(readDocs).toHaveLength(1);
    expect(readDocs[0]?.['_id']).toBe('legacy-read-marker');
    expect(Number(readDocs[0]?.['readAt'] || 0)).toBeGreaterThan(1);
  });

  it('makes overlapping mark-read updates conflict-idempotent', async () => {
    const markerId = 'read:user:u1:wave:w1:blip:b1';
    readDocs = [{
      _id: markerId,
      _rev: '1-x',
      type: 'read',
      userId: 'u1',
      waveId: 'w1',
      blipId: 'b1',
      readAt: 1,
    }];
    holdConcurrentReadPuts = true;
    concurrentReadPutBarrier = new Promise<void>((resolve) => {
      releaseConcurrentReadPuts = resolve;
    });

    const [first, second] = await Promise.all([
      runRoute('POST', '/:waveId/blips/:blipId/read', { params: { waveId: 'w1', blipId: 'b1' } }),
      runRoute('POST', '/:waveId/blips/:blipId/read', { params: { waveId: 'w1', blipId: 'b1' } }),
    ]);

    expect(first.statusCode).toBeGreaterThanOrEqual(200);
    expect(first.statusCode).toBeLessThan(300);
    expect(second.statusCode).toBeGreaterThanOrEqual(200);
    expect(second.statusCode).toBeLessThan(300);
    expect(first.body.ok).toBe(true);
    expect(second.body.ok).toBe(true);
    expect(readDocs).toHaveLength(1);
    expect(Number(readDocs[0]?.['readAt'] || 0)).toBeGreaterThan(1);
    expect(Number.isFinite(Number(readDocs[0]?.['readAt']))).toBe(true);
  });

  it('makes overlapping first mark-read inserts conflict-idempotent', async () => {
    holdConcurrentReadPosts = true;
    concurrentReadPostBarrier = new Promise<void>((resolve) => {
      releaseConcurrentReadPosts = resolve;
    });

    const [first, second] = await Promise.all([
      runRoute('POST', '/:waveId/blips/:blipId/read', { params: { waveId: 'w1', blipId: 'b1' } }),
      runRoute('POST', '/:waveId/blips/:blipId/read', { params: { waveId: 'w1', blipId: 'b1' } }),
    ]);

    expect(first.statusCode).toBeGreaterThanOrEqual(200);
    expect(first.statusCode).toBeLessThan(300);
    expect(second.statusCode).toBeGreaterThanOrEqual(200);
    expect(second.statusCode).toBeLessThan(300);
    expect(first.body.ok).toBe(true);
    expect(second.body.ok).toBe(true);
    expect(readDocs).toHaveLength(1);
    expect(readDocs[0]?.['_id']).toBe('read:user:u1:wave:w1:blip:b1');
    expect(Number(readDocs[0]?.['readAt'] || 0)).toBeGreaterThan(0);
    expect(Number.isFinite(Number(readDocs[0]?.['readAt']))).toBe(true);
  });

  it('does not retry or mask non-conflict storage failures', async () => {
    readDocs = [{
      _id: 'read:user:u1:wave:w1:blip:b1',
      _rev: '1-x',
      type: 'read',
      userId: 'u1',
      waveId: 'w1',
      blipId: 'b1',
      readAt: 1,
    }];
    failNextReadPutStatus = 503;

    const response = await runRoute('POST', '/:waveId/blips/:blipId/read', {
      params: { waveId: 'w1', blipId: 'b1' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toContain('503 simulated storage failure');
    expect(readDocs[0]?.['_rev']).toBe('1-x');
  });
});
