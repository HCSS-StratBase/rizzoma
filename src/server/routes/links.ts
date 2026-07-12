import { Router } from 'express';
import { deleteDoc, findOne, insertDoc } from '../lib/couch.js';
import { emitEvent } from '../lib/socket.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWaveAccess } from '../lib/access.js';

// BUG #43 (2026-04-21): this router is mounted at /api/links (see app.ts).
// Previously it was mounted at /api which made DELETE /:from/:to greedily
// match every two-segment DELETE under /api — including /api/blips/<id> —
// and return 404 "not_found" for real blip deletes. Mount specificity is
// load-bearing; don't remount this at /api. The GET /api/blips/:id/links
// handler was moved to the blips router for the same reason.

type LinkDoc = {
  _id?: string;
  type: 'link';
  fromBlipId: string;
  toBlipId: string;
  waveId: string;
  authorId?: string;
  createdAt: number;
};

const router = Router();

// POST /api/links { fromBlipId, toBlipId, waveId }
router.post('/', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { fromBlipId, toBlipId, waveId } = (req.body || {}) as Partial<LinkDoc>;
  if (!fromBlipId || !toBlipId || !waveId) { res.status(400).json({ error: 'invalid_payload', requestId: (req as any)?.id }); return; }
  try {
    const access = await requireWaveAccess(req, res, waveId, 'edit');
    if (!access) return;
    const key = `link:${fromBlipId}:${toBlipId}`;
    const existing = await findOne<LinkDoc>({ type: 'link', fromBlipId, toBlipId });
    if (existing) { res.json({ ok: true, id: existing._id }); return; }
    const doc: LinkDoc = { _id: key, type: 'link', fromBlipId, toBlipId, waveId, authorId: userId, createdAt: Date.now() };
    const r = await insertDoc(doc as any);
    res.status(201).json({ ok: true, id: r.id, rev: r.rev });
    try { emitEvent('link:created', { fromBlipId, toBlipId, waveId }); } catch {}
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'link_create_error', requestId: (req as any)?.id });
  }
});

// DELETE /api/links/:from/:to
router.delete('/:from/:to', requireAuth, async (req, res): Promise<void> => {
  try {
    const from = String(req.params['from'] || '');
    const to = String(req.params['to'] || '');
    const existing = await findOne<LinkDoc>({ type: 'link', fromBlipId: from, toBlipId: to });
    if (!existing) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    const access = await requireWaveAccess(req, res, existing.waveId, 'edit');
    if (!access) return;
    const rev = (existing as any)._rev;
    if (!existing._id || !rev) { res.status(409).json({ error: 'conflict', requestId: (req as any)?.id }); return; }
    const r = await deleteDoc(existing._id, rev);
    res.json({ ok: true, id: r.id, rev: r.rev });
    try { emitEvent('link:deleted', { fromBlipId: from, toBlipId: to, waveId: existing.waveId }); } catch {}
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'link_delete_error', requestId: (req as any)?.id });
  }
});

export default router;
