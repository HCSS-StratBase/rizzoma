import express from 'express';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';
<<<<<<< HEAD
import type { AddressInfo } from 'net';
=======
>>>>>>> fd48326 (phase3: bulk waves materialize (dev-only) + tests; docs: bulk endpoint usage)

describe('routes: /api/waves (materialize dev-only)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
<<<<<<< HEAD
    process.env['NODE_ENV'] = 'test';
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const okResp = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
=======
    process.env.NODE_ENV = 'test';
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
>>>>>>> fd48326 (phase3: bulk waves materialize (dev-only) + tests; docs: bulk endpoint usage)
      if (method === 'GET' && /_design\/waves_by_creation_date\/_view/.test(path)) {
        // Return two legacy wave ids
        return okResp({ rows: [ { key: Date.now(), value: 'w-legacy-1' }, { key: Date.now()-1000, value: 'w-legacy-2' } ] });
      }
      if (method === 'GET' && /_design\/nonremoved_blips_by_wave_id\/_view/.test(path)) {
        return okResp({ rows: [] });
      }
      if (method === 'GET' && /\/project_rizzoma\/w-legacy/.test(path)) {
        // getDoc – simulate not found by returning 404
<<<<<<< HEAD
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' } });
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        // insertDoc
        const parsed = JSON.parse((init?.body as string | undefined) ?? '{}') as { _id?: string };
        const id = typeof parsed._id === 'string' && parsed._id !== '' ? parsed._id : 'w-new';
        return okResp({ ok: true, id, rev: '1-x' }, 201);
      }
      return okResp({}, 404);
    }) as typeof global.fetch;
=======
        return { ok: false, status: 404, statusText: 'Not Found', text: async () => JSON.stringify({ error: 'not_found' }) } as any;
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        // insertDoc
        return okResp({ ok: true, id: JSON.parse(init?.body?.toString()||'{}')._id || 'w-new', rev: '1-x' }, 201);
      }
      return okResp({}, 404);
    }) as any;
>>>>>>> fd48326 (phase3: bulk waves materialize (dev-only) + tests; docs: bulk endpoint usage)
  });

  it('bulk materializes a set of wave docs', async () => {
    const server = app.listen(0);
<<<<<<< HEAD
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as AddressInfo).port;
=======
    const port = (server.address() as any).port;
>>>>>>> fd48326 (phase3: bulk waves materialize (dev-only) + tests; docs: bulk endpoint usage)
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/materialize?limit=2`, { method: 'POST' });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(1);
  });
});
<<<<<<< HEAD
=======

>>>>>>> fd48326 (phase3: bulk waves materialize (dev-only) + tests; docs: bulk endpoint usage)
