import express from 'express';
import cookieParser from 'cookie-parser';
import wavesRouter from '../server/routes/waves';

describe('routes: /api/waves/unread_counts', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: any, _res, next) => { req.session = { userId: 'u1' }; next(); });
  app.use('/api/waves', wavesRouter);

  beforeAll(() => {
    const realFetch = global.fetch as any;
    const blips: Record<string, number> = { 'w1': 2, 'w2': 0 };
    const reads: Record<string, string[]> = { 'w1': ['b1'] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.fetch = (async (url: any, init?: any) => {
      const u = new URL(String(url));
      const path = u.pathname;
      const method = (init?.method || 'GET').toUpperCase();
      if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && path.startsWith('/api/')) {
        return realFetch(url, init);
      }
      const okResp = (obj: any, status = 200) => ({ ok: status >= 200 && status < 300, status, statusText: 'OK', text: async () => JSON.stringify(obj), json: async () => obj } as any);
      if (method === 'POST' && path.endsWith('/_find')) {
        const body = JSON.parse(init?.body?.toString() || '{}');
        const sel = body.selector || {};
        if (sel.type === 'blip') {
          const waveId = sel.waveId;
          const count = blips[waveId] || 0;
          const docs = Array.from({ length: count }, (_v, i) => ({ _id: `${waveId}-b${i+1}`, type: 'blip', waveId }));
          return okResp({ docs });
        }
        if (sel.type === 'read') {
          const waveId = sel.waveId;
          const docs = (reads[waveId] || []).map(bid => ({ _id: `r:${waveId}:${bid}`, type: 'read', userId: 'u1', waveId, blipId: bid }));
          return okResp({ docs });
        }
        return okResp({ docs: [] });
      }
      return okResp({}, 404);
    }) as any;
  });

  it('returns unread/total counts for multiple waves', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/waves/unread_counts?ids=w1,w2`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    const map: Record<string, any> = {};
    (body.counts || []).forEach((c: any) => { map[c.waveId] = c; });
    expect(map['w1'].total).toBe(2);
    expect(map['w1'].unread).toBe(1);
    expect(map['w2'].total).toBe(0);
    expect(map['w2'].unread).toBe(0);
  });
});

