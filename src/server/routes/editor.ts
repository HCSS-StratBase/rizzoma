import { Router } from 'express';
import { findOne, find, insertDoc, updateDoc, deleteDoc, createIndex } from '../lib/couch.js';
import { emitEvent } from '../lib/socket.js';

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

  // POST /api/editor/:waveId/updates { seq, updateB64 }
  router.post('/:waveId/updates', async (req, res) => {
    const waveId = req.params.waveId;
    const seq = Number((req.body || {}).seq);
    const updateB64 = String((req.body || {}).updateB64 || '');
    if (!Number.isFinite(seq) || seq < 1 || !updateB64) { res.status(400).json({ error: 'invalid_payload' }); return; }
    try {
      const id = `yupd:${waveId}:${seq}`;
      const doc: YDocUpdate = { _id: id, type: 'yjs_update', waveId, seq, updateB64, createdAt: Date.now() };
      const r = await insertDoc(doc as any);
      res.status(201).json({ ok: true, id: r.id, rev: r.rev });
      try { emitEvent('editor:update', { waveId, seq }); } catch {}
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'update_save_error' });
    }
  });

  // POST /api/editor/:waveId/compact — dev/admin: compact snapshot/updates
  router.post('/:waveId/compact', async (req, res) => {
    const waveId = req.params.waveId;
    try {
      const { default: Y } = await import('yjs');
      // 1) Load latest snapshot (wave-level)
      let snap: YDocSnapshot | null = null;
      try { snap = await findOne<YDocSnapshot>({ type: 'yjs_snapshot', waveId }); } catch {}
      const ydoc = new (Y as any).Doc();
      if (snap?.snapshotB64) {
        try { (Y as any).applyUpdate(ydoc, Buffer.from(snap.snapshotB64, 'base64')); } catch {}
      }
      // 2) Load updates for wave, apply in seq order
      try { await createIndex(['type','waveId','seq'], 'idx_yjs_update_seq').catch(() => undefined); } catch {}
      const r = await find<YDocUpdate>({ type: 'yjs_update', waveId }, { limit: 10000 });
      const updates = (r.docs || []).slice().sort((a, b) => Number((a as any).seq) - Number((b as any).seq));
      for (const u of updates) {
        const b64 = (u as any).updateB64 as string | undefined;
        if (b64) {
          try { (Y as any).applyUpdate(ydoc, Buffer.from(b64, 'base64')); } catch {}
        }
      }
      // 3) Write fresh snapshot
      const comp = (Y as any).encodeStateAsUpdate(ydoc) as Uint8Array;
      const b64 = Buffer.from(comp).toString('base64');
      const now = Date.now();
      const existing = snap;
      const doc: YDocSnapshot = existing ? { ...existing, snapshotB64: b64, updatedAt: now } : { type: 'yjs_snapshot', waveId, snapshotB64: b64, updatedAt: now };
      const wr = existing && (existing as any)._id ? await updateDoc(doc as any) : await insertDoc(doc as any);
      // 4) Retention: remove all updates (simple policy for now)
      let deleted = 0;
      for (const u of updates) {
        try {
          const id = (u as any)._id as string | undefined;
          const rev = (u as any)._rev as string | undefined;
          if (id && rev) { await deleteDoc(id, rev); deleted += 1; }
        } catch {}
      }
      res.json({ ok: true, waveId, snapshotId: wr.id, deleted });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'compact_error' });
    }
  });

  // GET /api/editor/search?q=foo&limit=20 — find waves with materialized text match
  router.get('/search', async (req, res) => {
    try {
      const q = String((req.query as any).q || '').trim();
      const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
      const blipIdFilter = ((req.query as any).blipId ? String((req.query as any).blipId).trim() : '') || undefined;
      if (!q) { res.json({ results: [] }); return; }
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
