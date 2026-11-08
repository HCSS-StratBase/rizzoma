import express from 'express';
import cookieParser from 'cookie-parser';
import { vi } from 'vitest';

// Increase timeout for module loading with mocks
vi.setConfig({ hookTimeout: 30000 });

describe('routes: /api/editor (realtime + search)', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res, next) => {
    req.session = { userId: 'editor-owner', userName: 'Editor Owner', csrfToken: 'token' };
    next();
  });
  const insertedDocs: any[] = [];
  const couchDocs = new Map<string, any>();
  const findSelectors: any[] = [];
  const blipGenerations = new Map<string, number>([['b1', 7], ['b2', 3]]);
  let generatedId = 0;

  const resetEditorDocs = () => {
    insertedDocs.length = 0;
    couchDocs.clear();
    findSelectors.length = 0;
    generatedId = 0;
  };

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
        findSelectors.push(body?.selector);
        if (body?.selector?.type === 'editor_yjs_snapshot' && body?.selector?.text) {
          return ok({ docs: [{ waveId: 'w1', blipId: 'b1', yjsGeneration: 7, updatedAt: Date.now() }] });
        }
        return ok({ docs: [] });
      }
      if (method === 'POST' && /\/project_rizzoma\/?$/.test(path)) {
        // insertDoc (snapshots/updates)
        const doc = JSON.parse((init?.body as string) || '{}');
        const id = String(doc._id || `generated-${++generatedId}`);
        if (couchDocs.has(id)) return ok({ error: 'conflict', reason: 'Document update conflict.' }, 409);
        const persisted = { ...doc, _id: id, _rev: '1-test' };
        couchDocs.set(id, persisted);
        insertedDocs.push(doc);
        return ok({ ok: true, id, rev: '1-test' }, 201);
      }
      if (method === 'GET' && /\/project_rizzoma\/?$/.test(path)) {
        // couchDbInfo
        return ok({ couchdb: 'Welcome', version: '3.x' });
      }
      if (method === 'GET' && /\/project_rizzoma\/w1$/.test(path)) {
        return ok({ _id: 'w1', type: 'wave', title: 'Wave', authorId: 'editor-owner', createdAt: 1, updatedAt: 1 });
      }
      if (method === 'GET' && /\/project_rizzoma\/(b1|b2)$/.test(path)) {
        const id = decodeURIComponent(path.split('/').pop() || '');
        return ok({ _id: id, _rev: '1-blip', type: 'blip', waveId: 'w1', yjsGeneration: blipGenerations.get(id) ?? 0, createdAt: 1, updatedAt: 1 });
      }
      if (method === 'GET' && /\/project_rizzoma\/cross-wave$/.test(path)) {
        return ok({ _id: 'cross-wave', _rev: '1-blip', type: 'blip', waveId: 'w2', createdAt: 1, updatedAt: 1 });
      }
      const encodedDocId = path.match(/\/project_rizzoma\/([^/]+)$/)?.[1];
      if (method === 'GET' && encodedDocId) {
        const id = decodeURIComponent(encodedDocId);
        const doc = couchDocs.get(id);
        return doc ? ok(doc) : ok({ error: 'not_found', reason: 'missing' }, 404);
      }
      if (method === 'PUT' && encodedDocId) {
        const id = decodeURIComponent(encodedDocId);
        const doc = JSON.parse((init?.body as string) || '{}');
        const current = couchDocs.get(id);
        if (!current || doc._rev !== current._rev) {
          return ok({ error: 'conflict', reason: 'Document update conflict.' }, 409);
        }
        const revisionNumber = Number.parseInt(String(current._rev).split('-')[0] || '0', 10) + 1;
        const rev = `${revisionNumber}-test`;
        couchDocs.set(id, { ...doc, _id: id, _rev: rev });
        return ok({ ok: true, id, rev });
      }
      return ok({}, 404);
    }) as typeof global.fetch;

    const router = (await import('../server/routes/editor')).default;
    app.use('/api/editor', router);
  });

  it('accepts incremental updates and responds 201', async () => {
    resetEditorDocs();
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/editor/w1/updates`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': 'token' }, body: JSON.stringify({ seq: 1, updateB64: Buffer.from(new Uint8Array([1,2,3])).toString('base64'), blipId: 'b1', yjsGeneration: 7 }) });
    server.close();
    expect(resp.status).toBe(201);
    expect(insertedDocs.find((doc) => doc.type === 'editor_yjs_update')?.yjsGeneration).toBe(7);
  });

  it('scopes update ids by blip and rejects cross-wave blip ids', async () => {
    resetEditorDocs();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const headers = { 'content-type': 'application/json', 'x-csrf-token': 'token' };
    const updateB64 = Buffer.from(new Uint8Array([1, 2, 3])).toString('base64');
    const first = await fetch(`http://127.0.0.1:${port}/api/editor/w1/updates`, {
      method: 'POST', headers, body: JSON.stringify({ seq: 1, updateB64, blipId: 'b1', yjsGeneration: 7 }),
    });
    const second = await fetch(`http://127.0.0.1:${port}/api/editor/w1/updates`, {
      method: 'POST', headers, body: JSON.stringify({ seq: 1, updateB64, blipId: 'b2', yjsGeneration: 3 }),
    });
    const crossWave = await fetch(`http://127.0.0.1:${port}/api/editor/w1/updates`, {
      method: 'POST', headers, body: JSON.stringify({ seq: 2, updateB64, blipId: 'cross-wave', yjsGeneration: 0 }),
    });
    server.close();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(crossWave.status).toBe(400);
    const ids = insertedDocs.filter((doc) => doc.type === 'editor_yjs_update').map((doc) => doc._id);
    expect(ids).toEqual(expect.arrayContaining(['yupd:w1:b1:1', 'yupd:w1:b2:1']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('allocates distinct monotonic sequences for concurrent updates to one blip', async () => {
    resetEditorDocs();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const headers = { 'content-type': 'application/json', 'x-csrf-token': 'token' };
    const updateB64 = Buffer.from(new Uint8Array([4, 5, 6])).toString('base64');
    const request = () => fetch(`http://127.0.0.1:${port}/api/editor/w1/updates`, {
      method: 'POST', headers, body: JSON.stringify({ updateB64, blipId: 'b1', yjsGeneration: 7 }),
    });
    const responses = await Promise.all([request(), request()]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    server.close();

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(bodies.map((body: any) => body.seq).sort((a, b) => a - b)).toEqual([1, 2]);
    const updates = insertedDocs.filter((doc) => doc.type === 'editor_yjs_update');
    expect(updates.map((doc) => doc._id).sort()).toEqual(['yupd:w1:b1:1', 'yupd:w1:b1:2']);
    expect(couchDocs.get('yseq:w1:b1')?.value).toBe(2);
  });

  it('rejects missing or stale generations without persisting an update', async () => {
    resetEditorDocs();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const headers = { 'content-type': 'application/json', 'x-csrf-token': 'token' };
    const updateB64 = Buffer.from(new Uint8Array([7, 8, 9])).toString('base64');
    const missing = await fetch(`http://127.0.0.1:${port}/api/editor/w1/updates`, {
      method: 'POST', headers, body: JSON.stringify({ updateB64, blipId: 'b1' }),
    });
    const stale = await fetch(`http://127.0.0.1:${port}/api/editor/w1/updates`, {
      method: 'POST', headers, body: JSON.stringify({ updateB64, blipId: 'b1', yjsGeneration: 6 }),
    });
    const body = await stale.json();
    server.close();

    expect(missing.status).toBe(409);
    expect(stale.status).toBe(409);
    expect(body).toMatchObject({ error: 'collaboration_generation_mismatch', expectedYjsGeneration: 7 });
    expect(insertedDocs.some((doc) => doc.type === 'editor_yjs_update')).toBe(false);
  });

  it('loads and writes snapshots only in the current generation', async () => {
    resetEditorDocs();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const get = await fetch(`http://127.0.0.1:${port}/api/editor/w1/snapshot?blipId=b1`);
    const getBody = await get.json();
    const post = await fetch(`http://127.0.0.1:${port}/api/editor/w1/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'token' },
      body: JSON.stringify({ snapshotB64: 'AA==', blipId: 'b1', yjsGeneration: 7 }),
    });
    server.close();

    expect(get.status).toBe(200);
    expect(getBody.yjsGeneration).toBe(7);
    expect(post.status).toBe(201);
    expect(findSelectors).toContainEqual({ type: 'editor_yjs_snapshot', waveId: 'w1', blipId: 'b1', yjsGeneration: 7 });
    expect(insertedDocs.find((doc) => doc.type === 'editor_yjs_snapshot')).toMatchObject({ blipId: 'b1', yjsGeneration: 7 });
  });

  it('never lets a wave-level snapshot selector match a child blip snapshot', async () => {
    resetEditorDocs();
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/editor/w1/snapshot`);
    server.close();

    expect(response.status).toBe(200);
    expect(findSelectors).toContainEqual({
      type: 'editor_yjs_snapshot',
      waveId: 'w1',
      yjsGeneration: 0,
      blipId: { $exists: false },
    });
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
