import express from 'express';
import cookieParser from 'cookie-parser';
import { vi } from 'vitest';

// Increase timeout for module loading with mocks
vi.setConfig({ hookTimeout: 30000 });

describe('routes: /api/editor (realtime + search)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  beforeAll(async () => {
    process.env['EDITOR_ENABLE'] = '1';
    const realFetch = global.fetch as (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    // Mock CouchDB endpoints used by editor routes
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
        // editor search returns docs with waveId/blipId
        const body = JSON.parse((init?.body as string) || '{}') as any;
        if (body?.selector?.type === 'yjs_snapshot') {
          return ok({ docs: [{ waveId: 'w1', blipId: 'b1', updatedAt: Date.now() }] });
        }
        return ok({ docs: [] });
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        // insertDoc (snapshots/updates)
        return ok({ ok: true, id: 'x', rev: '1-x' }, 201);
      }
      if (method === 'GET' && /\/project_rizzoma\/?$/.test(path)) {
        // couchDbInfo
        return ok({ couchdb: 'Welcome', version: '3.x' });
      }
      return ok({}, 404);
    }) as typeof global.fetch;

    const router = (await import('../server/routes/editor')).default;
    app.use('/api/editor', router);
  });

  it('accepts incremental updates and responds 201', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/editor/w1/updates`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ seq: 1, updateB64: Buffer.from(new Uint8Array([1,2,3])).toString('base64'), blipId: 'b1' }) });
    server.close();
    expect(resp.status).toBe(201);
  });

  it('search endpoint returns results', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/editor/search?q=test&limit=5`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    const first = body.results[0];
    expect(first.waveId).toBe('w1');
    expect(first.blipId).toBe('b1');
  });
});
