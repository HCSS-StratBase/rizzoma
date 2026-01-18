import express from 'express';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Increase timeout for module loading with mocks
vi.setConfig({ hookTimeout: 30000 });

describe('routes: /api/editor rebuild snapshot', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  let failSnapshotSave = false;
  let docsToReturn: Array<{ _id: string; updateB64: string }> = [];
  let snapshotDocs: Array<{ _id: string; snapshotB64: string }> = [];
  let hitFindCount = 0;
  let serverInst: ReturnType<typeof app.listen> | null = null;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForStatus = async (port: number, predicate: (body: any) => boolean, timeout = 6000, blipId?: string) => {
    const started = Date.now();
    for (;;) {
      const suffix = blipId ? `?blipId=${encodeURIComponent(blipId)}` : '';
      const resp = await fetch(`http://127.0.0.1:${port}/api/editor/w1/rebuild${suffix}`);
      const body = await resp.json();
      if (predicate(body)) return body;
      if (Date.now() - started > timeout) throw new Error('timeout');
      await wait(25);
    }
  };

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
        hitFindCount += 1;
        try {
          const parsed = init?.body ? JSON.parse(init.body.toString()) : {};
          const selectorType = parsed?.selector?.type;
          if (selectorType === 'yjs_snapshot') return ok({ docs: snapshotDocs });
        } catch {}
        return ok({ docs: docsToReturn });
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        if (failSnapshotSave) return ok({ error: 'boom', reason: 'write_failed' }, 500);
        return ok({ ok: true, id: 'snap', rev: '1-x' }, 201);
      }
      return ok({}, 404);
    }) as typeof global.fetch;

    const router = (await import('../server/routes/editor')).default;
    app.use('/api/editor', router);
  });

  beforeEach(() => {
    failSnapshotSave = false;
    hitFindCount = 0;
    docsToReturn = [
      { _id: 'upd:1', updateB64: Buffer.from(new Uint8Array([1, 2, 3])).toString('base64') },
      { _id: 'upd:2', updateB64: Buffer.from(new Uint8Array([4, 5, 6])).toString('base64') },
    ];
    snapshotDocs = [];
  });

  afterAll(() => {
    serverInst?.close();
  });

  const startServer = () => {
    if (serverInst) return serverInst;
    serverInst = app.listen(0);
    return serverInst;
  };

  it('returns idle status with GET before any rebuild', async () => {
    const server = startServer();
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/editor/w1/rebuild`);
    const body = await resp.json();
    expect(resp.status).toBe(200);
    expect(body.status).toBe('idle');
  });

  it('queues rebuild jobs and reports completion with logs', async () => {
    const server = startServer();
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const post = await fetch(`http://127.0.0.1:${port}/api/editor/w1/rebuild`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    expect(post.status).toBe(202);
    const body = await waitForStatus(port, (b) => b.status === 'complete');
    expect(body.status).toBe('complete');
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.length).toBeGreaterThan(0);
    expect(typeof body.applied).toBe('number');
    expect(hitFindCount).toBeGreaterThan(0);
  });

  it('surfaces errors when snapshot save fails', async () => {
    failSnapshotSave = true;
    const server = startServer();
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/editor/w1/rebuild`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ blipId: 'b1' }) });
    expect(resp.status).toBe(202);
    const body = await waitForStatus(port, (b) => b.status === 'error', 6000, 'b1');
    expect(body.status).toBe('error');
    expect(body.error).toContain('500');
    expect(body.logs.some((l: any) => l.level === 'error')).toBe(true);
  }, 10000);
});
