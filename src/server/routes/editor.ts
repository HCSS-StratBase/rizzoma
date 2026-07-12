import { Router } from 'express';
import { findOne, getDoc, insertDoc, updateDoc } from '../lib/couch.js';
import { emitEvent, emitEditorUpdate } from '../lib/socket.js';
import { identityFromRequest, requireWaveAccess, resolveWaveAccess } from '../lib/access.js';
import { csrfProtect } from '../middleware/csrf.js';
import type { Blip } from '../schemas/wave.js';

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
  type RebuildJobStatus = 'queued' | 'running' | 'complete' | 'error';
  type RebuildLogEntry = { at: number; level: 'info' | 'error'; message: string };
  type RebuildJobState = {
    id: string;
    waveId: string;
    blipId?: string;
    status: RebuildJobStatus;
    logs: RebuildLogEntry[];
    queuedAt: number;
    startedAt?: number;
    completedAt?: number;
    applied?: number;
    error?: string;
  };

  const rebuildJobs = new Map<string, RebuildJobState>();
  const jobKey = (waveId: string, blipId?: string) => `${waveId}::${blipId || ''}`;
  const CLEANUP_AFTER_MS = 5 * 60 * 1000;

  const normalizedBlipId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
  };

  const validateEditorBlip = async (
    res: any,
    waveId: string,
    blipId: string | undefined,
  ): Promise<boolean> => {
    if (!blipId) return true;
    if (blipId.length > 500) {
      res.status(400).json({ error: 'invalid_blip' });
      return false;
    }
    try {
      const blip = await getDoc<Blip & { _id: string }>(blipId);
      if (blip.type !== 'blip' || blip.deleted || String(blip.waveId) !== waveId) {
        res.status(400).json({ error: 'invalid_blip' });
        return false;
      }
      return true;
    } catch (error: any) {
      if (String(error?.message || '').startsWith('404')) {
        res.status(404).json({ error: 'blip_not_found' });
        return false;
      }
      throw error;
    }
  };

  const addLog = (job: RebuildJobState, message: string, level: 'info' | 'error' = 'info') => {
    job.logs.push({ at: Date.now(), message, level });
    if (job.logs.length > 100) job.logs.splice(0, job.logs.length - 100);
  };

  const serializeJob = (job?: RebuildJobState | null) => {
    if (!job) return { status: 'idle' };
    return {
      status: job.status,
      jobId: job.id,
      waveId: job.waveId,
      blipId: job.blipId ?? null,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      applied: typeof job.applied === 'number' ? job.applied : null,
      error: job.error ?? null,
      logs: job.logs,
    };
  };

  const scheduleCleanup = (key: string) => {
    setTimeout(() => {
      const job = rebuildJobs.get(key);
      if (!job) return;
      if (job.completedAt && Date.now() - job.completedAt >= CLEANUP_AFTER_MS) {
        rebuildJobs.delete(key);
      } else if (job.status === 'complete' || job.status === 'error') {
        scheduleCleanup(key);
      }
    }, CLEANUP_AFTER_MS).unref?.();
  };

  const executeRebuild = async (key: string, waveId: string, blipIdVal?: string) => {
    const job = rebuildJobs.get(key);
    if (!job) return;
    job.status = 'running';
    job.startedAt = Date.now();
    addLog(job, `Starting rebuild${blipIdVal ? ` for blip ${blipIdVal}` : ''}`);
    try {
      const selector: any = blipIdVal ? { type: 'yjs_update', waveId, blipId: blipIdVal } : { type: 'yjs_update', waveId };
      const { find } = await import('../lib/couch.js');
      let docs: any[] = [];
      try {
        const r = await (find as any)(selector, { sort: [{ seq: 'asc' }], limit: 10000 });
        docs = Array.isArray(r?.docs) ? r.docs : [];
      } catch {
        const fallback = await (find as any)(selector, { limit: 10000 }).catch((err: any) => {
          addLog(job, `Failed to fetch updates: ${err?.message || err}`, 'error');
          throw err;
        });
        docs = Array.isArray(fallback?.docs) ? fallback.docs : [];
      }
      addLog(job, `Fetched ${docs.length} updates`);
      const Y: any = await import('yjs');
      const ydoc = new (Y as any).Doc();
      addLog(job, 'Applying updates');
      let applied = 0;
      for (const d of docs) {
        const b64 = String((d as any)?.updateB64 || '');
        if (!b64) continue;
        try {
          const buf = Buffer.from(b64, 'base64');
          (Y as any).applyUpdate(ydoc, new Uint8Array(buf));
          applied++;
          job.applied = applied;
        } catch (err) {
          addLog(job, `Failed to apply update ${d?._id || ''}: ${err instanceof Error ? err.message : String(err)}`, 'error');
        }
      }
      addLog(job, `Applied ${applied} updates`);
      const combined = (Y as any).encodeStateAsUpdate(ydoc) as Uint8Array;
      const snapshotB64 = Buffer.from(combined).toString('base64');
      addLog(job, 'Persisting snapshot');
      const snapSelector: any = blipIdVal ? { type: 'yjs_snapshot', waveId, blipId: blipIdVal } : { type: 'yjs_snapshot', waveId };
      const couch = await import('../lib/couch.js');
      const existing = await couch.findOne<YDocSnapshot>(snapSelector).catch(() => null);
      const doc: YDocSnapshot = existing
        ? { ...existing, snapshotB64, updatedAt: Date.now(), blipId: blipIdVal ?? (existing as any).blipId }
        : { type: 'yjs_snapshot', waveId, blipId: blipIdVal, snapshotB64, updatedAt: Date.now() };
      const r = existing && (existing as any)?._id ? await (couch.updateDoc as any)(doc as any) : await (couch.insertDoc as any)(doc as any);
      addLog(job, `Snapshot saved (${r?.rev ?? 'unknown rev'})`);
      job.status = 'complete';
      job.applied = applied;
      job.completedAt = Date.now();
      addLog(job, 'Rebuild complete');
      scheduleCleanup(key);
    } catch (e: any) {
      const failure = e?.message || 'rebuild_error';
      job.status = 'error';
      job.error = failure;
      job.completedAt = Date.now();
      addLog(job, `Error: ${failure}`, 'error');
      scheduleCleanup(key);
    }
  };

  // GET /api/editor/:waveId/snapshot — latest snapshot + next seq
  router.get('/:waveId/snapshot', async (req, res) => {
    const waveId = req.params.waveId;
    const blipId = normalizedBlipId((req.query as any)?.blipId);
    try {
      const access = await requireWaveAccess(req, res, waveId, 'read');
      if (!access) return;
      if (!(await validateEditorBlip(res, waveId, blipId))) return;
      // Prefer a blip-specific snapshot when requested; otherwise fall back to wave-level
      let snap: YDocSnapshot | null = null;
      if (blipId) {
        try { snap = await findOne<YDocSnapshot>({ type: 'yjs_snapshot', waveId, blipId }); } catch {}
      }
      if (!snap && !blipId) {
        try { snap = await findOne<YDocSnapshot>({ type: 'yjs_snapshot', waveId }); } catch {}
      }
      // next seq based on latest update
      let nextSeq = 1;
      const updateSelector: any = blipId
        ? { type: 'yjs_update', waveId, blipId }
        : { type: 'yjs_update', waveId, blipId: { $exists: false } };
      const u = await findOne<YDocUpdate>(updateSelector);
      // Note: findOne has no sort; in real impl we’d query by max seq. Keep it simple for dev.
      if (u && typeof (u as any).seq === 'number') nextSeq = (u as any).seq + 1;
      res.json({ snapshotB64: snap?.snapshotB64 || null, nextSeq });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'snapshot_error' });
    }
  });

  // POST /api/editor/:waveId/snapshot { snapshotB64 }
  router.post('/:waveId/snapshot', csrfProtect(), async (req, res) => {
    const waveId = req.params.waveId;
    const snapshotB64 = String((req.body || {}).snapshotB64 || '');
    const text = typeof (req.body || {}).text === 'string' ? String((req.body as any).text) : undefined;
    const blipIdVal = normalizedBlipId((req.body as any)?.blipId);
    if (!snapshotB64) { res.status(400).json({ error: 'missing_snapshot' }); return; }
    try {
      const access = await requireWaveAccess(req, res, waveId, 'edit');
      if (!access) return;
      if (!(await validateEditorBlip(res, waveId, blipIdVal))) return;
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
  router.post('/:waveId/updates', csrfProtect(), async (req, res) => {
    const waveId = req.params.waveId;
    const seq = Number((req.body || {}).seq);
    const updateB64 = String((req.body || {}).updateB64 || '');
    const blipIdVal = normalizedBlipId((req.body as any)?.blipId);
    if (!Number.isFinite(seq) || seq < 1 || !updateB64) { res.status(400).json({ error: 'invalid_payload' }); return; }
    try {
      const access = await requireWaveAccess(req, res, waveId, 'edit');
      if (!access) return;
      if (!(await validateEditorBlip(res, waveId, blipIdVal))) return;
      const id = `yupd:${waveId}:${encodeURIComponent(blipIdVal || '__wave__')}:${seq}`;
      const doc: YDocUpdate = { _id: id, type: 'yjs_update', waveId, blipId: blipIdVal, seq, updateB64, createdAt: Date.now() };
      const r = await insertDoc(doc as any);
      res.status(201).json({ ok: true, id: r.id, rev: r.rev });
      try { emitEditorUpdate(waveId, blipIdVal, { waveId, blipId: blipIdVal, seq, updateB64 }); } catch {}
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'update_save_error' });
    }
  });

  // GET /api/editor/:waveId/rebuild — inspect rebuild job status
  router.get('/:waveId/rebuild', async (req, res) => {
    const waveId = req.params.waveId;
    const access = await requireWaveAccess(req, res, waveId, 'read');
    if (!access) return;
    const blipIdVal = normalizedBlipId((req.query as any)?.blipId);
    if (!(await validateEditorBlip(res, waveId, blipIdVal))) return;
    const job = rebuildJobs.get(jobKey(waveId, blipIdVal));
    res.json(serializeJob(job));
  });

  // POST /api/editor/:waveId/rebuild — enqueue rebuild snapshot job
  router.post('/:waveId/rebuild', csrfProtect(), async (req, res) => {
    const waveId = req.params.waveId;
    const access = await requireWaveAccess(req, res, waveId, 'edit');
    if (!access) return;
    const blipIdVal = normalizedBlipId((req.body as any)?.blipId);
    if (!(await validateEditorBlip(res, waveId, blipIdVal))) return;
    const key = jobKey(waveId, blipIdVal);
    const existing = rebuildJobs.get(key);
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      res.status(202).json(serializeJob(existing));
      return;
    }
    const job: RebuildJobState = {
      id: `${key}:${Date.now()}`,
      waveId,
      blipId: blipIdVal,
      status: 'queued',
      logs: [],
      queuedAt: Date.now(),
      applied: existing?.applied,
    };
    addLog(job, 'Job queued');
    rebuildJobs.set(key, job);
    setImmediate(() => { executeRebuild(key, waveId, blipIdVal).catch(() => undefined); });
    res.status(202).json(serializeJob(job));
  });

  const buildSnippet = (text: string | undefined, query: string): string | null => {
    if (!text) return null;
    if (!query) return text.slice(0, 120) + (text.length > 120 ? '…' : '');
    const lower = text.toLowerCase();
    const needle = query.toLowerCase();
    const idx = lower.indexOf(needle);
    const radius = 60;
    const start = idx >= 0 ? Math.max(0, idx - radius) : 0;
    const end = idx >= 0 ? Math.min(text.length, idx + needle.length + radius) : Math.min(text.length, radius * 2);
    const snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    return `${prefix}${snippet}${suffix}`;
  };

  // GET /api/editor/search?q=foo&limit=20 — find waves with materialized text match
  router.get('/search', async (req, res) => {
    try {
      const rawQ = String((req.query as any).q || '');
      const q = rawQ.trim();
      let limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
      const blipIdFilter = ((req.query as any).blipId ? String((req.query as any).blipId).trim() : '') || undefined;
      const bookmark = ((req.query as any).bookmark ? String((req.query as any).bookmark).trim() : '') || undefined;
      if (!q) { res.json({ results: [], nextBookmark: null }); return; }
      if (q.length > 256) {
        res.status(400).json({ error: 'query_too_long' });
        return;
      }
      if (q.length < 2) {
        limit = Math.min(limit, 10);
      }
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const selector: any = { type: 'yjs_snapshot', text: { $regex: `(?i).*${safe}.*` } };
      if (blipIdFilter) selector.blipId = blipIdFilter;
      const { find } = await import('../lib/couch.js');
      // Preserve CouchDB bookmark boundaries exactly. Over-fetching and then
      // slicing after authorization would advance the bookmark past visible
      // results that were not returned, silently skipping them on page 2.
      const fetchLimit = limit;
      const options: any = { limit: fetchLimit, sort: [{ updatedAt: 'desc' }] };
      if (bookmark) options.bookmark = bookmark;
      let r: any;
      try {
        r = await (find as any)(selector, options);
      } catch {
        const fallback = { ...options };
        delete fallback.sort;
        r = await (find as any)(selector, fallback);
      }
      const docs = Array.isArray(r?.docs) ? r.docs : [];
      const identity = identityFromRequest(req);
      const accessChecks = await Promise.all(docs.map(async (d: any) => {
        try {
          const access = await resolveWaveAccess(String(d.waveId || ''), identity);
          return access.canRead ? d : null;
        } catch {
          return null;
        }
      }));
      const paged = accessChecks.filter(Boolean).slice(0, limit) as any[];
      const nextBookmark = docs.length >= fetchLimit && r?.bookmark ? r.bookmark : null;
      const results = paged.map((d: any) => ({
        waveId: d.waveId,
        blipId: d.blipId,
        updatedAt: d.updatedAt,
        snippet: buildSnippet((d as any)?.text, q),
      }));
      res.json({ results, nextBookmark });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'editor_search_error' });
    }
  });
}

export default router;
