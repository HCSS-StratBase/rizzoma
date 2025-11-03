import { Router } from 'express';
import { csrfProtect } from '../middleware/csrf.js';
import { deleteDoc, find, getDoc, insertDoc, updateDoc } from '../lib/couch.js';
import { CreateCommentSchema, UpdateCommentSchema } from '../schemas/comment.js';
import { emitEvent } from '../lib/socket.js';

type Comment = {
  _id?: string;
  _rev?: string;
  type: 'comment';
  topicId: string;
  authorId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

const router = Router();
// Schemas moved to ../schemas/comment

// GET /api/topics/:id/comments
router.get('/topics/:id/comments', async (req, res): Promise<void> => {
  try {
    const topicId = req.params.id;
    const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String((req.query as any).offset ?? '0'), 10) || 0, 0);
    const r = await find<Comment>({ type: 'comment', topicId });
    const sorted = r.docs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const window = sorted.slice(offset, offset + limit + 1);
    const paged = window.slice(0, limit);
    const rows = paged.map((c) => ({ id: c._id, authorId: c.authorId, content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt }));
    const hasMore = window.length > limit;
    res.json({ comments: rows, hasMore });
    return;
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'comments_error', requestId: (req as any)?.id });
    return;
  }
});

// POST /api/topics/:id/comments
router.post('/topics/:id/comments', csrfProtect(), async (req, res): Promise<void> => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const topicId = req.params.id;
    const { content } = CreateCommentSchema.parse(req.body ?? {});
    const now = Date.now();
    const doc: Comment = { type: 'comment', topicId, authorId: userId, content, createdAt: now, updatedAt: now };
    const r = await insertDoc(doc);
    res.status(201).json({ id: r.id, rev: r.rev });
    try { emitEvent('comment:created', { id: r.id, topicId, content, createdAt: now, authorId: userId }); } catch {}
    return;
  } catch (e: any) {
    if (e?.issues) { res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'create_comment_error', requestId: (req as any)?.id });
    return;
  }
});

// PATCH /api/comments/:id
router.patch('/comments/:id', csrfProtect(), async (req, res): Promise<void> => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const id = req.params.id;
    const existing = await getDoc<Comment>(id);
    if (existing.authorId !== userId) { res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id }); return; }
    const { content } = UpdateCommentSchema.parse(req.body ?? {});
    const next: Comment = { ...existing, content, updatedAt: Date.now() };
    const r = await updateDoc(next);
    res.json({ id: r.id, rev: r.rev });
    try { emitEvent('comment:updated', { id: r.id, topicId: existing.topicId, updatedAt: (next as any).updatedAt }); } catch {}
    return;
  } catch (e: any) {
    if (e?.issues) { res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id }); return; }
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'update_comment_error', requestId: (req as any)?.id });
    return;
  }
});

// DELETE /api/comments/:id
router.delete('/comments/:id', csrfProtect(), async (req, res): Promise<void> => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const id = req.params.id;
    const existing = await getDoc<Comment>(id);
    if (existing.authorId !== userId) { res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id }); return; }
    const r = await deleteDoc(id, (existing as any)._rev);
    res.json({ id: r.id, rev: r.rev });
    try { emitEvent('comment:deleted', { id: r.id, topicId: existing.topicId }); } catch {}
    return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'delete_comment_error', requestId: (req as any)?.id });
    return;
  }
});

export default router;
