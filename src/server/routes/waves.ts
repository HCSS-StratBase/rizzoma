import { Router } from 'express';
import { createIndex, find, findOne, getDoc, insertDoc, updateDoc, view } from '../lib/couch.js';
import { emitEvent } from '../lib/socket.js';
import type { Blip, Wave, BlipRead, WaveParticipant } from '../schemas/wave.js';
import { computeWaveUnreadCounts, invalidateUnreadCache } from '../lib/unread.js';
import { sendInviteEmail } from '../services/email.js';
import { csrfProtect } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/auth.js';

// User type for lookups
type User = {
  _id?: string;
  type: 'user';
  email: string;
  name?: string | null;
  avatar?: string;
  createdAt?: number;
  updatedAt?: number;
};

const router = Router();
type FlatBlip = { id: string; updatedAt: number; createdAt?: number; content?: string; children?: FlatBlip[] };

// In-memory cache for unread endpoint (TTL: 10 seconds)
const unreadEndpointCache = new Map<string, { data: any; expires: number }>();
const UNREAD_CACHE_TTL_MS = 10000;
const DEBUG_UNREAD = process.env['RIZZOMA_DEBUG_UNREAD'] === '1';

function logUnread(...args: any[]): void {
  if (DEBUG_UNREAD) {
    // eslint-disable-next-line no-console
    console.log('[waves]', ...args);
  }
}

function getUnreadCacheKey(userId: string, waveId: string): string {
  return `${userId}:${waveId}`;
}

function cleanUnreadCache(): void {
  const now = Date.now();
  for (const [key, entry] of unreadEndpointCache.entries()) {
    if (entry.expires < now) unreadEndpointCache.delete(key);
  }
}

export function invalidateWaveUnreadCache(userId: string, waveId?: string): void {
  if (waveId) {
    unreadEndpointCache.delete(getUnreadCacheKey(userId, waveId));
  } else {
    const prefix = `${userId}:`;
    for (const key of unreadEndpointCache.keys()) {
      if (key.startsWith(prefix)) unreadEndpointCache.delete(key);
    }
  }
}

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

// GET /api/waves/unread_counts?ids=w1,w2,... — per-wave unread/total for current user
router.get('/unread_counts', async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  try {
    const idsParam = String((req.query as any).ids || '').trim();
    const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200) : [];
    const counts = await computeWaveUnreadCounts(userId, ids);
    const results = ids.map((waveId) => {
      const entry = counts[waveId] || { total: 0, unread: 0, read: 0 };
      return { waveId, total: entry.total, unread: entry.unread, read: entry.read };
    });
    res.json({ counts: results });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'unread_counts_error', requestId: (req as any)?.id });
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
    const r = await find<Blip>(
      { type: 'blip', waveId: id },
      { limit: 20000, sort: [{ createdAt: 'asc' }] },
    ).catch(async () => {
      return find<Blip>({ type: 'blip', waveId: id }, { limit: 20000 });
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
    const toNode = (b: Blip): FlatBlip => ({
      id: (b as any)._id,
      content: (b as any).content || '',
      createdAt: (b as any).createdAt,
      updatedAt: (b as any).updatedAt || (b as any).createdAt || 0,
      children: (byParent.get(((b as any)._id) || '') || []).map(toNode),
    } as any);
    const roots = (byParent.get(null) || []).concat(byParent.get(undefined as any) || []).map(toNode);
    const title = wave?.title || `(legacy) wave ${id.slice(0, 6)}`;
    const createdAt = wave?.createdAt || (blips[0]?.createdAt || Date.now());
    res.json({ id, title, createdAt, blips: roots });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'wave_error', requestId: (req as any)?.id });
  }
});

