import express from 'express';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';

describe('routes: /api/waves', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    const realFetch = global.fetch as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
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
    }) as any;
  });

  it('lists waves with hasMore calculation', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
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
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/w1`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.id).toBe('w1');
    expect(Array.isArray(body.blips)).toBe(true);
  });
});

