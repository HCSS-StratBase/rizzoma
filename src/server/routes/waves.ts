import { Router } from 'express';
import { find, findOne, getDoc, insertDoc, updateDoc, view } from '../lib/couch.js';
import { emitEvent, refreshWaveSocketAccess } from '../lib/socket.js';
import type { Blip, Wave, BlipRead, WaveParticipant } from '../schemas/wave.js';
import { computeWaveUnreadCounts, invalidateUnreadCache } from '../lib/unread.js';
import { sendInviteEmail } from '../services/email.js';
import { noStore } from '../middleware/noStore.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfProtect } from '../middleware/csrf.js';
import { z } from 'zod';
import { inviteRateLimit } from '../middleware/inviteRateLimit.js';
import {
  buildAccessibleTopicSelector,
  identityFromRequest,
  isDeletedWave,
  normalizeSharingPolicy,
  requireWaveAccess,
  resolveWaveAccess,
} from '../lib/access.js';
import {
  buildInviteUrl,
  createInviteToken,
  hashInviteToken,
  invitationTokenDocId,
  resolveInviteBaseUrl,
  sortParticipantCandidates,
} from '../lib/invitations.js';

const router = Router();
type FlatBlip = { id: string; updatedAt: number; createdAt?: number; content?: string; children?: FlatBlip[] };

const participantEmail = (participant: Partial<WaveParticipant>) => String(participant.email || '').trim().toLowerCase();

type InvitationTokenDoc = {
  _id: string;
  _rev?: string;
  type: 'invitation_token';
  tokenHash: string;
  participantId: string;
  waveId: string;
  email: string;
  status: 'pending_delivery' | 'sent' | 'failed' | 'used' | 'revoked';
  createdAt: number;
  expiresAt: number;
  deliveredAt?: number;
  failedAt?: number;
  usedAt?: number;
  usedBy?: string;
};
const sameParticipantIdentity = (left: Partial<WaveParticipant>, right: Partial<WaveParticipant>) => (
  Boolean(left.userId && right.userId && left.userId === right.userId)
  || Boolean(participantEmail(left) && participantEmail(left) === participantEmail(right))
);

async function participantDuplicates(
  waveId: string,
  participant: Partial<WaveParticipant>,
): Promise<Array<WaveParticipant & { _id: string; _rev?: string }>> {
  const result = await find<WaveParticipant & { _id: string; _rev?: string }>(
    { type: 'participant', waveId },
    { limit: 500 },
  ).catch(() => ({ docs: [] as Array<WaveParticipant & { _id: string; _rev?: string }> }));
  return (result.docs || []).filter((candidate) => sameParticipantIdentity(candidate, participant));
}

const sharingPolicySchema = z.object({
  shareLevel: z.enum(['private', 'link', 'public']),
  allowComments: z.boolean(),
  allowEdits: z.boolean(),
}).transform((policy) => ({
  ...policy,
  // Editing necessarily includes replying/commenting; persist the canonical
  // implication so the UI and effective role never disagree.
  allowComments: policy.shareLevel === 'private' ? false : policy.allowComments || policy.allowEdits,
  allowEdits: policy.shareLevel === 'private' ? false : policy.allowEdits,
}));

async function loadWaveBlipTree(waveId: string): Promise<{ blips: Blip[]; roots: FlatBlip[] }> {
  const result = await find<Blip>(
    { type: 'blip', waveId },
    { limit: 20000, sort: [{ createdAt: 'asc' }] },
  ).catch(async () => find<Blip>({ type: 'blip', waveId }, { limit: 20000 }));

  let blips = (result.docs || []).map((blip) => ({
    ...blip,
    createdAt: (blip as any).createdAt || (blip as any).contentTimestamp || 0,
  }));

  if (blips.length === 0) {
    const legacy = await view<any>('nonremoved_blips_by_wave_id', 'get', {
      include_docs: true as any,
      key: waveId as any,
    }).catch(() => ({ rows: [] as any[] }));
    blips = (legacy.rows || []).map((row: any) => ({
      ...(row.doc || {}),
      createdAt: (row.doc && (row.doc.createdAt || row.doc.contentTimestamp)) || 0,
    }));
  }

  const byParent = new Map<string | null, Blip[]>();
  for (const blip of blips) {
    const parentId = (blip.parentId ?? null) as string | null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push(blip as Blip);
  }
  const toNode = (blip: Blip): FlatBlip => ({
    id: (blip as any)._id,
    content: (blip as any).content || '',
    createdAt: (blip as any).createdAt,
    updatedAt: (blip as any).updatedAt || (blip as any).createdAt || 0,
    children: (byParent.get((blip as any)._id || '') || []).map(toNode),
  });

  return { blips, roots: (byParent.get(null) || []).map(toNode) };
}

// GET /api/waves?limit&offset&q
router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String((req.query as any).offset ?? '0'), 10) || 0, 0);
  const q = String((req.query as any).q ?? '').trim();
  try {
    const accessSelector = await buildAccessibleTopicSelector(identityFromRequest(req), false, 'wave');
    const selector: any = q
      ? {
          $and: [
            accessSelector,
            { title: { $regex: `(?i).*${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*` } },
          ],
        }
      : accessSelector;
    let r: { docs: Wave[] };
    try {
      r = await find<Wave>(selector, { limit: limit + 1, skip: offset, sort: [{ createdAt: 'desc' }] });
    } catch {
      r = await find<Wave>(selector, { limit: limit + 1, skip: offset });
    }
    let docs = r.docs || [];
    let list = docs.slice(0, limit).map((w) => ({ id: w._id, title: w.title, createdAt: w.createdAt }));
    let hasMore = docs.length > limit;
    res.json({ waves: list, hasMore });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'waves_error', requestId: (req as any)?.id });
  }
});

