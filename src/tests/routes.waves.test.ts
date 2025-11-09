import express from 'express';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';

describe('routes: /api/waves', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const okResp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && path.endsWith('/_find')) {
        // List waves (two docs)
        return okResp({ docs: [
          { _id: 'w2', type: 'wave', title: 'Second', createdAt: Date.now() - 1000 },
          { _id: 'w1', type: 'wave', title: 'First', createdAt: Date.now() - 2000 },
        ] });
      }
      if (method === 'GET' && /\/[^/]+$/.test(path)) {
        // getDoc for /api/waves/:id
        return okResp({ _id: 'w1', type: 'wave', title: 'First', createdAt: 1, updatedAt: 1 });
      }
      return okResp({}, 404);
    }) as typeof global.fetch;
  });

  it('lists waves with hasMore calculation', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves?limit=1`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(Array.isArray(body.waves)).toBe(true);
    expect(body.waves.length).toBe(1);
    expect(body.hasMore).toBe(true);
  });

  it('returns wave and blip tree (empty blips ok)', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/w1`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.id).toBe('w1');
    expect(Array.isArray(body.blips)).toBe(true);
  });
});
