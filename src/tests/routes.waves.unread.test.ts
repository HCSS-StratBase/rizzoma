import express from 'express';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';

describe('routes: /api/waves unread/next', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // session shim
  app.use((req: any, _res, next) => { req.session = { userId: 'u1' }; next(); });
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    const realFetch = global.fetch as any;
    const readDocs: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      // Forward local API routes except the tree fetch we stub
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/waves/')) {
        // If fetching just the wave detail (not unread/next/read), return stub tree
        if (method === 'GET' && /^\/api\/waves\/[^/]+$/.test(path)) {
          const body = {
            id: 'w1', title: 'W1', createdAt: 1,
            blips: [
              { id: 'b1', content: 'one', createdAt: 1, children: [ { id: 'b1a', content: 'one a', createdAt: 2 } ] },
              { id: 'b2', content: 'two', createdAt: 3 },
            ],
          };
          return {
            ok: true, status: 200, statusText: 'OK',
            text: async () => JSON.stringify(body),
            json: async () => body,
          } as any;
        }
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
        const sel = JSON.parse(init?.body?.toString() || '{}').selector || {};
        if (sel.type === 'read') {
          return okResp({ docs: readDocs.slice() });
        }
        return okResp({ docs: [] });
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        // insert read doc
        const body = JSON.parse(init?.body?.toString() || '{}');
        readDocs.push(body);
        return okResp({ ok: true, id: body._id || 'r1', rev: '1-x' }, 201);
      }
      return okResp({}, 404);
    }) as any;
  });

  it('returns unread list when no reads present', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/w1/unread`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(Array.isArray(body.unread)).toBe(true);
    // flattened preorder: [b1, b1a, b2]
    expect(body.unread[0]).toBe('b1');
  });

  it('next returns first unread, then advances after marking read', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    let r = await fetch(`http://127.0.0.1:${port}/api/waves/w1/next`);
    let b = await r.json();
    expect(b.next).toBe('b1');
    // mark b1 as read
    await fetch(`http://127.0.0.1:${port}/api/waves/w1/blips/b1/read`, { method: 'POST' });
    // next after b1 should be b1a
    r = await fetch(`http://127.0.0.1:${port}/api/waves/w1/next?after=b1`);
    b = await r.json();
    server.close();
    expect(b.next).toBe('b1a');
  });
});