// GET /api/waves/unread_counts?ids=w1,w2,... — per-wave unread/total for current user
// noStore: per-user dynamic response; prevents weak-ETag 304 replay (see middleware/noStore.ts, BUG #56)
router.get('/unread_counts', noStore, async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const idsParam = String((req.query as any).ids || '').trim();
    const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200) : [];
    const identity = identityFromRequest(req);
    const accessibleIds = (await Promise.all(ids.map(async (waveId) => {
      try {
        const access = await resolveWaveAccess(waveId, identity);
        return access.canRead ? waveId : null;
      } catch {
        return null;
      }
    }))).filter((waveId): waveId is string => Boolean(waveId));
    const counts = await computeWaveUnreadCounts(userId, accessibleIds);
    const results = accessibleIds.map((waveId) => {
      const entry = counts[waveId] || { total: 0, unread: 0, read: 0 };
      return { waveId, total: entry.total, unread: entry.unread, read: entry.read };
    });
    res.json({ counts: results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'unread_counts_error', requestId: (req as any)?.id });
  }
});

// GET/PATCH /api/waves/:id/sharing — persisted topic sharing policy.
// Legacy documents with no policy remain public-read-only for compatibility;
// newly-created topics always persist an explicit private policy.
router.get('/:id/sharing', noStore, async (req, res) => {
  const waveId = String(req.params['id'] || '');
  try {
    const wave = await getDoc<any>(waveId);
    const access = await requireWaveAccess(req, res, waveId, 'read', wave);
    if (!access) return;
    res.json({
      sharing: normalizeSharingPolicy(wave),
      role: access.role,
      canManage: access.canManage,
    });
  } catch (e: any) {
    if (String(e?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'sharing_read_error', requestId: (req as any)?.id });
  }
});

router.patch('/:id/sharing', requireAuth, csrfProtect(), async (req, res) => {
  const waveId = String(req.params['id'] || '');
  let accessMutationAttempted = false;
  let accessRefreshCompleted = false;
  try {
    const policy = sharingPolicySchema.parse(req.body || {});
    const wave = await getDoc<any>(waveId);
    const access = await requireWaveAccess(req, res, waveId, 'manage', wave);
    if (!access) return;
    const now = Date.now();
    const next = {
      ...wave,
      ...policy,
      sharingUpdatedAt: now,
      sharingUpdatedBy: req.user!.id,
      updatedAt: Math.max(Number(wave.updatedAt || 0), now),
    };
    accessMutationAttempted = true;
    const result = await updateDoc(next);
    await refreshWaveSocketAccess(waveId);
    accessRefreshCompleted = true;
    res.json({
      id: result.id,
      rev: result.rev,
      sharing: policy,
    });
    try {
      emitEvent('sharing:updated', { waveId, sharing: policy, updatedAt: now });
    } catch {}
  } catch (e: any) {
    if (e?.issues) {
      res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id });
      return;
    }
    if (String(e?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'sharing_update_error', requestId: (req as any)?.id });
  } finally {
    if (accessMutationAttempted && !accessRefreshCompleted) {
      await refreshWaveSocketAccess(waveId).catch((refreshError: any) => {
        console.error('[waves] sharing access refresh failed after mutation error', {
          waveId,
          error: refreshError?.message || String(refreshError),
        });
      });
    }
  }
});

// GET /api/waves/:id/history — wave-level playback timeline (all blip_history entries)
router.get('/:id/history', async (req, res) => {
  const waveId = req.params.id;
  const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '2000'), 10) || 2000, 1), 5000);
  const after = parseInt(String((req.query as any).after ?? '0'), 10) || 0;
  const before = parseInt(String((req.query as any).before ?? '0'), 10) || 0;
  try {
    const access = await requireWaveAccess(req, res, waveId, 'read');
    if (!access) return;
    type BlipHistoryDoc = {
      _id: string;
      type: 'blip_history';
      blipId: string;
      waveId: string;
      content: string;
      authorId?: string;
      authorName?: string;
      event: 'create' | 'update';
      createdAt: number;
      updatedAt: number;
      snapshotVersion: number;
    };
    const selector: any = { type: 'blip_history', waveId };
    if (after) selector.createdAt = { ...selector.createdAt, $gt: after };
    if (before) selector.createdAt = { ...(selector.createdAt || {}), $lt: before };
    const r = await find<BlipHistoryDoc>(selector, {
      limit: limit + 1,
      sort: [{ createdAt: 'asc' }],
      use_index: 'idx_blip_history_wave_createdAt',
    });
    const docs = r.docs || [];
    const hasMore = docs.length > limit;
    const entries = docs.slice(0, limit).map(d => ({
      id: d._id,
      blipId: d.blipId,
      waveId: d.waveId,
      content: d.content,
      authorId: d.authorId,
      authorName: d.authorName,
      event: d.event,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      snapshotVersion: d.snapshotVersion,
    }));
    const blipIds = [...new Set(entries.map(e => e.blipId))];
    const earliest = entries.length > 0 ? entries[0].createdAt : 0;
    const latest = entries.length > 0 ? entries[entries.length - 1].createdAt : 0;
    res.json({ history: entries, total: entries.length, hasMore, blipIds, dateRange: { earliest, latest } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'wave_history_error', requestId: (req as any)?.id });
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
    if (isDeletedWave(wave)) {
      res.status(410).json({ error: 'wave_deleted', requestId: (req as any)?.id });
      return;
    }
    const access = await requireWaveAccess(req, res, id, 'read', wave);
    if (!access) return;
    const { blips, roots } = await loadWaveBlipTree(id);
    if (!wave && blips.length === 0) {
      res.status(404).json({ error: 'wave_not_found', requestId: (req as any)?.id });
      return;
    }
    const title = wave?.title || `(legacy) wave ${id.slice(0, 6)}`;
    const createdAt = wave?.createdAt || (blips[0]?.createdAt || Date.now());
    res.json({ id, title, createdAt, blips: roots });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'wave_error', requestId: (req as any)?.id });
  }
});

