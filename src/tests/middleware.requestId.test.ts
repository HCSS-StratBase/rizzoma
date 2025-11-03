import { requestId } from '../server/middleware/requestId';

describe('middleware: requestId', () => {
  it('sets x-request-id header and attaches to req', (done) => {
    const req: any = {};
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; } };
    const next = () => {
      expect(typeof req.id).toBe('string');
      expect(req.id.length).toBeGreaterThan(10);
      expect(headers['x-request-id']).toBe(req.id);
      done();
    };
    requestId()(req, res, next);
  });
});

