import { errorHandler } from '../server/middleware/error';

describe('middleware: errorHandler', () => {
  it('formats error response with code, message, requestId', () => {
    const err = { status: 418, code: 'teapot', message: 'short and stout' } as unknown as Error & { status?: number; code?: string };
    const req = { id: 'rid-123' } as { id: string };
    const res = {
      statusCode: 0,
      headers: new Map<string, string>(),
      setHeader(k: string, v: string) { this.headers.set(k.toLowerCase(), v); },
      status(code: number) { this.statusCode = code; return this; },
      json(obj: unknown) { (this as any).body = obj; return this; },
    } as { statusCode: number; headers: Map<string,string>; setHeader: (k:string,v:string)=>void; status:(c:number)=>any; json:(o:unknown)=>any; body?: unknown };
    // Call error handler; next not used in this test
    errorHandler(err as unknown as Error, req as unknown as any, res as unknown as any, () => {});
    expect(res.statusCode).toBe(418);
    const body = res.body as { error?: string; message?: string; requestId?: string } | undefined;
    expect(body?.error).toBe('teapot');
    expect(body?.message).toBe('short and stout');
    expect(body?.requestId).toBe('rid-123');
  });
});