// compute a depth-first order of blips (preorder) including timestamps
function flattenBlips(blips: FlatBlip[]): Array<{ id: string; updatedAt: number }> {
  const out: Array<{ id: string; updatedAt: number }> = [];
  const visit = (n: FlatBlip) => {
    if (n && n.id) {
      const updatedAt = Number(n.updatedAt ?? n.createdAt ?? 0);
      out.push({ id: String(n.id), updatedAt });
    }
    (n.children || []).forEach(visit);
  };
  (blips || []).forEach(visit);
  return out;
}

// GET /api/waves/:id/unread — list unread blip IDs for current user
// noStore: per-user dynamic (unread list is per-user, not part of the wave doc)
router.get('/:id/unread', noStore, async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params['id'] as string;
  try {
    const access = await requireWaveAccess(req, res, id, 'read');
    if (!access) return;
    const { roots } = await loadWaveBlipTree(id);
    const order = flattenBlips(roots);

    const r = await find<BlipRead>({ type: 'read', userId, waveId: id }, { limit: 10000 });
    const readMap = new Map<string, number>();
    (r.docs || []).forEach((d) => readMap.set(String(d.blipId), Number((d as any).readAt || 0)));
    const unreadEntries = order.filter((entry) => entry.updatedAt > (readMap.get(entry.id) || 0));
    res.json({ unread: unreadEntries.map((e) => e.id), total: order.length, read: order.length - unreadEntries.length });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'unread_error', requestId: (req as any)?.id });
  }
});

// GET /api/waves/:id/next?after=blipId — next unread blip id
// noStore: per-user dynamic (next unread is per-user)
router.get('/:id/next', noStore, async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params['id'] as string;
  const after = String((req.query as any).after || '');
  try {
    const access = await requireWaveAccess(req, res, id, 'read');
    if (!access) return;
    const { roots } = await loadWaveBlipTree(id);
    const order = flattenBlips(roots);

    const r = await find<BlipRead>({ type: 'read', userId, waveId: id }, { limit: 10000 });
    const readMap = new Map<string, number>();
    (r.docs || []).forEach((d) => readMap.set(String(d.blipId), Number((d as any).readAt || 0)));
    const startIdx = after ? Math.max(0, order.findIndex((o) => o.id === after) + 1) : 0;
    const nextEntry = order.slice(startIdx).find((entry) => entry.updatedAt > (readMap.get(entry.id) || 0));
    res.json({ next: nextEntry?.id || null });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'next_error', requestId: (req as any)?.id });
  }
});

// GET /api/waves/:id/prev?before=blipId — previous unread blip id
// noStore: per-user dynamic
router.get('/:id/prev', noStore, async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params['id'] as string;
  const before = String((req.query as any).before || '');
  try {
    const access = await requireWaveAccess(req, res, id, 'read');
    if (!access) return;
    const { roots } = await loadWaveBlipTree(id);
    const order = flattenBlips(roots);

    const r = await find<BlipRead>({ type: 'read', userId, waveId: id }, { limit: 10000 });
    const readMap = new Map<string, number>();
    (r.docs || []).forEach((d) => readMap.set(String(d.blipId), Number((d as any).readAt || 0)));
    const startIdx = before ? Math.max(0, order.findIndex((o) => o.id === before) - 1) : order.length - 1;
    let prev: string | null = null;
    for (let i = startIdx; i >= 0; i--) {
      const entry = order[i];
      const readAt = readMap.get(entry.id) || 0;
      if (entry && entry.updatedAt > readAt) { prev = entry.id; break; }
    }
    res.json({ prev });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'prev_error', requestId: (req as any)?.id });
  }
});
// POST /api/waves/:waveId/blips/:blipId/read — mark one blip as read
router.post('/:waveId/blips/:blipId/read', csrfProtect(), async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const waveId = req.params.waveId;
  const blipId = req.params.blipId;
  try {
    const access = await requireWaveAccess(req, res, waveId, 'read');
    if (!access) return;
    try { console.log('[waves] mark one read', { waveId, blipId, userId }); } catch {}
    const keyId = `read:user:${userId}:wave:${waveId}:blip:${blipId}`;
      const now = Date.now();
      const existing = await findOne<BlipRead & { _rev?: string }>({ type: 'read', userId, waveId, blipId }).catch(() => null);
      if (existing && existing._id && existing._rev) {
        const r = await updateDoc({ ...existing, readAt: now } as any);
        invalidateUnreadCache(userId);
        try { console.log('[waves] emit wave:unread (single)', { waveId, blipId, userId }); emitEvent('blip:read', { waveId, blipId, userId, readAt: now }); emitEvent('wave:unread', { waveId, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); }
        res.json({ ok: true, id: r.id, rev: r.rev, readAt: now });
        return;
      }
      const doc: BlipRead = { _id: keyId, type: 'read', userId, waveId, blipId, readAt: now };
      try {
        const r = await insertDoc(doc as any);
        invalidateUnreadCache(userId);
        try { console.log('[waves] emit wave:unread (single insert)', { waveId, blipId, userId }); emitEvent('blip:read', { waveId, blipId, userId, readAt: now }); emitEvent('wave:unread', { waveId, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); }
        res.status(201).json({ ok: true, id: r.id, rev: r.rev, readAt: now });
      } catch (insertErr: any) {
        // Handle 409 conflict from concurrent insert — re-fetch and update
        if (insertErr?.message?.startsWith('409')) {
          const retried = await findOne<BlipRead & { _rev?: string }>({ type: 'read', userId, waveId, blipId }).catch(() => null);
          if (retried && retried._id && retried._rev) {
            const r = await updateDoc({ ...retried, readAt: now } as any);
            invalidateUnreadCache(userId);
            try { emitEvent('blip:read', { waveId, blipId, userId, readAt: now }); emitEvent('wave:unread', { waveId, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); }
            res.json({ ok: true, id: r.id, rev: r.rev, readAt: now });
            return;
          }
        }
        throw insertErr;
      }
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'read_mark_error', requestId: (req as any)?.id });
    }
  });