// PATCH /api/waves/:id — update wave properties (title, etc.)
router.patch('/:id', async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params.id;
  try {
    const wave = await getDoc<Wave & { _rev?: string }>(id);
    if (!wave) {
      res.status(404).json({ error: 'wave_not_found', requestId: (req as any)?.id });
      return;
    }
    const body = req.body || {};
    const updates: Partial<Wave> = {};
    if (typeof body.title === 'string') {
      updates.title = body.title.trim() || wave.title;
    }
    if (Object.keys(updates).length === 0) {
      res.json({ ok: true, id, title: wave.title });
      return;
    }
    const now = Date.now();
    const updated = { ...wave, ...updates, updatedAt: now };
    const r = await updateDoc(updated as any);
    emitEvent('wave:updated', { waveId: id, userId, title: updated.title });
    res.json({ ok: true, id: r.id, rev: r.rev, title: updated.title, updatedAt: now });
  } catch (e: any) {
    if (String(e?.message || '').startsWith('404')) {
      res.status(404).json({ error: 'wave_not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'wave_update_error', requestId: (req as any)?.id });
  }
});

// POST /api/waves/:id/participants — invite participants by email
router.post('/:id/participants', csrfProtect(), requireAuth, async (req, res) => {
  const userId = req.user!['id'] as string;
  const waveId = req.params['id'] as string;
  const { emails, message } = req.body || {};

  if (!Array.isArray(emails) || emails.length === 0) {
    res.status(400).json({ error: 'emails_required', requestId: (req as any)?.id });
    return;
  }

  // Validate email format
  const validEmails = emails
    .map((e: string) => String(e).trim().toLowerCase())
    .filter((e: string) => e.length > 0 && e.includes('@'));

  if (validEmails.length === 0) {
    res.status(400).json({ error: 'invalid_emails', requestId: (req as any)?.id });
    return;
  }

  try {
    // Get the wave to verify it exists and get title
    let wave: Wave | null = null;
    try {
      wave = await getDoc<Wave>(waveId);
    } catch (e: any) {
      if (String(e?.message || '').startsWith('404')) {
        res.status(404).json({ error: 'wave_not_found', requestId: (req as any)?.id });
        return;
      }
      throw e;
    }

    // Get inviter info
    const inviterUser = await getDoc<User>(userId).catch(() => null);
    const inviterName = inviterUser?.name || inviterUser?.email?.split('@')[0] || 'Someone';
    const inviterEmail = inviterUser?.email || '';

    const results: Array<{ email: string; status: 'invited' | 'exists' | 'failed'; userId?: string; error?: string }> = [];
    const baseUrl = process.env['APP_BASE_URL'] || `${req.protocol}://${req.headers.host}`;
    const topicUrl = `${baseUrl}/#/topic/${waveId}`;

    // Ensure participant index exists
    await createIndex(['type', 'waveId', 'email'], 'idx_participant_wave_email').catch(() => undefined);

    for (const email of validEmails) {
      try {
        // Check if already a participant
        const existingParticipant = await findOne<WaveParticipant>({
          type: 'participant',
          waveId,
          email
        }).catch(() => null);

        if (existingParticipant) {
          results.push({ email, status: 'exists', userId: existingParticipant.userId });
          continue;
        }

        // Find or create user
        let user = await findOne<User>({ type: 'user', email }).catch(() => null);
        let newUser = false;

        if (!user) {
          // Create placeholder user
          const now = Date.now();
          const newUserDoc: User = {
            type: 'user',
            email,
            name: email.split('@')[0], // Use email prefix as default name
            createdAt: now,
            updatedAt: now,
          };
          const r = await insertDoc(newUserDoc as any);
          user = { ...newUserDoc, _id: r.id };
          newUser = true;
        }

        // Create participant record
        const now = Date.now();
        const participantId = `participant:wave:${waveId}:user:${user._id}`;
        const participant: WaveParticipant = {
          _id: participantId,
          type: 'participant',
          waveId,
          userId: user._id!,
          email,
          role: 'editor',
          invitedBy: userId,
          invitedAt: now,
          status: newUser ? 'pending' : 'accepted', // Existing users auto-accept
          acceptedAt: newUser ? undefined : now,
        };
        await insertDoc(participant as any);

        // Send invite email
        const emailResult = await sendInviteEmail({
          inviterName,
          inviterEmail,
          topicTitle: wave?.title || 'Untitled Topic',
          topicUrl,
          recipientEmail: email,
          recipientName: user.name || undefined,
          message: message || undefined,
        });

        if (emailResult.success) {
          results.push({ email, status: 'invited', userId: user._id });
        } else {
          // Participant created but email failed
          console.warn('[waves] invite email failed', { email, error: emailResult.error });
          results.push({ email, status: 'invited', userId: user._id });
        }

        // Emit event
        emitEvent('wave:participant:added', { waveId, userId: user._id, email, invitedBy: userId });
      } catch (err: any) {
        console.error('[waves] invite participant error', { email, error: err?.message });
        results.push({ email, status: 'failed', error: err?.message });
      }
    }

    const invited = results.filter(r => r.status === 'invited').length;
    const existing = results.filter(r => r.status === 'exists').length;
    const failed = results.filter(r => r.status === 'failed').length;

    res.json({
      ok: true,
      invited,
      existing,
      failed,
      results
    });
  } catch (e: any) {
    console.error('[waves] participants error', { waveId, error: e?.message });
    res.status(500).json({ error: e?.message || 'invite_error', requestId: (req as any)?.id });
  }
});

// GET /api/waves/:id/participants — list participants
router.get('/:id/participants', async (req, res) => {
  const waveId = req.params['id'] as string;
  try {
    await createIndex(['type', 'waveId'], 'idx_participant_wave').catch(() => undefined);
    const r = await find<WaveParticipant>({ type: 'participant', waveId }, { limit: 1000 });

    const participants = (r.docs || []).map(p => ({
      id: p._id,
      userId: p.userId,
      email: p.email,
      role: p.role,
      status: p.status,
      invitedAt: p.invitedAt,
      acceptedAt: p.acceptedAt,
    }));

    res.json({ participants });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'participants_error', requestId: (req as any)?.id });
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
router.get('/:id/unread', async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params.id;

  // Check cache first
  cleanUnreadCache();
  const cacheKey = getUnreadCacheKey(userId, id);
  const cached = unreadEndpointCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.json(cached.data);
    return;
  }

  try {
    // Fetch blips directly instead of making HTTP call to self
    await createIndex(['type', 'waveId', 'createdAt'], 'idx_blip_wave_createdAt').catch(() => undefined);
    const blipResp = await find<Blip>(
      { type: 'blip', waveId: id },
      { limit: 10000, sort: [{ createdAt: 'asc' }] },
    ).catch(async () => {
      return find<Blip>({ type: 'blip', waveId: id }, { limit: 10000 });
    });

    // Build flat list of blips with timestamps
    const blipDocs = (blipResp.docs || []).map((b) => ({
      id: String((b as any)._id || ''),
      updatedAt: Number((b as any).updatedAt || (b as any).createdAt || 0),
    }));

    // Get read records
    await createIndex(['type', 'userId', 'waveId'], 'idx_read_user_wave').catch(() => undefined);
    const r = await find<BlipRead>({ type: 'read', userId, waveId: id }, { limit: 10000 });
    const readMap = new Map<string, number>();
    (r.docs || []).forEach((d) => readMap.set(String(d.blipId), Number((d as any).readAt || 0)));

    const unreadEntries = blipDocs.filter((entry) => entry.updatedAt > (readMap.get(entry.id) || 0));
    const result = { unread: unreadEntries.map((e) => e.id), total: blipDocs.length, read: blipDocs.length - unreadEntries.length };

    // Cache the result
    unreadEndpointCache.set(cacheKey, { data: result, expires: Date.now() + UNREAD_CACHE_TTL_MS });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'unread_error', requestId: (req as any)?.id });
  }
});

