import { Router } from 'express';
import { deleteDoc, findOne, insertDoc } from '../lib/couch.js';
import { emitEvent } from '../lib/socket.js';
import { requireAuth } from '../middleware/auth.js';
import { identityFromRequest, resolveBlipAccess } from '../lib/access.js';
import { csrfProtect } from '../middleware/csrf.js';

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
router.post('/', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { fromBlipId, toBlipId, waveId } = (req.body || {}) as Partial<LinkDoc>;
  if (!fromBlipId || !toBlipId || !waveId) { res.status(400).json({ error: 'invalid_payload', requestId: (req as any)?.id }); return; }
  try {
    const identity = identityFromRequest(req);
    const [from, to] = await Promise.all([
      resolveBlipAccess(fromBlipId, identity),
      resolveBlipAccess(toBlipId, identity),
    ]);
    const canonicalWaveId = String(from.blip.waveId);
    if (String(waveId) !== canonicalWaveId) {
      res.status(400).json({ error: 'wave_mismatch', requestId: (req as any)?.id });
      return;
    }
    if (!from.access.canEdit || !to.access.canRead) {
      res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id });
      return;
    }
    const key = `link:${fromBlipId}:${toBlipId}`;
    const existing = await findOne<LinkDoc>({ type: 'link', fromBlipId, toBlipId });
    if (existing) { res.json({ ok: true, id: existing._id }); return; }
    const doc: LinkDoc = { _id: key, type: 'link', fromBlipId, toBlipId, waveId: canonicalWaveId, authorId: userId, createdAt: Date.now() };
    const r = await insertDoc(doc as any);
    res.status(201).json({ ok: true, id: r.id, rev: r.rev });
    try { emitEvent('link:created', { fromBlipId, toBlipId, waveId: canonicalWaveId }); } catch {}
  } catch (e: any) {
    if (String(e?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'blip_not_found', requestId: (req as any)?.id });
      return;
    }
    if (String(e?.message || '').startsWith('410')) {
      res.status(410).json({ error: 'blip_deleted', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'link_create_error', requestId: (req as any)?.id });
  }
});

// DELETE /api/links/:from/:to
router.delete('/:from/:to', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  try {
    const from = String(req.params['from'] || '');
    const to = String(req.params['to'] || '');
    const existing = await findOne<LinkDoc>({ type: 'link', fromBlipId: from, toBlipId: to });
    if (!existing) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    const source = await resolveBlipAccess(from, identityFromRequest(req));
    if (!source.access.canEdit) {
      res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id });
      return;
    }
    const canonicalWaveId = String(source.blip.waveId);
    const rev = (existing as any)._rev;
    if (!existing._id || !rev) { res.status(409).json({ error: 'conflict', requestId: (req as any)?.id }); return; }
    const r = await deleteDoc(existing._id, rev);
    res.json({ ok: true, id: r.id, rev: r.rev });
    try { emitEvent('link:deleted', { fromBlipId: from, toBlipId: to, waveId: canonicalWaveId }); } catch {}
  } catch (e: any) {
    if (String(e?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'blip_not_found', requestId: (req as any)?.id });
      return;
    }
    if (String(e?.message || '').startsWith('410')) {
      res.status(410).json({ error: 'blip_deleted', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'link_delete_error', requestId: (req as any)?.id });
  }
});

export default router;