// POST /api/waves/:id/read — mark multiple blips as read { blipIds: [] }
router.post('/:id/read', csrfProtect(), async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params.id;
  let blipIds = Array.isArray((req.body || {}).blipIds) ? (req.body as any).blipIds.map((s: any) => String(s)) : [];

  const access = await requireWaveAccess(req, res, id, 'read');
  if (!access) return;

  // "Mark entire topic as read" path: when no specific blipIds are
  // passed, load every blip in the wave and mark all of them read.
  // Previously this endpoint would silently no-op on an empty body
  // and return `{ok:true, count:0}` — the gear-menu "Mark topic as
  // read" used POST with no body, so the user saw a "Topic marked
  // as read" toast while the green unread indicators stayed lit.
  if (blipIds.length === 0) {
    try {
      const r = await find<{ _id: string }>(
        { type: 'blip', waveId: id },
        { limit: 5000 }
      );
      blipIds = (r.docs || []).map((d) => String(d._id || '')).filter(Boolean);
      try { console.log('[waves] mark ALL read — expanded to', blipIds.length, 'blips', { waveId: id, userId }); } catch {}
    } catch (e) {
      console.error('[waves] mark ALL read — failed to enumerate blips', e);
    }
  }

  const results: Array<{ id: string; ok: boolean }> = [];
   try { console.log('[waves] mark many read', { waveId: id, count: blipIds.length, userId }); } catch {}
  // Invalidate the unread-count cache up-front so the topic sidebar
  // reflects the new state the moment the first blip write lands,
  // not after the 30 s TTL expires.
  invalidateUnreadCache(userId);
  for (const bid of blipIds) {
    try {
      const keyId = `read:user:${userId}:wave:${id}:blip:${bid}`;
      const now = Date.now();
      const existing = await findOne<BlipRead & { _rev?: string }>({ type: 'read', userId, waveId: id, blipId: bid }).catch(() => null);
      if (existing && existing._id && existing._rev) {
        const r = await updateDoc({ ...existing, readAt: now } as any);
        if (r?.ok) { results.push({ id: bid, ok: true }); try { console.log('[waves] emit wave:unread (bulk update)', { waveId: id, blipId: bid, userId }); emitEvent('blip:read', { waveId: id, blipId: bid, userId, readAt: now }); emitEvent('wave:unread', { waveId: id, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); } }
        else results.push({ id: bid, ok: false });
        continue;
      }
      const r = await insertDoc({ _id: keyId, type: 'read', userId, waveId: id, blipId: bid, readAt: now } as any);
      if (r?.ok) { results.push({ id: bid, ok: true }); try { console.log('[waves] emit wave:unread (bulk insert)', { waveId: id, blipId: bid, userId }); emitEvent('blip:read', { waveId: id, blipId: bid, userId, readAt: now }); emitEvent('wave:unread', { waveId: id, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); } } else results.push({ id: bid, ok: false });
    } catch {
      results.push({ id: bid, ok: false });
    }
  }
  res.json({ ok: true, count: results.length, results });
});

// GET /api/waves/:id/participants — list wave participants
router.get('/:id/participants', async (req, res) => {
  const id = req.params.id;
  try {
    const access = await requireWaveAccess(req, res, id, 'read');
    if (!access) return;
    // Task #192 (2026-05-11): explicitly use idx_participant_by_wave —
    // without it CouchDB Mango may pick a different (slower) index or do
    // a full table scan. Per memory: "Mango IGNORES use_index if sort
    // doesn't match index fields" — here we have no sort, so use_index
    // is honored.
    const r = await find<WaveParticipant>(
      { type: 'participant', waveId: id },
      { limit: 200, use_index: 'idx_participant_wave_user' },
    );
    const visible = access.canManage
      ? (r.docs || [])
      : (r.docs || []).filter((participant) => (
          (participant.status === 'accepted' || participant.status === undefined)
          && !String(participant.userId || '').startsWith('invite:')
        ));
    const participants = await Promise.all(visible.map(async (participant) => {
      if (access.canManage) {
        return {
          id: participant._id,
          userId: participant.userId,
          email: participant.email,
          role: participant.role,
          status: participant.status,
        };
      }
      const user = await getDoc<any>(participant.userId).catch(() => null);
      return {
        id: participant._id,
        userId: participant.userId,
        name: user?.name || undefined,
        avatar: user?.avatar || undefined,
        role: participant.role,
        status: participant.status,
      };
    }));
    res.json({ participants });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.startsWith('404')) {
      res.status(404).json({ error: 'wave_not_found', requestId: (req as any)?.id });
      return;
    }
    // Fail closed: a storage outage is not an empty roster. Owners must not
    // make access decisions from a fabricated successful response.
    res.status(500).json({ error: 'participants_load_error', requestId: (req as any)?.id });
  }
});

