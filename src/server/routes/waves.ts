import { Router } from 'express';
import { createIndex, find, getDoc } from '../lib/couch.js';
import type { Blip, Wave } from '../schemas/wave.js';

const router = Router();

// GET /api/waves?limit&offset&q
router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String((req.query as any).offset ?? '0'), 10) || 0, 0);
  const q = String((req.query as any).q ?? '').trim();
  try {
    await createIndex(['type', 'createdAt'], 'idx_wave_createdAt').catch(() => undefined);
    const selector: any = { type: 'wave' };
    if (q) selector.title = { $regex: `(?i).*${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*` };
    let r: { docs: Wave[] };
    try {
      r = await find<Wave>(selector, { limit: limit + 1, skip: offset, sort: [{ createdAt: 'desc' }] });
    } catch {
      r = await find<Wave>(selector, { limit: limit + 1, skip: offset });
    }
    const list = (r.docs || []).slice(0, limit).map((w) => ({ id: w._id, title: w.title, createdAt: w.createdAt }));
    const hasMore = (r.docs || []).length > limit;
    res.json({ waves: list, hasMore });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'waves_error', requestId: (req as any)?.id });
  }
});

// GET /api/waves/:id — return wave metadata and blip tree
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const wave = await getDoc<Wave>(id);
    // fetch blips for this wave
    await createIndex(['type', 'waveId', 'createdAt'], 'idx_blip_wave_createdAt').catch(() => undefined);
    const r = await find<Blip>({ type: 'blip', waveId: id }, { limit: 5000, sort: [{ createdAt: 'asc' }] }).catch(async () => {
      return find<Blip>({ type: 'blip', waveId: id }, { limit: 5000 });
    });
    const blips = r.docs || [];
    // Build tree
    const byParent = new Map<string | null, Blip[]>();
    for (const b of blips) {
      const p = (b.parentId ?? null) as string | null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(b);
    }
    const toNode = (b: Blip): any => ({ id: b._id, content: b.content || '', createdAt: b.createdAt, children: (byParent.get(b._id || '') || []).map(toNode) });
    const roots = (byParent.get(null) || []).concat(byParent.get(undefined as any) || []).map(toNode);
    res.json({ id: wave._id, title: wave.title, createdAt: wave.createdAt, blips: roots });
  } catch (e: any) {
    if (String(e?.message || '').startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'wave_error', requestId: (req as any)?.id });
  }
});

export default router;

