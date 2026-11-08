import { Router, type Response } from 'express';
import { findOne, getDoc, insertDoc, updateDoc } from '../lib/couch.js';
import { emitEvent, emitEditorUpdate } from '../lib/socket.js';
import { identityFromRequest, requireWaveAccess, resolveWaveAccess } from '../lib/access.js';
import { csrfProtect } from '../middleware/csrf.js';
import { yjsDocCache } from '../lib/yjsDocCache.js';
import type { Blip } from '../schemas/wave.js';

// Feature flag: set EDITOR_ENABLE=1 to enable endpoints
const ENABLED = process.env['EDITOR_ENABLE'] === '1';
// This legacy WaveView editor has its own Y.Doc lifecycle and transport. Keep
// its persistence namespace disjoint from the modern Socket.IO cache so an
// arbitrary legacy snapshot can never become modern collaboration authority.
const EDITOR_SNAPSHOT_TYPE = 'editor_yjs_snapshot' as const;
const EDITOR_UPDATE_TYPE = 'editor_yjs_update' as const;

type YDocSnapshot = {
  _id?: string;
  type: typeof EDITOR_SNAPSHOT_TYPE;
  waveId: string;
  blipId?: string;
  yjsGeneration: number;
  updatedAt: number;
  // base64-encoded Yjs snapshot (Uint8Array)
  snapshotB64: string;
  // optional materialized plain text for search
  text?: string;
};

type YDocUpdate = {
  _id?: string;
  type: typeof EDITOR_UPDATE_TYPE;
  waveId: string;
  blipId?: string;
  yjsGeneration: number;
  seq: number;
  // base64-encoded Yjs update
  updateB64: string;
  createdAt: number;
};

