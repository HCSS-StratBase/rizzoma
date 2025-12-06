import express, { type Request, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import type { Session, SessionData } from 'express-session';
import type { AddressInfo } from 'net';
import wavesRouter from '../server/routes/waves';

type FetchHandler = (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const toJsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

describe('routes: /api/waves prev', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: Request & { session?: Session & Partial<SessionData> }, _res, next: NextFunction) => {
    req.session = Object.assign({ userId: 'u1' }, {} as Session & Partial<SessionData>);
    next();
  });
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    const realFetch = global.fetch as FetchHandler;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = new URL(String(url));
      const path = target.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((target.hostname === '127.0.0.1' || target.hostname === 'localhost') && path.startsWith('/api/waves/')) {
        if (method === 'GET' && /^\/api\/waves\/[^/]+$/.test(path)) {
          const body = {
            id: 'w1',
            title: 'W1',
            createdAt: 1,
            blips: [
              { id: 'b1', content: 'one', createdAt: 1 },
              { id: 'b2', content: 'two', createdAt: 2 },
            ],
          };
          return toJsonResponse(body);
        }
        return realFetch(url, init);
      }
      if (method === 'POST' && path.endsWith('/_find')) {
        return toJsonResponse({ docs: [] });
      }
      return toJsonResponse({}, 404);
    }) as FetchHandler;
  });

  it('returns previous unread when moving backwards', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/w1/prev?before=b2`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.prev).toBe('b1');
  });
});
