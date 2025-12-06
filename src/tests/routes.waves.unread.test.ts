import wavesRouter from '../server/routes/waves';

const makeBlips = () => ([
  { id: 'b1', content: 'one', createdAt: 1, updatedAt: 1, children: [ { id: 'b1a', content: 'one a', createdAt: 2, updatedAt: 2 } ] },
  { id: 'b2', content: 'two', createdAt: 3, updatedAt: 3 },
]);

const cloneBlips = (nodes: any[]): any[] => nodes.map((n) => ({ ...n, children: cloneBlips(n.children || []) }));

describe('routes: /api/waves unread/next', () => {
  let waveBlips = makeBlips();
  let readDocs: Array<Record<string, unknown>> = [];
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
    const handler = layer.route.stack[0].handle as (req: any, res: any, next: () => void) => any;
    const req: any = {
      method,
      params,
      query,
      body,
      session: { userId: 'u1' },
      headers: { host: 'localhost' },
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
    await handler(req, res, () => {});
    return res;
  };

  beforeEach(() => {
    waveBlips = makeBlips();
    readDocs = [];
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
        return okResp({ docs: [] });
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        // insert read doc
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Record<string, unknown>;
        const stored = { ...body, _rev: '1-x' };
        readDocs.push(stored);
        const id = (typeof body['_id'] === 'string' && body['_id'] !== '') ? body['_id'] as string : 'r1';
        return okResp({ ok: true, id, rev: '1-x' }, 201);
      }
      if (method === 'PUT' && /\/project_rizzoma\/.+/.test(path)) {
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Record<string, unknown>;
        const idx = readDocs.findIndex((d) => d._id === body._id);
        const stored = { ...body, _rev: '2-x' };
        if (idx >= 0) readDocs[idx] = stored;
        return okResp({ ok: true, id: body._id || 'r1', rev: stored._rev });
      }
      return okResp({}, 404);
    }) as typeof global.fetch;
  });

  it('returns unread list when no reads present', async () => {
    const resp = await runRoute('GET', '/:id/unread', { params: { id: 'w1' } });
    const body = resp.body;
    expect(resp.statusCode ?? 200).toBe(200);
    expect(Array.isArray(body.unread)).toBe(true);
    // flattened preorder: [b1, b1a, b2]
    expect(body.unread[0]).toBe('b1');
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
});
