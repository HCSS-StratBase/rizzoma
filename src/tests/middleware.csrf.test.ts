import { csrfInit, csrfProtect } from '../server/middleware/csrf';

describe('middleware: csrf', () => {
  it('initializes csrf token and sets cookie (non-prod not secure)', async () => {
    await new Promise<void>((resolve) => {
      const req: any = { session: {} };
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
      const req: any = { session: {} };
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
