import express from 'express';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';

describe('routes: /api/waves prev', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res, next) => { req.session = { userId: 'u1' }; next(); });
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    const realFetch = global.fetch as any;
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/waves/')) {
        if (method === 'GET' && /^\/api\/waves\/[^/]+$/.test(path)) {
          const body = {
            id: 'w1', title: 'W1', createdAt: 1,
            blips: [ { id: 'b1', content: 'one', createdAt: 1 }, { id: 'b2', content: 'two', createdAt: 2 } ],
          };
          return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body), json: async () => body } as any;
        }
        return realFetch(url, init);
      }
      const okResp = (obj: any, status = 200) => ({ ok: status >= 200 && status < 300, status, statusText: 'OK', text: async () => JSON.stringify(obj), json: async () => obj } as any);
      if (method === 'POST' && path.endsWith('/_find')) {
        const sel = JSON.parse(init?.body?.toString() || '{}').selector || {};
        if (sel.type === 'read') return okResp({ docs: [] });
        return okResp({ docs: [] });
      }
      return okResp({}, 404);
    }) as any;
  });

  it('returns previous unread when moving backwards', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/w1/prev?before=b2`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.prev).toBe('b1');
  });
});