type YDocSequence = {
  _id: string;
  _rev?: string;
  type: 'yjs_sequence';
  waveId: string;
  blipId?: string;
  value: number;
  updatedAt: number;
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
    yjsGeneration: number;
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

  const sequenceDocId = (waveId: string, blipId?: string) =>
    `yseq:${waveId}:${encodeURIComponent(blipId || '__wave__')}`;

  const readNextSequence = async (waveId: string, blipId?: string): Promise<number> => {
    try {
      const counter = await getDoc<YDocSequence>(sequenceDocId(waveId, blipId));
      return counter.type === 'yjs_sequence' && Number.isSafeInteger(counter.value) && counter.value >= 0
        ? counter.value + 1
        : 1;
    } catch (error: any) {
      if (String(error?.message || '').startsWith('404')) return 1;
      throw error;
    }
  };

  const allocateSequence = async (waveId: string, blipId?: string): Promise<number> => {
    const id = sequenceDocId(waveId, blipId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const now = Date.now();
      let existing: YDocSequence | null = null;
      try {
        existing = await getDoc<YDocSequence>(id);
      } catch (error: any) {
        if (!String(error?.message || '').startsWith('404')) throw error;
      }
      if (existing && (existing.type !== 'yjs_sequence' || !Number.isSafeInteger(existing.value) || existing.value < 0)) {
        throw new Error('invalid_yjs_sequence');
      }
      const value = (existing?.value || 0) + 1;
      const next: YDocSequence = existing
        ? { ...existing, value, updatedAt: now }
        : { _id: id, type: 'yjs_sequence', waveId, blipId, value, updatedAt: now };
      try {
        if (existing) await updateDoc(next as any);
        else await insertDoc(next as any);
        return value;
      } catch (error: any) {
        if (!String(error?.message || '').startsWith('409')) throw error;
      }
    }
    throw new Error('sequence_allocation_conflict');
  };

  const normalizedBlipId = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
  };

  const normalizeYjsGeneration = (value: unknown): number => (
    Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0
  );

  const requestedYjsGeneration = (value: unknown): number | null => (
    Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null
  );

  type EditorTarget = { blip: (Blip & { _id: string; yjsGeneration?: number }) | null; yjsGeneration: number };

  const resolveEditorTarget = async (
    res: Response | null,
    waveId: string,
    blipId: string | undefined,
  ): Promise<EditorTarget | null> => {
    if (!blipId) return { blip: null, yjsGeneration: 0 };
    if (blipId.length > 500) {
      if (!res) throw new Error('invalid_blip');
      res.status(400).json({ error: 'invalid_blip' });
      return null;
    }
    try {
      const blip = await getDoc<Blip & { _id: string; yjsGeneration?: number }>(blipId);
      if (blip.type !== 'blip' || blip.deleted || String(blip.waveId) !== waveId) {
        if (!res) throw new Error('invalid_blip');
        res.status(400).json({ error: 'invalid_blip' });
        return null;
      }
      return { blip, yjsGeneration: normalizeYjsGeneration(blip.yjsGeneration) };
    } catch (error: any) {
      if (String(error?.message || '').startsWith('404')) {
        if (!res) throw new Error('blip_not_found');
        res.status(404).json({ error: 'blip_not_found' });
        return null;
      }
      throw error;
    }
  };

  const withBlipLock = <T>(blipId: string | undefined, operation: () => Promise<T>): Promise<T> => (
    blipId ? yjsDocCache.runExclusive(blipId, operation) : operation()
  );

  const requireMatchingGeneration = (res: any, target: EditorTarget, value: unknown): boolean => {
    const requested = requestedYjsGeneration(value);
    if (requested === target.yjsGeneration) return true;
    res.status(409).json({
      error: 'collaboration_generation_mismatch',
      expectedYjsGeneration: target.yjsGeneration,
    });
    return false;
  };

  const hasExactGeneration = (doc: any, yjsGeneration: number): boolean => (
    Number.isSafeInteger(doc?.yjsGeneration) && Number(doc.yjsGeneration) === yjsGeneration
  );

  const scopedSelector = (
    type: typeof EDITOR_SNAPSHOT_TYPE | typeof EDITOR_UPDATE_TYPE,
    waveId: string,
    blipId: string | undefined,
    yjsGeneration: number,
  ): Record<string, unknown> => ({
    type,
    waveId,
    yjsGeneration,
    ...(blipId ? { blipId } : { blipId: { $exists: false } }),
  });

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
      yjsGeneration: job.yjsGeneration,
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
    let applied = 0;
    try {
      await withBlipLock(blipIdVal, async () => {
        const target = await resolveEditorTarget(null, waveId, blipIdVal);
        if (!target) throw new Error('rebuild_target_missing');
        if (target.yjsGeneration !== job.yjsGeneration) throw new Error('collaboration_generation_changed');
        const selector = scopedSelector(
          EDITOR_UPDATE_TYPE,
          waveId,
          blipIdVal,
          job.yjsGeneration,
        );
        const { find } = await import('../lib/couch.js');
        let docs: any[] = [];
        try {
          const r = await (find as any)(selector, { sort: [{ seq: 'asc' }], limit: 10000 });
          docs = Array.isArray(r?.docs) ? r.docs.filter((doc: any) => hasExactGeneration(doc, job.yjsGeneration)) : [];
        } catch {
          const fallback = await (find as any)(selector, { limit: 10000 }).catch((err: any) => {
            addLog(job, `Failed to fetch updates: ${err?.message || err}`, 'error');
            throw err;
          });
          docs = Array.isArray(fallback?.docs)
            ? fallback.docs.filter((doc: any) => hasExactGeneration(doc, job.yjsGeneration))
            : [];
        }
        addLog(job, `Fetched ${docs.length} updates`);
        const Y: any = await import('yjs');
        const ydoc = new (Y as any).Doc();
        addLog(job, 'Applying updates');
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
        const revalidatedTarget = await resolveEditorTarget(null, waveId, blipIdVal);
        if (!revalidatedTarget || revalidatedTarget.yjsGeneration !== job.yjsGeneration) {
          throw new Error('collaboration_generation_changed');
        }
        const snapSelector = scopedSelector(
          EDITOR_SNAPSHOT_TYPE,
          waveId,
          blipIdVal,
          job.yjsGeneration,
        );
        const couch = await import('../lib/couch.js');
        const candidate = await couch.findOne<YDocSnapshot>(snapSelector).catch(() => null);
        const existing = hasExactGeneration(candidate, job.yjsGeneration) ? candidate : null;
        const doc: YDocSnapshot = existing
          ? { ...existing, snapshotB64, updatedAt: Date.now(), yjsGeneration: job.yjsGeneration, blipId: blipIdVal ?? (existing as any).blipId }
          : { type: EDITOR_SNAPSHOT_TYPE, waveId, blipId: blipIdVal, yjsGeneration: job.yjsGeneration, snapshotB64, updatedAt: Date.now() };
        const r = existing && (existing as any)?._id ? await (couch.updateDoc as any)(doc as any) : await (couch.insertDoc as any)(doc as any);
        addLog(job, `Snapshot saved (${r?.rev ?? 'unknown rev'})`);
      });
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
      await withBlipLock(blipId, async () => {
        const target = await resolveEditorTarget(res, waveId, blipId);
        if (!target) return;
        const selector = scopedSelector(
          EDITOR_SNAPSHOT_TYPE,
          waveId,
          blipId,
          target.yjsGeneration,
        );
        let snap: YDocSnapshot | null = null;
        try {
          const candidate = await findOne<YDocSnapshot>(selector);
          snap = hasExactGeneration(candidate, target.yjsGeneration) ? candidate : null;
        } catch {}
        const nextSeq = await readNextSequence(waveId, blipId);
        res.json({ snapshotB64: snap?.snapshotB64 || null, nextSeq, yjsGeneration: target.yjsGeneration });
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'snapshot_error' });
    }
  });

  // POST /api/editor/:waveId/snapshot { snapshotB64, yjsGeneration, blipId? }
  router.post('/:waveId/snapshot', csrfProtect(), async (req, res) => {
    const waveId = req.params.waveId;
    const snapshotB64 = String((req.body || {}).snapshotB64 || '');
    const text = typeof (req.body || {}).text === 'string' ? String((req.body as any).text) : undefined;
    const blipIdVal = normalizedBlipId((req.body as any)?.blipId);
    if (!snapshotB64) { res.status(400).json({ error: 'missing_snapshot' }); return; }
    try {
      const access = await requireWaveAccess(req, res, waveId, 'edit');
      if (!access) return;
      let saved = false;
      await withBlipLock(blipIdVal, async () => {
        const target = await resolveEditorTarget(res, waveId, blipIdVal);
        if (!target || !requireMatchingGeneration(res, target, (req.body as any)?.yjsGeneration)) return;
        const selector = scopedSelector(
          EDITOR_SNAPSHOT_TYPE,
          waveId,
          blipIdVal,
          target.yjsGeneration,
        );
        const candidate = await findOne<YDocSnapshot>(selector);
        const existing = hasExactGeneration(candidate, target.yjsGeneration) ? candidate : null;
        const doc: YDocSnapshot = existing
          ? { ...existing, snapshotB64, updatedAt: Date.now(), yjsGeneration: target.yjsGeneration, text: (typeof text === 'string' ? text : (existing as any).text), blipId: blipIdVal ?? (existing as any).blipId }
          : { type: EDITOR_SNAPSHOT_TYPE, waveId, blipId: blipIdVal, yjsGeneration: target.yjsGeneration, snapshotB64, updatedAt: Date.now(), text };
        const r = existing && (existing as any)._id ? await updateDoc(doc as any) : await insertDoc(doc as any);
        res.status(existing ? 200 : 201).json({ ok: true, id: r.id, rev: r.rev, yjsGeneration: target.yjsGeneration });
        saved = true;
      });
      if (saved) {
        try { emitEvent('editor:snapshot', { waveId }); } catch {}
      }
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'snapshot_save_error' });
    }
  });

  // POST /api/editor/:waveId/updates { updateB64, yjsGeneration, blipId? }
  router.post('/:waveId/updates', csrfProtect(), async (req, res) => {
    const waveId = req.params.waveId;
    const updateB64 = String((req.body || {}).updateB64 || '');
    const blipIdVal = normalizedBlipId((req.body as any)?.blipId);
    if (!updateB64) { res.status(400).json({ error: 'invalid_payload' }); return; }
    try {
      const access = await requireWaveAccess(req, res, waveId, 'edit');
      if (!access) return;
      await withBlipLock(blipIdVal, async () => {
        const target = await resolveEditorTarget(res, waveId, blipIdVal);
        if (!target || !requireMatchingGeneration(res, target, (req.body as any)?.yjsGeneration)) return;
        const seq = await allocateSequence(waveId, blipIdVal);
        const id = `yupd:${waveId}:${encodeURIComponent(blipIdVal || '__wave__')}:${seq}`;
        const doc: YDocUpdate = { _id: id, type: EDITOR_UPDATE_TYPE, waveId, blipId: blipIdVal, yjsGeneration: target.yjsGeneration, seq, updateB64, createdAt: Date.now() };
        const r = await insertDoc(doc as any);
        res.status(201).json({ ok: true, id: r.id, rev: r.rev, seq, yjsGeneration: target.yjsGeneration });
        try { emitEditorUpdate(waveId, blipIdVal, { waveId, blipId: blipIdVal, yjsGeneration: target.yjsGeneration, seq, updateB64 }); } catch {}
      });
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
    if (!(await resolveEditorTarget(res, waveId, blipIdVal))) return;
    const job = rebuildJobs.get(jobKey(waveId, blipIdVal));
    res.json(serializeJob(job));
  });

  // POST /api/editor/:waveId/rebuild — enqueue rebuild snapshot job
  router.post('/:waveId/rebuild', csrfProtect(), async (req, res) => {
    const waveId = req.params.waveId;
    const access = await requireWaveAccess(req, res, waveId, 'edit');
    if (!access) return;
    const blipIdVal = normalizedBlipId((req.body as any)?.blipId);
    const target = await resolveEditorTarget(res, waveId, blipIdVal);
    if (!target) return;
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
      yjsGeneration: target.yjsGeneration,
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
      const selector: any = {
        type: EDITOR_SNAPSHOT_TYPE,
        text: { $regex: `(?i).*${safe}.*` },
        // Wave-level legacy snapshots have no durable content generation and
        // therefore cannot be proven current after a child blip replacement.
        // Search only generation-scoped snapshots tied to a concrete blip.
        blipId: blipIdFilter || { $exists: true },
      };
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
        const waveId = String(d?.waveId || '');
        const blipId = normalizedBlipId(d?.blipId);
        if (!waveId || !blipId) return null;
        try {
          const access = await resolveWaveAccess(waveId, identity);
          if (!access.canRead) return null;
          return await withBlipLock(blipId, async () => {
            const target = await resolveEditorTarget(null, waveId, blipId);
            return target && hasExactGeneration(d, target.yjsGeneration) ? d : null;
          });
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
