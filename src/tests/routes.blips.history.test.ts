import express from 'express';
import cookieParser from 'cookie-parser';
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import blipsRouter from '../server/routes/blips';
import { requestId } from '../server/middleware/requestId';

describe('routes: blip history playback', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId());
  app.use((req: any, _res, next) => {
    req.session = { userId: 'user-1', csrfToken: 'token', userName: 'Tester' };
    next();
  });
  app.use('/api/blips', blipsRouter);

  const historyDocs: any[] = [];
  const blipDocs: any[] = [];
  const realFetch = global.fetch as any;

  beforeAll(() => {
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      const body = init?.body ? JSON.parse(init.body) : undefined;
      const okResp = (obj: any, status = 200) => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: 'OK',
        text: async () => JSON.stringify(obj),
        json: async () => obj,
      });

      // Allow requests to the express test server to pass through
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }

      if (method === 'POST' && path.endsWith('/_find')) {
        const selector = body?.selector || {};
        if (selector.type === 'blip_history') {
          const docs = historyDocs.filter((doc) => doc.blipId === selector.blipId);
          return okResp({ docs });
        }
        if (selector.type === 'blip') {
          const docs = blipDocs.filter((doc) => doc.waveId === selector.waveId);
          return okResp({ docs });
        }
        return okResp({ docs: [] });
      }

      if (method === 'POST' && /\/[^/]+$/.test(path)) {
        const doc = body || {};
        if (doc.type === 'blip_history') {
          historyDocs.push(doc);
        }
        if (doc.type === 'blip') {
          blipDocs.push(doc);
        }
        return okResp({ ok: true, id: doc._id || 'doc', rev: '1-abc' }, 201);
      }

      if (method === 'PUT' && /\/[^/]+$/.test(path)) {
        const doc = body || {};
        const idx = blipDocs.findIndex((b) => b._id === doc._id);
        if (idx >= 0) blipDocs[idx] = doc;
        return okResp({ ok: true, id: doc._id || 'doc', rev: '2-def' });
      }

      if (method === 'GET' && /\/[^/]+$/.test(path)) {
        const id = decodeURIComponent(path.split('/').pop() || '');
        const found = blipDocs.find((doc) => doc._id === id);
        if (found) return okResp(found);
      }

      return okResp({}, 404);
    }) as any;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  afterEach(() => {
    historyDocs.length = 0;
    blipDocs.length = 0;
    vi.restoreAllMocks();
  });

  it('records and returns blip history snapshots', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1000) // create blip id + history timestamp
      .mockReturnValueOnce(1500) // history snapshot timestamp
      .mockReturnValueOnce(2000) // update timestamp
      .mockReturnValueOnce(2500); // update history timestamp

    const server = app.listen(0);
    const port = (server.address() as any).port;

    const createResp = await fetch(`http://127.0.0.1:${port}/api/blips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ waveId: 'w1', content: '<p>hello</p>', authorName: 'Alice' }),
    });
    const created = await createResp.json();
    const blipId = created.id as string;

    const updateResp = await fetch(`http://127.0.0.1:${port}/api/blips/${encodeURIComponent(blipId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '<p>updated</p>', authorName: 'Bob' }),
    });
    expect(updateResp.status).toBe(200);

    const historyResp = await fetch(`http://127.0.0.1:${port}/api/blips/${encodeURIComponent(blipId)}/history`);
    const historyBody = await historyResp.json();
    server.close();

    expect(historyResp.status).toBe(200);
    expect(historyBody.history).toHaveLength(2);
    expect(historyBody.history[0]).toMatchObject({ event: 'create', authorName: 'Alice', snapshotVersion: 1 });
    expect(historyBody.history[1]).toMatchObject({ event: 'update', authorName: 'Bob', snapshotVersion: 2 });
  });
});
