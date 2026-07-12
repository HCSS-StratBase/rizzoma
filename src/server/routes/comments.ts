import { Router } from 'express';
import { csrfProtect } from '../middleware/csrf.js';
import { deleteDoc, find, getDoc, insertDoc, updateDoc } from '../lib/couch.js';
import { CreateCommentSchema, UpdateCommentSchema } from '../schemas/comment.js';
import { emitEvent } from '../lib/socket.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWaveAccess } from '../lib/access.js';

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

function isCommentDoc(value: unknown): value is Comment & { _id: string; _rev: string } {
  const doc = value as Partial<Comment> | null;
  return Boolean(
    doc
      && doc.type === 'comment'
      && typeof doc._id === 'string'
      && typeof doc._rev === 'string'
      && typeof doc.topicId === 'string'
      && typeof doc.authorId === 'string'
      && typeof doc.content === 'string',
  );
}

// GET /api/topics/:id/comments
router.get('/topics/:id/comments', async (req, res): Promise<void> => {
  try {
    const topicId = String(req.params['id'] || '');
    const access = await requireWaveAccess(req, res, topicId, 'read');
    if (!access) return;
    const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String((req.query as any).offset ?? '0'), 10) || 0, 0);
    const bookmark = String((req.query as any).bookmark || '').trim() || undefined;
    // Query CouchDB using Mango with server-side sort + paging
    let r: { docs: Comment[]; bookmark?: string };
    try {
      r = await find<Comment>({ type: 'comment', topicId }, { limit: limit + 1, skip: offset, sort: [{ createdAt: 'asc' }], bookmark });
    } catch {
      // Fallback without sort if index not available yet
      r = await find<Comment>({ type: 'comment', topicId }, { limit: limit + 1, skip: offset, bookmark });
    }
    const window = r.docs || [];
    const page = window.slice(0, limit);
    const rows = page.map((c) => ({ id: c._id, authorId: c.authorId, content: c.content, createdAt: c.createdAt, updatedAt: c.updatedAt }));
    const hasMore = window.length > limit;
    res.json({ comments: rows, hasMore, nextBookmark: r.bookmark });
    return;
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'comments_error', requestId: (req as any)?.id });
    return;
  }
});

// POST /api/topics/:id/comments
router.post('/topics/:id/comments', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const topicId = String(req.params['id'] || '');
    const access = await requireWaveAccess(req, res, topicId, 'comment');
    if (!access) return;
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
router.patch('/comments/:id', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const id = String(req.params['id'] || '');
    const existing = await getDoc<unknown>(id);
    if (!isCommentDoc(existing)) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    const access = await requireWaveAccess(req, res, existing.topicId, 'comment');
    if (!access) return;
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
router.delete('/comments/:id', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const id = String(req.params['id'] || '');
    const existing = await getDoc<unknown>(id);
    if (!isCommentDoc(existing)) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    const access = await requireWaveAccess(req, res, existing.topicId, 'comment');
    if (!access) return;
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
