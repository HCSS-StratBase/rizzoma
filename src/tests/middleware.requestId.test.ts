import { requestId } from '../server/middleware/requestId';

describe('middleware: requestId', () => {
  it('sets x-request-id header and attaches to req', (done) => {
    const req: Record<string, unknown> = {};
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; } } as { setHeader: (k: string, v: string) => void };
    const next = () => {
      const rid = req['id'] as string;
      expect(typeof rid).toBe('string');
      expect(rid.length).toBeGreaterThan(10);
      expect(headers['x-request-id']).toBe(rid);
      done();
    };
    requestId()(req, res, next);
  });
});
