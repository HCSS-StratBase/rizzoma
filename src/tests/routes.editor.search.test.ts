import express from 'express';
import cookieParser from 'cookie-parser';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Increase timeout for module loading with mocks
vi.setConfig({ hookTimeout: 30000 });

describe('routes: /api/editor search', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  let serverInst: ReturnType<typeof app.listen> | null = null;
  const startServer = () => {
    if (serverInst) return serverInst;
    serverInst = app.listen(0);
    return serverInst;
  };

  const realFetch = global.fetch;
  type FindResponse = { docs: any[]; bookmark?: string };
  let findQueue: FindResponse[] = [];
  let findBodies: any[] = [];

  beforeAll(async () => {
    process.env['EDITOR_ENABLE'] = '1';
    global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = ((init?.method as string | undefined) ?? 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const ok = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'POST' && path.endsWith('/_index')) return ok({ ok: true });
      if (method === 'POST' && path.endsWith('/_find')) {
        if (init?.body) {
          try { findBodies.push(JSON.parse(init.body.toString())); } catch { findBodies.push(null); }
        } else {
          findBodies.push(null);
        }
        const resp = findQueue.shift() || { docs: [] };
        return ok(resp);
      }
      return ok({}, 404);
    }) as typeof global.fetch;
    const router = (await import('../server/routes/editor')).default;
    app.use('/api/editor', router);
  });

  beforeEach(() => {
    findQueue = [];
    findBodies = [];
  });

  afterAll(() => {
    global.fetch = realFetch;
    serverInst?.close();
  });

  it('returns snippets and bookmark', async () => {
    const text = 'Hello world this is a search snippet example';
    findQueue.push({
      docs: [
        { waveId: 'w1', blipId: 'b1', updatedAt: 123, text },
        { waveId: 'w1', blipId: 'b2', updatedAt: 100, text: 'extra' },
      ],
      bookmark: 'bm1',
    });
    const server = startServer();
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/editor/search?q=search&limit=1`);
    const body = await resp.json();
    expect(resp.status).toBe(200);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results[0]?.snippet).toContain('search');
    expect(body.nextBookmark).toBe('bm1');
  });

  it('passes bookmark for pagination', async () => {
    findQueue.push({ docs: [{ waveId: 'w1', text: 'start' }], bookmark: 'bmA' });
    findQueue.push({ docs: [{ waveId: 'w2', text: 'next' }], bookmark: 'bmB' });
    const server = startServer();
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const first = await fetch(`http://127.0.0.1:${port}/api/editor/search?q=start&limit=1`);
    expect(first.status).toBe(200);
    const second = await fetch(`http://127.0.0.1:${port}/api/editor/search?q=start&limit=1&bookmark=bmA`);
    expect(second.status).toBe(200);
    expect(findBodies[1]?.bookmark).toBe('bmA');
  });

  it('rejects overly long queries', async () => {
    const server = startServer();
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const long = 'x'.repeat(400);
    const resp = await fetch(`http://127.0.0.1:${port}/api/editor/search?q=${long}`);
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toBe('query_too_long');
  });
});
