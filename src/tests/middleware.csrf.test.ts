import { csrfInit, csrfProtect } from '../server/middleware/csrf';
import express from 'express';
import session from 'express-session';
import type { AddressInfo } from 'node:net';

describe('middleware: csrf', () => {
  it('initializes csrf token and sets cookie (non-prod not secure)', async () => {
    await new Promise<void>((resolve) => {
      const req: any = { originalUrl: '/api/auth/csrf', session: {} };
      const cookies: any[] = [];
      const res: any = {
        cookie: (name: string, value: string, opts: any) => { cookies.push({ name, value, opts }); },
      };
      const next = () => {
        expect(typeof req.session.csrfToken).toBe('string');
        const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN');
        expect(xsrf).toBeTruthy();
        expect(xsrf!.opts.secure).toBeFalsy();
        resolve();
      };
      csrfInit()(req, res, next);
    });
  });

  it('does not initialize anonymous sessions on ordinary page, API, or asset requests', () => {
    for (const originalUrl of ['/', '/api/auth/me', '/assets/main.js']) {
      const req: any = { originalUrl, session: {} };
      const cookies: any[] = [];
      const res: any = {
        cookie: (name: string, value: string, opts: any) => { cookies.push({ name, value, opts }); },
      };
      csrfInit()(req, res, () => undefined);
      expect(req.session.csrfToken).toBeUndefined();
      expect(cookies).toEqual([]);
    }
  });

  it('reissues an existing token at the dedicated endpoint without replacing it', () => {
    const req: any = { originalUrl: '/api/auth/csrf', session: { csrfToken: 'existing' } };
    const cookies: any[] = [];
    const res: any = {
      cookie: (name: string, value: string, opts: any) => { cookies.push({ name, value, opts }); },
    };
    csrfInit()(req, res, () => undefined);
    expect(req.session.csrfToken).toBe('existing');
    expect(cookies).toEqual([expect.objectContaining({ name: 'XSRF-TOKEN', value: 'existing' })]);
  });

  it('does not reissue a stale pre-login token on ordinary requests', () => {
    const req: any = { originalUrl: '/assets/main.js', session: { csrfToken: 'stale' } };
    const cookies: any[] = [];
    const res: any = {
      cookie: (name: string, value: string, opts: any) => { cookies.push({ name, value, opts }); },
    };
    csrfInit()(req, res, () => undefined);
    expect(req.session.csrfToken).toBe('stale');
    expect(cookies).toEqual([]);
  });

  it('does not emit a replacement sid for a delayed request carrying a destroyed pre-login sid', async () => {
    const store = new session.MemoryStore();
    const app = express();
    app.use(session({
      store,
      secret: 'integration-test-session-secret',
      resave: false,
      saveUninitialized: false,
      name: 'rizzoma.sid',
    }));
    app.use(csrfInit());
    app.get('/api/auth/csrf', (_req, res) => res.json({ ok: true }));
    app.get('/assets/main.js', (_req, res) => res.type('text/javascript').send('export {};'));

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const initial = await fetch(`http://127.0.0.1:${port}/api/auth/csrf`);
      const initialCookies = initial.headers.get('set-cookie') || '';
      const sid = initialCookies.match(/rizzoma\.sid=([^;]+)/)?.[1];
      expect(sid).toBeTruthy();

      await new Promise<void>((resolve, reject) => {
        store.clear((error) => error ? reject(error) : resolve());
      });

      const delayed = await fetch(`http://127.0.0.1:${port}/assets/main.js`, {
        headers: { cookie: `rizzoma.sid=${sid}` },
      });
      expect(delayed.status).toBe(200);
      expect(delayed.headers.get('set-cookie')).toBeNull();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });

  it('blocks mutating requests without matching token', async () => {
    const req: any = { method: 'POST', session: { csrfToken: 'abc' }, headers: {} };
    const res: any = {
      statusCode: 0,
      body: undefined as any,
      status(code: number) { this.statusCode = code; return this; },
      json(obj: any) { this.body = obj; },
    };
    await new Promise<void>((resolve) => {
      csrfProtect()(req, res, () => { throw new Error('should not reach next'); });
      resolve();
    });
    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe('csrf_failed');
  });

  it('allows mutating requests with matching token', async () => {
    await new Promise<void>((resolve) => {
      const req: any = { method: 'DELETE', session: { csrfToken: 'abc' }, headers: { 'x-csrf-token': 'abc' } };
      const res: any = {};
      csrfProtect()(req, res, () => resolve());
    });
  });

  it('sets secure cookie in production', async () => {
    const prev = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    await new Promise<void>((resolve) => {
      const req: any = { originalUrl: '/api/auth/csrf', session: {} };
      const cookies: any[] = [];
      const res: any = { cookie: (name: string, value: string, opts: any) => cookies.push({ name, value, opts }) };
      csrfInit()(req, res, () => {
        const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN');
        expect(xsrf).toBeTruthy();
        expect(xsrf!.opts.secure).toBeTruthy();
        process.env['NODE_ENV'] = prev;
        resolve();
      });
    });
  });
});
