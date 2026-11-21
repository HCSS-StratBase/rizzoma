import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn().mockResolvedValue({ _id: 'comment-1', _rev: '1-a', type: 'inline_comment', blipId: 'b1' }),
  updateDoc: vi.fn(), insertDoc: vi.fn(), deleteDoc: vi.fn(),
  find: vi.fn().mockResolvedValue({ docs: [] }), findOne: vi.fn().mockResolvedValue(null), getDocsById: vi.fn().mockResolvedValue({}),
}));
vi.mock('../server/lib/socket.js', () => ({ emitEvent: vi.fn() }));

const commentsRouter = (await import('../server/routes/comments')).default as any;

describe('routes: DELETE /api/comments/:id', () => {
  it('hands an id that is not a topic comment to the next router (the inline comments router) instead of answering 404 itself', async () => {
    const layer = commentsRouter.stack.find((l: any) => l.route?.path === '/comments/:id' && l.route?.methods?.delete);
    const stack = layer.route.stack;
    const handler = stack[stack.length - 1].handle;
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const next = vi.fn();
    await handler({ params: { id: 'comment-1' }, user: { id: 'u1' }, session: { userId: 'u1' }, headers: {}, get: () => undefined }, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
