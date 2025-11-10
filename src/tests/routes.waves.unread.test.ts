import express, { type Request, type NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';
import type { AddressInfo } from 'net';

describe('routes: /api/waves unread/next', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  // session shim
  // Minimal augmentation of request to attach session info for tests
  type SessionReq = Request & { session?: (Session & Partial<SessionData> & { userId?: string }) };
  app.use((req: SessionReq, _res, next: NextFunction) => {
    req.session = Object.assign({ userId: 'u1' }, {} as Session & Partial<SessionData>);
    next();
  });
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    process.env['NODE_ENV'] = 'test';
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    const readDocs: Array<Record<string, unknown>> = [];
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
            blips: [
              { id: 'b1', content: 'one', createdAt: 1, children: [ { id: 'b1a', content: 'one a', createdAt: 2 } ] },
              { id: 'b2', content: 'two', createdAt: 3 },
            ],
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
        readDocs.push(body);
        const id = (typeof body['_id'] === 'string' && body['_id'] !== '') ? body['_id'] as string : 'r1';
        return okResp({ ok: true, id, rev: '1-x' }, 201);
      }
      return okResp({}, 404);
    }) as typeof global.fetch;
  });

  it('returns unread list when no reads present', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
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
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
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
