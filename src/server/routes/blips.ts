import { Router } from 'express';
import { getDoc, updateDoc } from '../lib/couch.js';
import type { Blip } from '../schemas/wave.js';

const router = Router();

// PATCH /api/blips/:id/reparent { parentId }
router.patch('/blips/:id/reparent', async (req, res): Promise<void> => {
  // @ts-ignore
  if (!req.session?.userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const id = req.params.id;
    const parentId = (req.body || {}).parentId as string | null | undefined;
    const blip = await getDoc<Blip & { _rev: string }>(id);
    const next: Blip & { _rev?: string } = {
      ...blip,
      parentId: parentId ?? null,
      updatedAt: Date.now(),
    };
    const r = await updateDoc(next as any);
    res.json({ id: r.id, rev: r.rev });
    return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'reparent_error', requestId: (req as any)?.id });
    return;
  }
});

export default router;