router.patch('/:id/participants/:participantId', requireAuth, csrfProtect(), async (req, res) => {
  const waveId = String(req.params['id'] || '');
  const participantId = String(req.params['participantId'] || '');
  let accessMutationAttempted = false;
  let accessRefreshCompleted = false;
  try {
    const access = await requireWaveAccess(req, res, waveId, 'manage');
    if (!access) return;
    const payload = z.object({
      role: z.enum(['editor', 'commenter', 'viewer']),
    }).parse(req.body || {});
    const participant = await getDoc<WaveParticipant & { _id: string; _rev: string }>(participantId);
    if (participant.type !== 'participant' || participant.waveId !== waveId) {
      res.status(404).json({ error: 'participant_not_found' });
      return;
    }
    if (participant.role === 'owner') {
      res.status(400).json({ error: 'owner_role_immutable' });
      return;
    }
    const duplicates = await participantDuplicates(waveId, participant);
    const mutable = duplicates.filter((candidate) => candidate.role !== 'owner');
    if (duplicates.some((candidate) => candidate.role === 'owner')) {
      res.status(400).json({ error: 'owner_role_immutable' });
      return;
    }
    accessMutationAttempted = true;
    const updates = await Promise.all(mutable.map((candidate) => updateDoc({ ...candidate, role: payload.role } as any)));
    const result = updates.find((entry) => entry.id === participantId) || updates[0];
    await refreshWaveSocketAccess(waveId);
    accessRefreshCompleted = true;
    res.json({ id: result?.id || participantId, rev: result?.rev, role: payload.role, updated: mutable.length });
  } catch (e: any) {
    if (e?.issues) {
      res.status(400).json({ error: 'validation_error', issues: e.issues });
      return;
    }
    if (String(e?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'participant_not_found' });
      return;
    }
    res.status(500).json({ error: e?.message || 'participant_update_error' });
  } finally {
    if (accessMutationAttempted && !accessRefreshCompleted) {
      await refreshWaveSocketAccess(waveId).catch((refreshError: any) => {
        console.error('[waves] participant update access refresh failed after mutation error', {
          waveId,
          participantId,
          error: refreshError?.message || String(refreshError),
        });
      });
    }
  }
});

router.delete('/:id/participants/:participantId', requireAuth, csrfProtect(), async (req, res) => {
  const waveId = String(req.params['id'] || '');
  const participantId = String(req.params['participantId'] || '');
  let accessMutationAttempted = false;
  let accessRefreshCompleted = false;
  try {
    const access = await requireWaveAccess(req, res, waveId, 'manage');
    if (!access) return;
    const participant = await getDoc<WaveParticipant & { _id: string; _rev: string }>(participantId);
    if (participant.type !== 'participant' || participant.waveId !== waveId) {
      res.status(404).json({ error: 'participant_not_found' });
      return;
    }
    if (participant.role === 'owner') {
      res.status(400).json({ error: 'owner_removal_forbidden' });
      return;
    }
    const duplicates = await participantDuplicates(waveId, participant);
    if (duplicates.some((candidate) => candidate.role === 'owner')) {
      res.status(400).json({ error: 'owner_removal_forbidden' });
      return;
    }
    const now = Date.now();
    accessMutationAttempted = true;
    const updates = await Promise.all(duplicates.map((candidate) => updateDoc({
        ...candidate,
        status: 'declined',
        declinedAt: now,
        declinedBy: req.user!.id,
        inviteTokenHash: undefined,
        inviteExpiresAt: undefined,
        acceptedInviteTokenHash: undefined,
        acceptedInviteExpiresAt: undefined,
      } as any)));
    const result = updates.find((entry) => entry.id === participantId) || updates[0];
    const tokens = await find<InvitationTokenDoc>({
      type: 'invitation_token',
      waveId,
      email: participantEmail(participant),
    }, { limit: 500 }).catch(() => ({ docs: [] as InvitationTokenDoc[] }));
    await Promise.all((tokens.docs || [])
      .filter((token) => token.status !== 'used' && token.status !== 'revoked')
      .map((token) => updateDoc({ ...token, status: 'revoked', revokedAt: now } as any)));
    await refreshWaveSocketAccess(waveId);
    accessRefreshCompleted = true;
    res.json({ id: result?.id || participantId, rev: result?.rev, removed: true, status: 'declined', updated: duplicates.length });
  } catch (e: any) {
    if (String(e?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'participant_not_found' });
      return;
    }
    res.status(500).json({ error: e?.message || 'participant_remove_error' });
  } finally {
    if (accessMutationAttempted && !accessRefreshCompleted) {
      await refreshWaveSocketAccess(waveId).catch((refreshError: any) => {
        console.error('[waves] participant removal access refresh failed after mutation error', {
          waveId,
          participantId,
          error: refreshError?.message || String(refreshError),
        });
      });
    }
  }
});

