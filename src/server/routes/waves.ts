import { Router } from 'express';
import { createIndex, find, getDoc, insertDoc, view } from '../lib/couch.js';
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
    let docs = r.docs || [];
    let list = docs.slice(0, limit).map((w) => ({ id: w._id, title: w.title, createdAt: w.createdAt }));
    let hasMore = docs.length > limit;
    if (list.length === 0) {
      // Fallback to legacy view by creation date
      const legacy = await view('waves_by_creation_date', 'get', { descending: true, limit });
      list = legacy.rows.map((row) => ({ id: String(row.value), title: `Wave ${String(row.value).slice(0, 6)}`, createdAt: Number(row.key) || Date.now() }));
      hasMore = false;
    }
    res.json({ waves: list, hasMore });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'waves_error', requestId: (req as any)?.id });
  }
});

// GET /api/waves/:id — return wave metadata and blip tree
router.get('/:id', async (req, res) => {
  const id = req.params.id;
  try {
    let wave: Wave | null = null;
    try {
      wave = await getDoc<Wave>(id);
    } catch (e: any) {
      // ignore 404; treat as legacy-only wave id
      if (!String(e?.message || '').startsWith('404')) throw e;
    }
    // fetch blips (works for both modern and legacy data)
    await createIndex(['type', 'waveId', 'createdAt'], 'idx_blip_wave_createdAt').catch(() => undefined);
    const r = await find<Blip>({ type: 'blip', waveId: id }, { limit: 5000, sort: [{ createdAt: 'asc' }] }).catch(async () => {
      return find<Blip>({ type: 'blip', waveId: id }, { limit: 5000 });
    });
    let blips = (r.docs || []).map((b) => ({ ...b, createdAt: (b as any).createdAt || (b as any).contentTimestamp || 0 }));
    // If no blips found try legacy view with include_docs
    if (blips.length === 0) {
      const legacy = await view<any>('nonremoved_blips_by_wave_id', 'get', { include_docs: true as any, key: id as any }).catch(() => ({ rows: [] as any[] }));
      blips = (legacy.rows || []).map((row: any) => ({ ...(row.doc || {}), createdAt: (row.doc && (row.doc.createdAt || row.doc.contentTimestamp)) || 0 }));
    }
    // Build tree
    const byParent = new Map<string | null, Blip[]>();
    for (const b of blips) {
      const p = (b.parentId ?? null) as string | null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(b as any);
    }
    const toNode = (b: Blip): any => ({ id: (b as any)._id, content: (b as any).content || '', createdAt: (b as any).createdAt, children: (byParent.get(((b as any)._id) || '') || []).map(toNode) });
    const roots = (byParent.get(null) || []).concat(byParent.get(undefined as any) || []).map(toNode);
    const title = wave?.title || `(legacy) wave ${id.slice(0, 6)}`;
    const createdAt = wave?.createdAt || (blips[0]?.createdAt || Date.now());
    res.json({ id, title, createdAt, blips: roots });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'wave_error', requestId: (req as any)?.id });
  }
});

export default router;

// Dev-only materialization endpoints
if (process.env.NODE_ENV !== 'production') {
  // POST /api/waves/materialize/:id — create minimal wave doc if missing (title + createdAt)
  router.post('/materialize/:id', async (req, res) => {
    const id = req.params.id;
    try {
      // check if exists
      let exists = false;
      try { await getDoc<Wave>(id); exists = true; } catch {}
      if (exists) { res.json({ ok: true, id, existed: true }); return; }
      // derive basic fields from legacy blips
      const legacy = await view<any>('nonremoved_blips_by_wave_id', 'get', { include_docs: true as any, key: id as any }).catch(() => ({ rows: [] as any[] }));
      const docs = (legacy.rows || []).map((row: any) => row.doc || {}).filter(Boolean);
      const createdAt = docs.reduce((m: number, d: any) => Math.min(m, Number(d.createdAt || d.contentTimestamp || Date.now())), Date.now());
      const title = `Wave ${id.slice(0, 6)}`;
      const wave: Wave = { _id: id, type: 'wave', title, createdAt, updatedAt: createdAt };
      const r = await insertDoc(wave as any);
      res.status(201).json({ ok: true, id: r.id, rev: r.rev, createdAt, title });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'materialize_error', requestId: (req as any)?.id });
    }
  });

  // POST /api/waves/materialize — bulk-create minimal wave docs for recent legacy waves
  router.post('/materialize', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 500);
    try {
      const legacy = await view<any>('waves_by_creation_date', 'get', { descending: true as any, limit });
      const ids: string[] = (legacy.rows || []).map((r: any) => String(r.value));
      const results: Array<{ id: string; status: 'skipped' | 'created' } & Record<string, any>> = [];
      for (const wid of ids) {
        let exists = false;
        try { await getDoc<Wave>(wid); exists = true; } catch {}
        if (exists) { results.push({ id: wid, status: 'skipped' }); continue; }
        // derive createdAt from legacy list key or content timestamps if available
        const createdAtFromView = Number((legacy.rows || []).find((r: any) => String(r.value) === wid)?.key) || Date.now();
        const legacyBlips = await view<any>('nonremoved_blips_by_wave_id', 'get', { include_docs: true as any, key: wid as any }).catch(() => ({ rows: [] as any[] }));
        const docs = (legacyBlips.rows || []).map((row: any) => row.doc || {}).filter(Boolean);
        const createdAt = docs.reduce((m: number, d: any) => Math.min(m, Number(d.createdAt || d.contentTimestamp || createdAtFromView)), createdAtFromView);
        const title = `Wave ${wid.slice(0, 6)}`;
        const wave: Wave = { _id: wid, type: 'wave', title, createdAt, updatedAt: createdAt };
        try {
          const r = await insertDoc(wave as any);
          results.push({ id: wid, status: 'created', rev: r.rev, createdAt, title });
        } catch (e: any) {
          results.push({ id: wid, status: 'skipped', error: String(e?.message || e) });
        }
      }
      res.json({ ok: true, count: results.length, results });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'bulk_materialize_error', requestId: (req as any)?.id });
    }
  });
}
