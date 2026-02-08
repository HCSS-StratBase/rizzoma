import { Router } from 'express';
import { deleteDoc, find, findOne, insertDoc } from '../lib/couch.js';
import { emitEvent } from '../lib/socket.js';

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
router.post('/', async (req, res): Promise<void> => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const { fromBlipId, toBlipId, waveId } = (req.body || {}) as Partial<LinkDoc>;
  if (!fromBlipId || !toBlipId || !waveId) { res.status(400).json({ error: 'invalid_payload', requestId: (req as any)?.id }); return; }
  try {
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
router.delete('/:from/:to', async (req, res): Promise<void> => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const from = req.params.from;
    const to = req.params.to;
    const existing = await findOne<LinkDoc>({ type: 'link', fromBlipId: from, toBlipId: to });
    if (!existing) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    // Fetch rev then delete
    // Simplify by re-querying; in practice, findOne should include _rev via *getDoc*, but keeping lightweight here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rev = (existing as any)._rev;
    if (!existing._id || !rev) { res.status(409).json({ error: 'conflict', requestId: (req as any)?.id }); return; }
    const r = await deleteDoc(existing._id, rev);
    res.json({ ok: true, id: r.id, rev: r.rev });
    try { emitEvent('link:deleted', { fromBlipId: from, toBlipId: to }); } catch {}
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'link_delete_error', requestId: (req as any)?.id });
  }
});

// GET /api/blips/:id/links → { out: [], in: [] }
router.get('/blips/:id/links', async (req, res): Promise<void> => {
  const id = req.params.id;
  try {
    const out = (await find<LinkDoc>({ type: 'link', fromBlipId: id }, { limit: 1000 })).docs || [];
    const inn = (await find<LinkDoc>({ type: 'link', toBlipId: id }, { limit: 1000 })).docs || [];
    res.json({ out: out.map((d) => ({ fromBlipId: d.fromBlipId, toBlipId: d.toBlipId, waveId: d.waveId })), in: inn.map((d) => ({ fromBlipId: d.fromBlipId, toBlipId: d.toBlipId, waveId: d.waveId })) });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'links_error', requestId: (req as any)?.id });
  }
});

export default router;