// Redeem a one-time invitation after authentication. The token proves access
// to the invitation email; merely registering the guessed address never does.
router.post('/invitations/accept', requireAuth, csrfProtect(), async (req, res) => {
  const token = String((req.body || {}).token || '').trim();
  if (token.length < 32) {
    res.status(400).json({ error: 'invalid_invite_token' });
    return;
  }
  const tokenHash = hashInviteToken(token);
  let accessMutationWaveId: string | null = null;
  let accessRefreshCompleted = false;
  try {
    const tokenDoc = await getDoc<InvitationTokenDoc>(invitationTokenDocId(tokenHash)).catch(() => null);
    if (tokenDoc) {
      if (Number(tokenDoc.expiresAt || 0) <= Date.now()) {
        res.status(410).json({ error: 'invite_expired' });
        return;
      }
      const sessionEmail = String(req.user?.email || '').trim().toLowerCase();
      if (!sessionEmail || sessionEmail !== tokenDoc.email.trim().toLowerCase()) {
        res.status(403).json({ error: 'invite_email_mismatch' });
        return;
      }
      if (tokenDoc.status === 'used') {
        if (tokenDoc.usedBy === req.user!.id) {
          res.json({ id: tokenDoc.participantId, waveId: tokenDoc.waveId, accepted: true, alreadyAccepted: true });
          return;
        }
        res.status(403).json({ error: 'invite_email_mismatch' });
        return;
      }
      if (tokenDoc.status === 'failed' || tokenDoc.status === 'revoked') {
        res.status(404).json({ error: 'invite_not_found' });
        return;
      }
    }

    const pendingResult = tokenDoc ? null : await find<WaveParticipant & {
      _id: string;
      _rev: string;
      inviteTokenHash?: string;
      inviteExpiresAt?: number;
      email?: string;
    }>({ type: 'participant', inviteTokenHash: tokenHash }, { limit: 2 });
    let participant = tokenDoc
      ? await getDoc<WaveParticipant & { _id: string; _rev: string }>(tokenDoc.participantId).catch(() => null)
      : pendingResult?.docs?.[0];
    if (!participant) {
      const acceptedResult = tokenDoc ? { docs: [] as Array<WaveParticipant & { _id: string; _rev: string; acceptedInviteExpiresAt?: number }> } : await find<WaveParticipant & { _id: string; _rev: string; acceptedInviteExpiresAt?: number }>(
        { type: 'participant', acceptedInviteTokenHash: tokenHash },
        { limit: 2 },
      ).catch(() => ({ docs: [] as Array<WaveParticipant & { _id: string; _rev: string; acceptedInviteExpiresAt?: number }> }));
      const accepted = acceptedResult.docs?.[0];
      const sameAccount = accepted?.status === 'accepted'
        && accepted.userId === req.user!.id
        && participantEmail(accepted) === String(req.user?.email || '').trim().toLowerCase()
        && Number(accepted.acceptedInviteExpiresAt || 0) > Date.now();
      if (accepted && !sameAccount) {
        res.status(403).json({ error: 'invite_email_mismatch' });
        return;
      }
      if (sameAccount) {
        res.json({ id: accepted!._id, waveId: accepted!.waveId, role: accepted!.role, accepted: true, alreadyAccepted: true });
        return;
      }
      res.status(404).json({ error: 'invite_not_found' });
      return;
    }
    if (
      tokenDoc
      && participant.status === 'accepted'
      && participant.userId === req.user!.id
      && participantEmail(participant) === String(req.user?.email || '').trim().toLowerCase()
    ) {
      await updateDoc({ ...tokenDoc, status: 'used', usedAt: Date.now(), usedBy: req.user!.id } as any).catch(() => undefined);
      res.json({ id: participant._id, waveId: participant.waveId, role: participant.role, accepted: true, alreadyAccepted: true });
      return;
    }
    if (participant.status !== 'pending') {
      res.status(404).json({ error: 'invite_not_found' });
      return;
    }
    if (Number(tokenDoc?.expiresAt || participant.inviteExpiresAt || 0) <= Date.now()) {
      res.status(410).json({ error: 'invite_expired' });
      return;
    }
    const sessionEmail = String(req.user?.email || '').trim().toLowerCase();
    if (!sessionEmail || sessionEmail !== String(participant.email || '').trim().toLowerCase()) {
      res.status(403).json({ error: 'invite_email_mismatch' });
      return;
    }
    const now = Date.now();
    const originalExpiry = Number(tokenDoc?.expiresAt || participant.inviteExpiresAt || 0);
    const {
      inviteTokenHash: _usedInviteTokenHash,
      inviteExpiresAt: _usedInviteExpiresAt,
      ...participantWithoutToken
    } = participant;
    const next = {
      ...participantWithoutToken,
      userId: req.user!.id,
      status: 'accepted' as const,
      acceptedAt: now,
      acceptedInviteTokenHash: tokenHash,
      acceptedInviteExpiresAt: originalExpiry,
    };
    const duplicates = await participantDuplicates(participant.waveId, next);
    const canonicalCandidates = sortParticipantCandidates(
      [...duplicates.filter((candidate) => candidate._id !== participant!._id), next as any],
      req.user!.id,
    );
    const canonical = canonicalCandidates[0] as WaveParticipant & { _id: string; _rev?: string };
    const {
      inviteTokenHash: _canonicalInviteTokenHash,
      inviteExpiresAt: _canonicalInviteExpiresAt,
      ...canonicalWithoutActiveToken
    } = canonical;
    const canonicalNext = {
      ...canonicalWithoutActiveToken,
      userId: req.user!.id,
      email: participant.email,
      status: 'accepted' as const,
      acceptedAt: canonical.acceptedAt || now,
      acceptedInviteTokenHash: tokenHash,
      acceptedInviteExpiresAt: originalExpiry,
    };
    accessMutationWaveId = participant.waveId;
    const updated = await updateDoc(canonicalNext as any);
    for (const duplicate of canonicalCandidates.slice(1)) {
      await updateDoc({
        ...duplicate,
        status: 'declined',
        declinedAt: now,
        declinedBy: req.user!.id,
        inviteTokenHash: undefined,
        inviteExpiresAt: undefined,
        acceptedInviteTokenHash: undefined,
        acceptedInviteExpiresAt: undefined,
      } as any);
    }
    if (tokenDoc) {
      await updateDoc({ ...tokenDoc, status: 'used', usedAt: now, usedBy: req.user!.id } as any);
      const siblingTokens = await find<InvitationTokenDoc>({
        type: 'invitation_token',
        waveId: participant.waveId,
        email: participantEmail(participant),
      }, { limit: 500 }).catch(() => ({ docs: [] as InvitationTokenDoc[] }));
      for (const sibling of siblingTokens.docs || []) {
        if (sibling._id === tokenDoc._id || sibling.status === 'used' || sibling.status === 'revoked') continue;
        await updateDoc({ ...sibling, status: 'revoked', revokedAt: now } as any);
      }
    }
    await refreshWaveSocketAccess(participant.waveId);
    accessRefreshCompleted = true;
    res.json({
      id: updated.id,
      rev: updated.rev,
      waveId: participant.waveId,
      role: canonicalNext.role,
      accepted: true,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'invite_accept_error' });
  } finally {
    if (accessMutationWaveId && !accessRefreshCompleted) {
      await refreshWaveSocketAccess(accessMutationWaveId).catch((refreshError: any) => {
        console.error('[waves] invitation acceptance access refresh failed after mutation error', {
          waveId: accessMutationWaveId,
          error: refreshError?.message || String(refreshError),
        });
      });
    }
  }
});

