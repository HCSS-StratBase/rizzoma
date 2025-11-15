import { Router } from 'express';
import { findOne, insertDoc, updateDoc, createIndex } from '../lib/couch.js';
import { emitEvent, emitEditorUpdate } from '../lib/socket.js';

// Feature flag: set EDITOR_ENABLE=1 to enable endpoints
const ENABLED = process.env['EDITOR_ENABLE'] === '1';

type YDocSnapshot = {
  _id?: string;
  type: 'yjs_snapshot';
  waveId: string;
  blipId?: string;
  updatedAt: number;
  // base64-encoded Yjs snapshot (Uint8Array)
  snapshotB64: string;
  // optional materialized plain text for search
  text?: string;
};

type YDocUpdate = {
  _id?: string;
  type: 'yjs_update';
  waveId: string;
  blipId?: string;
  seq: number;
  // base64-encoded Yjs update
  updateB64: string;
  createdAt: number;
};

const router = Router();

if (!ENABLED) {
  router.use((_req, res) => {
    res.status(404).json({ error: 'editor_disabled' });
  });
} else {
  // Ensure indexes
  (async () => {
    try { await createIndex(['type', 'waveId', 'blipId', 'updatedAt'], 'idx_yjs_snapshot'); } catch {}
    try { await createIndex(['type', 'waveId', 'seq'], 'idx_yjs_update_seq'); } catch {}
  })().catch(() => undefined);

  // GET /api/editor/:waveId/snapshot — latest snapshot + next seq
  router.get('/:waveId/snapshot', async (req, res) => {
    const waveId = req.params.waveId;
    const blipId = ((req.query as any)?.blipId ? String((req.query as any).blipId).trim() : '') || undefined;
    try {
      // Prefer a blip-specific snapshot when requested; otherwise fall back to wave-level
      let snap: YDocSnapshot | null = null;
      if (blipId) {
        try { snap = await findOne<YDocSnapshot>({ type: 'yjs_snapshot', waveId, blipId }); } catch {}
      }
      if (!snap) {
        try { snap = await findOne<YDocSnapshot>({ type: 'yjs_snapshot', waveId }); } catch {}
      }
      // next seq based on latest update
      let nextSeq = 1;
      const u = await findOne<YDocUpdate>({ type: 'yjs_update', waveId });
      // Note: findOne has no sort; in real impl we’d query by max seq. Keep it simple for dev.
      if (u && typeof (u as any).seq === 'number') nextSeq = (u as any).seq + 1;
      res.json({ snapshotB64: snap?.snapshotB64 || null, nextSeq });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'snapshot_error' });
    }
  });

  // POST /api/editor/:waveId/snapshot { snapshotB64 }
  router.post('/:waveId/snapshot', async (req, res) => {
    const waveId = req.params.waveId;
    const snapshotB64 = String((req.body || {}).snapshotB64 || '');
    const text = typeof (req.body || {}).text === 'string' ? String((req.body as any).text) : undefined;
    const blipIdVal = (req.body && typeof (req.body as any).blipId === 'string') ? String((req.body as any).blipId) : undefined;
    if (!snapshotB64) { res.status(400).json({ error: 'missing_snapshot' }); return; }
    try {
      const selector: any = blipIdVal ? { type: 'yjs_snapshot', waveId, blipId: blipIdVal } : { type: 'yjs_snapshot', waveId };
      const existing = await findOne<YDocSnapshot>(selector);
      const doc: YDocSnapshot = existing
        ? { ...existing, snapshotB64, updatedAt: Date.now(), text: (typeof text === 'string' ? text : (existing as any).text), blipId: blipIdVal ?? (existing as any).blipId }
        : { type: 'yjs_snapshot', waveId, blipId: blipIdVal, snapshotB64, updatedAt: Date.now(), text };
      const r = existing && (existing as any)._id ? await updateDoc(doc as any) : await insertDoc(doc as any);
      res.status(existing ? 200 : 201).json({ ok: true, id: r.id, rev: r.rev });
      try { emitEvent('editor:snapshot', { waveId }); } catch {}
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'snapshot_save_error' });
    }
  });

  // POST /api/editor/:waveId/updates { seq, updateB64, blipId? }
  router.post('/:waveId/updates', async (req, res) => {
    const waveId = req.params.waveId;
    const seq = Number((req.body || {}).seq);
    const updateB64 = String((req.body || {}).updateB64 || '');
    const blipIdVal = (req.body && typeof (req.body as any).blipId === 'string') ? String((req.body as any).blipId) : undefined;
    if (!Number.isFinite(seq) || seq < 1 || !updateB64) { res.status(400).json({ error: 'invalid_payload' }); return; }
    try {
      const id = `yupd:${waveId}:${seq}`;
      const doc: YDocUpdate = { _id: id, type: 'yjs_update', waveId, blipId: blipIdVal, seq, updateB64, createdAt: Date.now() };
      const r = await insertDoc(doc as any);
      res.status(201).json({ ok: true, id: r.id, rev: r.rev });
      try { emitEditorUpdate(waveId, blipIdVal, { waveId, blipId: blipIdVal, seq, updateB64 }); } catch {}
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'update_save_error' });
    }
  });

  // POST /api/editor/:waveId/rebuild — rebuild snapshot from stored incremental updates
  router.post('/:waveId/rebuild', async (req, res) => {
    const waveId = req.params.waveId;
    const blipIdVal = (req.body && typeof (req.body as any).blipId === 'string') ? String((req.body as any).blipId) : undefined;
    try {
      // Gather updates in ascending seq order
      const selector: any = blipIdVal ? { type: 'yjs_update', waveId, blipId: blipIdVal } : { type: 'yjs_update', waveId };
      const { find } = await import('../lib/couch.js');
      let docs: any[] = [];
      try {
        const r = await (find as any)(selector, { sort: [{ seq: 'asc' }], limit: 10000 });
        docs = Array.isArray(r?.docs) ? r.docs : [];
      } catch { docs = []; }

      // Build a combined state from updates
      const Y: any = await import('yjs');
      const ydoc = new (Y as any).Doc();
      let applied = 0;
      for (const d of docs) {
        const b64 = String((d as any)?.updateB64 || '');
        if (!b64) continue;
        try {
          const buf = Buffer.from(b64, 'base64');
          (Y as any).applyUpdate(ydoc, new Uint8Array(buf));
          applied++;
        } catch {}
      }
      const combined = (Y as any).encodeStateAsUpdate(ydoc) as Uint8Array;
      const snapshotB64 = Buffer.from(combined).toString('base64');

      // Persist snapshot
      const snapSelector: any = blipIdVal ? { type: 'yjs_snapshot', waveId, blipId: blipIdVal } : { type: 'yjs_snapshot', waveId };
      const existing = await (await import('../lib/couch.js')).findOne<YDocSnapshot>(snapSelector).catch(() => null);
      const doc: YDocSnapshot = existing
        ? { ...existing, snapshotB64, updatedAt: Date.now(), blipId: blipIdVal ?? (existing as any).blipId }
        : { type: 'yjs_snapshot', waveId, blipId: blipIdVal, snapshotB64, updatedAt: Date.now() };
      const { insertDoc: ins, updateDoc: upd } = await import('../lib/couch.js');
      const r = existing && (existing as any)?._id ? await (upd as any)(doc as any) : await (ins as any)(doc as any);
      res.json({ ok: true, id: r.id, rev: r.rev, applied });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'rebuild_error' });
    }
  });

  // GET /api/editor/search?q=foo&limit=20 — find waves with materialized text match
  router.get('/search', async (req, res) => {
    try {
      const rawQ = String((req.query as any).q || '');
      const q = rawQ.trim();
      let limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
      const blipIdFilter = ((req.query as any).blipId ? String((req.query as any).blipId).trim() : '') || undefined;
      if (!q) { res.json({ results: [] }); return; }
      if (q.length > 256) {
        res.status(400).json({ error: 'query_too_long' });
        return;
      }
      // small safety: avoid too many results when someone passes an extremely small pattern
      if (q.length < 2) {
        limit = Math.min(limit, 10);
      }
      // case-insensitive search using Mango regex
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const selector: any = { type: 'yjs_snapshot', text: { $regex: `(?i).*${safe}.*` } };
      if (blipIdFilter) selector.blipId = blipIdFilter;
      const { find } = await import('../lib/couch.js');
      const r: any = await (find as any)(selector, { limit });
      const results = (r?.docs || []).map((d: any) => ({ waveId: d.waveId, blipId: d.blipId, updatedAt: d.updatedAt }));
      res.json({ results });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'editor_search_error' });
    }
  });
}

export default router;
