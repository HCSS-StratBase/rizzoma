import express from 'express';
import cookieParser from 'cookie-parser';

describe('routes: /api/editor rebuild snapshot', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  beforeAll(async () => {
    process.env['EDITOR_ENABLE'] = '1';
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const ok = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && path.endsWith('/_index')) return ok({ ok: true, result: 'created' });
      if (method === 'POST' && path.endsWith('/_find')) {
        // return no updates (empty) — rebuild should still produce a snapshot
        return ok({ docs: [] });
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        return ok({ ok: true, id: 'snap', rev: '1-x' }, 201);
      }
      return ok({}, 404);
    }) as typeof global.fetch;

    const router = (await import('../server/routes/editor')).default;
    app.use('/api/editor', router);
  });

  it('rebuilds snapshot and returns ok', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/editor/w1/rebuild`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

