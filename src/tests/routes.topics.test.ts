import express from 'express';
import cookieParser from 'cookie-parser';
import topicsRouter from '../server/routes/topics';
import { requestId } from '../server/middleware/requestId';

describe('routes: /api/topics', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId());
  // minimal session shim
  app.use((req: any, _res, next) => { req.session = { userId: 'u1', csrfToken: 't' }; next(); });
  app.use('/api/topics', topicsRouter);

  beforeAll(() => {
    // Mock global fetch used by couch helpers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      const okResp = (obj: any, status = 200) => ({ ok: status >= 200 && status < 300, status, statusText: 'OK', text: async () => JSON.stringify(obj) } as any);
      if (method === 'POST' && path.endsWith('/_find')) {
        // Return a couple of topic docs
        return okResp({ docs: [
          { _id: 't2', type: 'topic', title: 'Second', createdAt: Date.now() - 1000 },
          { _id: 't1', type: 'topic', title: 'First', createdAt: Date.now() - 2000 },
        ] });
      }
      if (method === 'GET' && /_design\/waves_by_creation_date\/_view/.test(path)) {
        return okResp({ rows: [ { key: Date.now() - 5000, value: 'w1' }, { key: Date.now() - 4000, value: 'w2' } ] });
      }
      // default
      return okResp({}, 404);
    }) as any;
  });

  it('lists topics with hasMore computation', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics?limit=1`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(Array.isArray(body.topics)).toBe(true);
    expect(body.topics.length).toBe(1);
    expect(body.hasMore).toBe(true);
  });

  it('falls back to legacy view when no modern docs and shapes results', async () => {
    // Replace fetch to simulate no modern docs
    const orig = global.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      const okResp = (obj: any, status = 200) => ({ ok: status >= 200 && status < 300, status, statusText: 'OK', text: async () => JSON.stringify(obj) } as any);
      if (method === 'POST' && path.endsWith('/_find')) {
        return okResp({ docs: [] });
      }
      if (method === 'GET' && /_design\/waves_by_creation_date\/_view/.test(path)) {
        return okResp({ rows: [ { key: 1, value: 'legacy-1' } ] });
      }
      return okResp({}, 404);
    }) as any;

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/topics?limit=5`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body.topics[0].id).toMatch(/^legacy:/);
    expect(body.topics[0].title).toBe('(legacy) wave');

    global.fetch = orig as any;
  });
});
