import express, { type Request, type NextFunction } from 'express';
import type { Session, SessionData } from 'express-session';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';
import type { AddressInfo } from 'net';

describe('routes: /api/waves edge cases', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  type SessionReq = Request & { session?: (Session & Partial<SessionData> & { userId?: string }) };
  app.use((req: SessionReq, _res, next: NextFunction) => { req.session = Object.assign({ userId: 'u1' }, {} as Session & Partial<SessionData>); next(); });
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/waves/')) {
        if (method === 'GET' && /^\/api\/waves\/empty$/.test(path)) {
          const body = { id: 'empty', title: 'Empty', createdAt: 1, blips: [] };
          return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return realFetch(url, init);
      }
      const okResp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && path.endsWith('/_find')) {
        return okResp({ docs: [] });
      }
      return okResp({}, 404);
    }) as typeof global.fetch;
  });

  it('unread for empty wave returns zeroes', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/empty/unread`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.unread.length).toBe(0);
    expect(body.total).toBe(0);
    expect(body.read).toBe(0);
  });

  it('next at end returns null', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
    // next after no blips → null
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/empty/next`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.next).toBe(null);
  });
});
