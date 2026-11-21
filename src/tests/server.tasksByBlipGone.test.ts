import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/lib/access.js', async (orig) => {
  const real = await orig<typeof import('../server/lib/access.js')>();
  return { ...real, resolveBlipAccess: vi.fn().mockRejectedValue(new Error('410 blip_deleted')) };
});
vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn(), updateDoc: vi.fn(), insertDoc: vi.fn(), deleteDoc: vi.fn(),
  find: vi.fn().mockResolvedValue({ docs: [] }), findOne: vi.fn().mockResolvedValue(null), getDocsById: vi.fn().mockResolvedValue({}),
}));

const tasksRouter = (await import('../server/routes/tasks')).default as any;

function handlerFor(path: string) {
  const layer = tasksRouter.stack.find((l: any) => l.route?.path === path && l.route?.methods?.get);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

describe('routes: GET /api/tasks/by-blip/:blipId for a deleted blip', () => {
  it('answers 410 and keeps the server error log for real failures (a client asking while a blip unmounts is not an error)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; }, setHeader() { return this; } };
    await handlerFor('/by-blip/:blipId')({ params: { blipId: 'w1:b1' }, session: { userId: 'u1' }, headers: {}, get: () => undefined }, res);
    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({ error: 'blip_deleted' });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