// POST /api/waves/:id/participants — invite participants by email
router.post('/:id/participants', requireAuth, csrfProtect(), inviteRateLimit, async (req, res) => {
  const userId = req.user!.id;
  const waveId = String(req.params['id'] || '');
  const parsedInvite = z.object({
    emails: z.array(z.string().trim().email().max(320).transform((email) => email.toLowerCase())).min(1).max(20),
    message: z.string().max(2_000).optional(),
    role: z.enum(['editor', 'commenter', 'viewer']).default('editor'),
  }).safeParse(req.body || {});
  if (!parsedInvite.success) {
    res.status(400).json({ error: 'invalid_invite_request', issues: parsedInvite.error.issues });
    return;
  }
  const { emails, message, role } = parsedInvite.data;

  const access = await requireWaveAccess(req, res, waveId, 'manage');
  if (!access) return;

  const normalizedEmails = [...new Set(emails)];

  // Look up inviter info
  let inviterName = 'A Rizzoma user';
  let inviterEmail = '';
  try {
    const inviter = await getDoc<any>(userId);
    inviterName = inviter.name || inviter.email || inviterName;
    inviterEmail = inviter.email || '';
  } catch {}

  if (inviterEmail && normalizedEmails.includes(inviterEmail.trim().toLowerCase())) {
    res.status(400).json({ error: 'owner_already_participant' });
    return;
  }

  // Look up topic title from the wave doc
  let topicTitle = 'Untitled Topic';
  try {
    const wave = await getDoc<Wave>(waveId);
    topicTitle = wave.title || topicTitle;
  } catch {}

  let baseUrl: string;
  try {
    baseUrl = resolveInviteBaseUrl(req);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'invite_url_configuration_error' });
    return;
  }
  const now = Date.now();
  const results: { email: string; ok: boolean; error?: string; status: 'accepted' | 'pending' | 'delivery_failed' | 'error' }[] = [];

  for (const email of normalizedEmails) {
    try {
      // Find or reference user by email
      let targetUserId = `invite:${email}`;
      try {
        const userResult = await find<any>({ type: 'user', email }, { limit: 1 });
        if (userResult.docs?.[0]) {
          targetUserId = userResult.docs[0]._id;
        }
      } catch {}

      // Reuse a prior email-only invitation after it has been redeemed and its
      // userId changed. Keying only by the newly-resolved user id would create
      // a duplicate participant with competing role precedence.
      const participantCandidates = await find<WaveParticipant & { _id: string; _rev?: string }>(
        { type: 'participant', waveId },
        { limit: 500 },
      ).catch(() => ({ docs: [] as Array<WaveParticipant & { _id: string; _rev?: string }> }));
      const allMatchingParticipants = (participantCandidates.docs || []).filter((candidate) => (
        candidate.userId === targetUserId || String(candidate.email || '').trim().toLowerCase() === email
      ));
      if (allMatchingParticipants.some((candidate) => candidate.role === 'owner')) {
        results.push({ email, ok: false, error: 'owner_already_participant', status: 'error' });
        continue;
      }
      const matchingParticipants = sortParticipantCandidates(
        allMatchingParticipants.filter((candidate) => candidate.role !== 'owner'),
        targetUserId,
      );
      const reusableParticipant = matchingParticipants[0];
      const participantId = reusableParticipant?._id || `participant:wave:${waveId}:user:${targetUserId}`;
      if (reusableParticipant?.status === 'accepted') {
        results.push({ email, ok: true, status: 'accepted' });
        continue;
      }
      const invite = createInviteToken(now);
      const alreadyExists = Boolean(reusableParticipant);

      const nextParticipant = !alreadyExists
        ? {
          _id: participantId,
          type: 'participant',
          waveId,
          userId: targetUserId,
          email,
          role,
          invitedBy: userId,
          invitedAt: now,
          status: 'pending' as const,
          inviteTokenHash: invite.tokenHash,
          inviteExpiresAt: invite.expiresAt,
        }
        : {
            ...reusableParticipant!,
            userId: targetUserId,
            email,
            role,
            status: 'pending' as const,
            acceptedAt: undefined,
            inviteTokenHash: invite.tokenHash,
            inviteExpiresAt: invite.expiresAt,
          };

      // Persist a non-authorizing pending participant plus a token outbox doc
      // before SMTP. If mail succeeds but the final status write fails, the
      // delivered token is still redeemable; older token docs remain valid
      // until one is consumed or the participant is revoked.
      if (alreadyExists) await updateDoc(nextParticipant as any);
      else await insertDoc(nextParticipant as WaveParticipant);
      const tokenDoc: InvitationTokenDoc = {
        _id: invitationTokenDocId(invite.tokenHash),
        type: 'invitation_token',
        tokenHash: invite.tokenHash,
        participantId,
        waveId,
        email,
        status: 'pending_delivery',
        createdAt: now,
        expiresAt: invite.expiresAt,
      };
      const tokenInsert = await insertDoc(tokenDoc as any);
      tokenDoc._rev = tokenInsert.rev;
      for (const duplicate of matchingParticipants.slice(1)) {
        await updateDoc({
          ...duplicate,
          status: 'declined',
          declinedAt: now,
          declinedBy: userId,
          inviteTokenHash: undefined,
          inviteExpiresAt: undefined,
          acceptedInviteTokenHash: undefined,
          acceptedInviteExpiresAt: undefined,
        } as any);
      }

      const inviteUrl = buildInviteUrl(baseUrl, waveId, invite.token);
      const emailResult = await sendInviteEmail({
        inviterName,
        inviterEmail,
        topicTitle,
        topicUrl: inviteUrl,
        recipientEmail: email,
        message: message || undefined,
      });
      if (!emailResult.success) {
        await updateDoc({ ...tokenDoc, status: 'failed', failedAt: Date.now() } as any).catch(() => undefined);
        results.push({ email, ok: false, error: emailResult.error, status: 'delivery_failed' });
        continue;
      }
      await updateDoc({ ...tokenDoc, status: 'sent', deliveredAt: Date.now() } as any).catch(() => undefined);

      results.push({ email, ok: true, status: 'pending' });
    } catch (err: any) {
      console.error('[waves] invite participant failed', { email, error: err.message });
      results.push({ email, ok: false, error: err.message, status: 'error' });
    }
  }

  await refreshWaveSocketAccess(waveId);
  res.json({ ok: true, invited: results });
});