// GET /api/waves/:id/next?after=blipId — next unread blip id
router.get('/:id/next', async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params.id;
  const after = String((req.query as any).after || '');
  try {
    const waveResp = await fetch(`${req.protocol}://${req.headers.host}/api/waves/${encodeURIComponent(id)}`);
    const waveData: any = await waveResp.json();
    const order = flattenBlips((waveData.blips || []) as FlatBlip[]);
    await createIndex(['type', 'userId', 'waveId'], 'idx_read_user_wave').catch(() => undefined);
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
router.get('/:id/prev', async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params.id;
  const before = String((req.query as any).before || '');
  try {
    const waveResp = await fetch(`${req.protocol}://${req.headers.host}/api/waves/${encodeURIComponent(id)}`);
    const waveData: any = await waveResp.json();
    const order = flattenBlips((waveData.blips || []) as FlatBlip[]);
    await createIndex(['type', 'userId', 'waveId'], 'idx_read_user_wave').catch(() => undefined);
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
router.post('/:waveId/blips/:blipId/read', async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const waveId = req.params.waveId;
  const blipId = req.params.blipId;
  try {
    try { logUnread('mark one read', { waveId, blipId, userId }); } catch {}
    const keyId = `read:user:${userId}:wave:${waveId}:blip:${blipId}`;
      const now = Date.now();
      const existing = await findOne<BlipRead & { _rev?: string }>({ type: 'read', userId, waveId, blipId }).catch(() => null);
      if (existing && existing._id && existing._rev) {
        const r = await updateDoc({ ...existing, readAt: now } as any);
        try { logUnread('emit wave:unread (single)', { waveId, blipId, userId }); emitEvent('blip:read', { waveId, blipId, userId, readAt: now }); emitEvent('wave:unread', { waveId, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); }
        invalidateUnreadCache(userId);
        invalidateWaveUnreadCache(userId, waveId);
        res.json({ ok: true, id: r.id, rev: r.rev, readAt: now });
        return;
      }
      const doc: BlipRead = { _id: keyId, type: 'read', userId, waveId, blipId, readAt: now };
      const r = await insertDoc(doc as any);
      try { logUnread('emit wave:unread (single insert)', { waveId, blipId, userId }); emitEvent('blip:read', { waveId, blipId, userId, readAt: now }); emitEvent('wave:unread', { waveId, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); }
      invalidateUnreadCache(userId);
      invalidateWaveUnreadCache(userId, waveId);
      res.status(201).json({ ok: true, id: r.id, rev: r.rev, readAt: now });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'read_mark_error', requestId: (req as any)?.id });
    }
  });

// POST /api/waves/:id/read — mark multiple blips as read { blipIds: [] }
router.post('/:id/read', async (req, res) => {
  // @ts-ignore
  const userId = req.session?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: 'unauthenticated', requestId: (req as any)?.id }); return; }
  const id = req.params.id;
  const blipIds = Array.isArray((req.body || {}).blipIds) ? (req.body as any).blipIds.map((s: any) => String(s)) : [];
  const results: Array<{ id: string; ok: boolean }> = [];
   try { logUnread('mark many read', { waveId: id, count: blipIds.length, userId }); } catch {}
  for (const bid of blipIds) {
    try {
      const keyId = `read:user:${userId}:wave:${id}:blip:${bid}`;
      const now = Date.now();
      const existing = await findOne<BlipRead & { _rev?: string }>({ type: 'read', userId, waveId: id, blipId: bid }).catch(() => null);
      if (existing && existing._id && existing._rev) {
        const r = await updateDoc({ ...existing, readAt: now } as any);
        if (r?.ok) { results.push({ id: bid, ok: true }); try { logUnread('emit wave:unread (bulk update)', { waveId: id, blipId: bid, userId }); emitEvent('blip:read', { waveId: id, blipId: bid, userId, readAt: now }); emitEvent('wave:unread', { waveId: id, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); } }
        else results.push({ id: bid, ok: false });
        continue;
      }
      const r = await insertDoc({ _id: keyId, type: 'read', userId, waveId: id, blipId: bid, readAt: now } as any);
      if (r?.ok) { results.push({ id: bid, ok: true }); try { logUnread('emit wave:unread (bulk insert)', { waveId: id, blipId: bid, userId }); emitEvent('blip:read', { waveId: id, blipId: bid, userId, readAt: now }); emitEvent('wave:unread', { waveId: id, userId }); } catch (e) { console.error('[waves] emit wave:unread failed', e); } } else results.push({ id: bid, ok: false });
    } catch {
      results.push({ id: bid, ok: false });
    }
  }
  // Invalidate unread cache so next topics list fetch gets fresh counts
  invalidateUnreadCache(userId);
  invalidateWaveUnreadCache(userId, id);
  res.json({ ok: true, count: results.length, results });
});

export default router;

// Dev-only materialization endpoints
if (process.env['NODE_ENV'] !== 'production') {
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

  // POST /api/waves/seed_sample?depth=2&breadth=2 — create a demo wave with nested blips (dev only)
  router.post('/seed_sample', async (req, res) => {
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
