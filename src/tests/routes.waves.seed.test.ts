import express from 'express';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';
import type { AddressInfo } from 'net';

describe('routes: /api/waves seed_sample (dev-only)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    process.env['NODE_ENV'] = 'test';
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    // Minimal in-memory inserts collector
    const docs: Array<Record<string, unknown>> = [];
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const okResp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Record<string, unknown>;
        docs.push(body);
        const id = typeof body['_id'] === 'string' && body['_id'] !== '' ? (body['_id'] as string) : 'id';
        return okResp({ ok: true, id, rev: '1-x' }, 201);
      }
      return okResp({}, 404);
    }) as typeof global.fetch;
  });

  it('creates a demo wave and some blips', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/seed_sample?depth=2&breadth=2`, { method: 'POST' });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe('string');
    expect(body.blips).toBeGreaterThan(0);
  });
});