export default router;

// Dev-only materialization endpoints
if (process.env['NODE_ENV'] !== 'production') {
  // POST /api/waves/materialize/:id — create minimal wave doc if missing (title + createdAt)
  router.post('/materialize/:id', csrfProtect(), async (req, res) => {
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
  router.post('/materialize', csrfProtect(), async (req, res) => {
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

  // POST /api/waves/seed_sample?depth=2&breadth=2 — create a demo wave with nested blips (dev only)
  router.post('/seed_sample', csrfProtect(), async (req, res) => {
    try {
      const depth = Math.min(Math.max(parseInt(String((req.query as any).depth ?? '2'), 10) || 2, 1), 5);
      const breadth = Math.min(Math.max(parseInt(String((req.query as any).breadth ?? '2'), 10) || 2, 1), 5);
      const now = Date.now();
      const wid = `demo:${now}`;
      const wave: Wave = { _id: wid, type: 'wave', title: `Demo Wave ${new Date(now).toLocaleString()}`, createdAt: now, updatedAt: now };
      await insertDoc(wave as any);
      // generate nested blips
      type Node = { id: string, parentId: string | null, level: number };
      const nodes: Node[] = [];
      const rootId = `${wid}:b1`;
      nodes.push({ id: rootId, parentId: null, level: 1 });
      let counter = 1;
      const makeChildren = (parent: Node, level: number) => {
        if (level > depth) return;
        for (let i = 0; i < breadth; i++) {
          counter += 1;
          const id = `${wid}:b${counter}`;
          nodes.push({ id, parentId: parent.id, level });
          makeChildren({ id, parentId: parent.id, level: level + 1 }, level + 1);
        }
      };
      makeChildren(nodes[0]!, 2);
      let ts = now;
      for (const n of nodes) {
        ts += 5;
        const blip: Blip = { _id: n.id, type: 'blip', waveId: wid, parentId: n.parentId, content: `Demo content ${n.id}`, createdAt: ts, updatedAt: ts } as any;
        await insertDoc(blip as any);
      }
      res.status(201).json({ ok: true, id: wid, blips: nodes.length });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'seed_error', requestId: (req as any)?.id });
    }
  });
}
