import { errorHandler } from '../server/middleware/error';

describe('middleware: errorHandler', () => {
  it('formats error response with code, message, requestId', () => {
    const err: any = { status: 418, code: 'teapot', message: 'short and stout' };
    const req: any = { id: 'rid-123' };
    const res: any = {
      statusCode: 0,
      headers: new Map<string, string>(),
      setHeader(k: string, v: string) { this.headers.set(k.toLowerCase(), v); },
      status(code: number) { this.statusCode = code; return this; },
      json(obj: any) { this.body = obj; return this; },
    };
    // @ts-ignore
    errorHandler(err, req, res, () => {});
    expect(res.statusCode).toBe(418);
    expect(res.body?.error).toBe('teapot');
    expect(res.body?.message).toBe('short and stout');
    expect(res.body?.requestId).toBe('rid-123');
  });
});

