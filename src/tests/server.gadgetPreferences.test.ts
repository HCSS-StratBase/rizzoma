import gadgetsRouter from '../server/routes/gadgets';

type Doc = Record<string, any> & { _id: string; _rev?: string };

describe('server: gadget preferences route', () => {
  const docs = new Map<string, Doc>();
  let revCounter = 1;

  const findRoute = (method: string, path: string) =>
    (gadgetsRouter as any).stack.find((layer: any) => layer.route?.path === path && layer.route?.methods?.[method.toLowerCase()]);

  const runRoute = async (
    method: string,
    path: string,
    { body, session }: { body?: any; session?: any } = {},
  ) => {
    const layer = findRoute(method, path);
    if (!layer) throw new Error(`Route ${method} ${path} not found`);
    const handlers = layer.route.stack.map((entry: any) => entry.handle) as Array<(req: any, res: any, next: () => void) => any>;
    const req: any = {
      method,
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
          if (result && typeof result.then === 'function') {
            result.then(() => {
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
      const pathname = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      const okResp = (obj: unknown, status = 200) =>
        new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

      if (method === 'POST' && /\/project_rizzoma\/?$/.test(pathname)) {
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Doc;
        const id = body._id || `doc-${revCounter}`;
        const rev = `${revCounter}-x`;
        revCounter += 1;
        docs.set(id, { ...body, _id: id, _rev: rev });
        return okResp({ ok: true, id, rev }, 201);
      }

      if (method === 'GET' && pathname.includes('/project_rizzoma/')) {
        const id = decodeURIComponent(pathname.split('/project_rizzoma/')[1] || '');
        const doc = docs.get(id);
        if (!doc) return okResp({ error: 'not_found' }, 404);
        return okResp(doc);
      }

      if (method === 'PUT' && pathname.includes('/project_rizzoma/')) {
        const id = decodeURIComponent(pathname.split('/project_rizzoma/')[1] || '');
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Doc;
        const rev = `${revCounter}-x`;
        revCounter += 1;
        docs.set(id, { ...body, _id: id, _rev: rev });
        return okResp({ ok: true, id, rev });
      }

      return realFetch(url, init);
    }) as typeof global.fetch;
  });

  it('returns default preview apps when no preference doc exists', async () => {
    const res = await runRoute('GET', '/preferences');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      schemaVersion: 1,
      scope: 'user',
      defaultInstalledAppIds: ['kanban-board', 'calendar-planner', 'focus-timer'],
      installedAppIds: ['kanban-board', 'calendar-planner', 'focus-timer'],
    });
  });

  it('creates and sanitizes gadget preferences', async () => {
    const res = await runRoute('PATCH', '/preferences', {
      body: { installedAppIds: ['focus-timer', 'github-workbench', 'bogus'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      schemaVersion: 1,
      scope: 'user',
      defaultInstalledAppIds: ['kanban-board', 'calendar-planner', 'focus-timer'],
      installedAppIds: ['focus-timer', 'github-workbench'],
    });
    expect(docs.get('gadget_prefs:u1')?.installedAppIds).toEqual(['focus-timer', 'github-workbench']);
  });

  it('updates an existing preference doc', async () => {
    docs.set('gadget_prefs:u1', {
      _id: 'gadget_prefs:u1',
      _rev: '1-a',
      type: 'gadget_preferences',
      userId: 'u1',
      installedAppIds: ['focus-timer'],
      createdAt: 1,
      updatedAt: 1,
    });

    const res = await runRoute('PATCH', '/preferences', {
      body: { installedAppIds: ['calendar-planner'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      schemaVersion: 1,
      scope: 'user',
      defaultInstalledAppIds: ['kanban-board', 'calendar-planner', 'focus-timer'],
      installedAppIds: ['calendar-planner'],
    });
    expect(docs.get('gadget_prefs:u1')?.installedAppIds).toEqual(['calendar-planner']);
  });

  it('resets preferences back to shipped defaults', async () => {
    docs.set('gadget_prefs:u1', {
      _id: 'gadget_prefs:u1',
      _rev: '1-a',
      type: 'gadget_preferences',
      userId: 'u1',
      installedAppIds: ['github-workbench'],
      createdAt: 1,
      updatedAt: 1,
    });

    const res = await runRoute('PATCH', '/preferences', {
      body: { reset: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      schemaVersion: 1,
      scope: 'user',
      defaultInstalledAppIds: ['kanban-board', 'calendar-planner', 'focus-timer'],
      installedAppIds: ['kanban-board', 'calendar-planner', 'focus-timer'],
    });
    expect(docs.get('gadget_prefs:u1')?.installedAppIds).toEqual([
      'kanban-board',
      'calendar-planner',
      'focus-timer',
    ]);
  });
});
