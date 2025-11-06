import express from 'express';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';

describe('routes: /api/waves seed_sample (dev-only)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    const realFetch = global.fetch as any;
    // Minimal in-memory inserts collector
    const docs: any[] = [];
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const okResp = (obj: any, status = 200) => ({ ok: status >= 200 && status < 300, status, statusText: 'OK', text: async () => JSON.stringify(obj), json: async () => obj } as any);
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        const body = JSON.parse(init?.body?.toString() || '{}');
        docs.push(body);
        return okResp({ ok: true, id: body._id || 'id', rev: '1-x' }, 201);
      }
      return okResp({}, 404);
    }) as any;
  });

  it('creates a demo wave and some blips', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/seed_sample?depth=2&breadth=2`, { method: 'POST' });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe('string');
    expect(body.blips).toBeGreaterThan(0);
  });
});

