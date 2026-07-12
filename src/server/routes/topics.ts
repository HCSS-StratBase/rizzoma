import { Router } from 'express';
import { deleteDoc, find, findOne, getDoc, insertDoc, updateDoc, view } from '../lib/couch.js';
import { disconnectWaveSockets, emitEvent } from '../lib/socket.js';
import { csrfProtect } from '../middleware/csrf.js';
import { noStore } from '../middleware/noStore.js';
import { requireAuth } from '../middleware/auth.js';
import { CreateTopicSchema, UpdateTopicSchema } from '../schemas/topic.js';
import { stampInitialAttribution, diffAndStampAttribution } from '../lib/sectionAttribution.js';
import { computeWaveUnreadCounts } from '../lib/unread.js';
import { sendInviteEmail } from '../services/email.js';
import type { WaveParticipant } from '../schemas/wave.js';
import {
  buildAccessibleTopicSelector,
  identityFromRequest,
  normalizeSharingPolicy,
  requireWaveAccess,
} from '../lib/access.js';
import { buildInviteUrl, createInviteToken, invitationTokenDocId, resolveInviteBaseUrl } from '../lib/invitations.js';
import { inviteRateLimit } from '../middleware/inviteRateLimit.js';

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

// Schemas moved to ../schemas/topic

type SectionAttributionEntry = {
  authorId: string;
  updatedAt: number;
};

type Topic = {
  _id?: string;
  type: 'topic';
  title: string;
  content?: string;
  authorId?: string;
  createdAt: number; // epoch millis
  updatedAt: number; // epoch millis
  sectionAttribution?: Record<string, SectionAttributionEntry>;
  shareLevel?: 'private' | 'link' | 'public';
  allowComments?: boolean;
  allowEdits?: boolean;
};

async function loadLiveTopic(id: string): Promise<Topic & { _id: string; _rev?: string }> {
  const doc = await getDoc<unknown>(id) as Partial<Topic> & { _rev?: unknown; deleted?: unknown } | null;
  if (doc?.type === 'topic_tombstone' || doc?.deleted === true) throw new Error('410 topic_deleted');
  if (
    !doc
    || doc.type !== 'topic'
    || typeof doc._id !== 'string'
    || typeof doc.title !== 'string'
    || typeof doc.createdAt !== 'number'
    || typeof doc.updatedAt !== 'number'
  ) {
    throw new Error('404 not_a_topic');
  }
  return doc as Topic & { _id: string; _rev?: string };
}

function respondTopicLookupFailure(error: unknown, res: any, requestId?: string): boolean {
  const message = String((error as any)?.message || '');
  if (message.startsWith('404')) {
    res.status(404).json({ error: 'not_found', requestId });
    return true;
  }
  if (message.startsWith('410')) {
    res.status(410).json({ error: 'topic_deleted', requestId });
    return true;
  }
  return false;
}

type TopicTombstone = Omit<Topic, 'type'> & {
  type: 'topic_tombstone';
  _id: string;
  _rev: string;
  deleted: true;
  deletedAt: number;
  deletedBy: string;
};

async function cascadeDeletedTopicBlips(topicId: string, userId: string, deletedAt: number): Promise<number> {
  const result = await find<any>({ type: 'blip', waveId: topicId }, { limit: 20000 });
  let updated = 0;
  for (const blip of result.docs || []) {
    if (!blip?._id || blip.deleted) continue;
    await updateDoc({
      ...blip,
      deleted: true,
      deletedAt,
      deletedBy: userId,
      updatedAt: Math.max(Number(blip.updatedAt || 0), deletedAt),
    });
    updated += 1;
  }
  return updated;
}

type TopicFollow = {
  _id?: string;
  type: 'topic_follow';
  userId: string;
  topicId: string;
  createdAt: number;
  updatedAt: number;
};

type TopicListItem = {
  id: string | undefined;
  title: string;
  content?: string;
  authorId?: string;
  createdAt: number;
  updatedAt?: number;
};

const MAX_SNIPPET_LENGTH = 140;
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildSnippet(content?: string): string | undefined {
  if (!content) return undefined;
  const text = stripHtml(String(content));
  if (!text) return undefined;
  return text.length > MAX_SNIPPET_LENGTH ? `${text.slice(0, MAX_SNIPPET_LENGTH)}…` : text;
}

// GET /api/topics?limit=20
router.get('/', noStore, async (req, res): Promise<void> => {
  // no-store is required: this response embeds per-user unreadCount /
  // totalCount fields that can change without the underlying topic
  // documents changing, and Express's weak ETag would otherwise cause
  // 304 replay of a stale cached body. See middleware/noStore.ts and
  // the BUG #56 write-up (2026-04-15) for the full story.
  const limit = Math.min(Math.max(parseInt(String((req.query as any).limit ?? '20'), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String((req.query as any).offset ?? '0'), 10) || 0, 0);
  const bookmark = String((req.query as any).bookmark || '').trim() || undefined;
  const myOnly = String((req.query as any).my ?? '0') === '1';
  const q = String((req.query as any).q ?? '').trim().toLowerCase();
  const sortTopics = (list: TopicListItem[]) =>
    list
      .slice()
      .sort((a, b) => {
        const aTime = a.updatedAt ?? a.createdAt ?? 0;
        const bTime = b.updatedAt ?? b.createdAt ?? 0;
        return bTime - aTime;
      });

  const respondWithUnread = async (
    list: TopicListItem[],
    more: boolean,
    bookmarkValue?: string,
  ) => {
    let enriched = sortTopics(list);
    const userId = (req as any).session?.userId as string | undefined;
    const ids = enriched.map((t) => t.id).filter(Boolean) as string[];
    const authorIds = Array.from(new Set(enriched.map((t) => t.authorId).filter(Boolean))) as string[];

    // Run unread counts, author lookups, and follow query in parallel
    const [counts, authorMap, followedTopics] = await Promise.all([
      // Unread counts (batched: 2 CouchDB queries instead of 2*N)
      userId && ids.length > 0
        ? computeWaveUnreadCounts(userId, ids)
        : Promise.resolve({} as Record<string, { unread: number; total: number }>),
      // Author lookups (parallel)
      (async () => {
        const map = new Map<string, User>();
        await Promise.all(authorIds.map(async (authorId) => {
          try {
            const user = await getDoc<User>(authorId);
            if (user && user.type === 'user') map.set(authorId, user);
          } catch { /* ignore */ }
        }));
        return map;
      })(),
      // Follow status (uses idx_topic_follow_user_topic index)
      (async () => {
        if (!userId) return new Set<string>();
        try {
          const r = await find<TopicFollow>({ type: 'topic_follow', userId }, { limit: 1000, sort: [{ type: 'asc' }, { userId: 'asc' }, { topicId: 'asc' }], use_index: 'idx_topic_follow_user_topic' });
          return new Set((r.docs || []).map((doc) => doc.topicId));
        } catch {
          return new Set<string>();
        }
      })(),
    ]);

    if (userId && ids.length > 0) {
      enriched = enriched.map((topic) => {
        const entry = topic.id ? counts[topic.id] : undefined;
        return entry ? { ...topic, unreadCount: entry.unread, totalCount: entry.total } : topic;
      });
    }

    const response = enriched.map((topic) => {
      const author = topic.authorId ? authorMap.get(topic.authorId) : undefined;
      return {
        ...topic,
        snippet: buildSnippet(topic.content),
        authorName: author?.name ?? undefined,
        authorAvatar: author?.avatar ?? undefined,
        isFollowed: userId && topic.id ? followedTopics.has(topic.id) : undefined,
      };
    });

    res.json({ topics: response, hasMore: more, nextBookmark: bookmarkValue });
  };

  try {
    // Prefer modern topics docs via Mango query; create minimal index for sort
    const identity = identityFromRequest(req);
    const selector: any = await buildAccessibleTopicSelector(identity, myOnly);

    let topics: Array<{ id: string | undefined; title: string; createdAt: number; updatedAt?: number }> = [];
    let hasMore = false;

    if (q) {
      // Server-side search: use Mango regex on title/content + createdAt sort for stable paging
      const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const qRe = `(?i).*${escapeRe(q)}.*`;
      const searchSelector: any = {
        ...selector,
        $or: [
          { title: { $regex: qRe } },
          { content: { $regex: qRe } },
        ],
      };
      try {
        const r = await find<Topic>(searchSelector, { limit: limit + 1, skip: offset, sort: [{ type: 'desc' }, { updatedAt: 'desc' }], use_index: 'idx_topic_updatedAt_desc', bookmark });
        const window = r.docs || [];
        topics = window.slice(0, limit).map((d) => ({
          id: String(d._id ?? ''),
          title: d.title,
          content: d.content,
          authorId: d.authorId,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }));
        hasMore = window.length > limit;
        await respondWithUnread(topics, hasMore, r.bookmark);
        return;
      } catch {
        const r = await find<Topic>(searchSelector, { limit: limit + 1, skip: offset, bookmark });
        const window = r.docs || [];
        topics = window.slice(0, limit).map((d) => ({
          id: String(d._id ?? ''),
          title: d.title,
          content: d.content,
          authorId: d.authorId,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        }));
        hasMore = window.length > limit;
        await respondWithUnread(topics, hasMore, r.bookmark);
        return;
      }
    } else {
      // No search term: efficient paging using skip/limit
      let r: { docs: Topic[]; bookmark?: string };
      try {
        r = await find<Topic>(selector, { limit: limit + 1, skip: offset, sort: [{ type: 'desc' }, { updatedAt: 'desc' }], use_index: 'idx_topic_updatedAt_desc', bookmark });
      } catch {
        r = await find<Topic>(selector, { limit: limit + 1, skip: offset, bookmark });
      }
      const window = r.docs || [];
      topics = window.slice(0, limit).map((d) => ({
        id: String(d._id ?? ''),
        title: d.title,
        content: d.content,
        authorId: d.authorId,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
      hasMore = window.length > limit;
      await respondWithUnread(topics, hasMore, r.bookmark);
      return;
    }

    if (topics.length === 0 && !myOnly && !q) {
      const legacy = await view('waves_by_creation_date', 'get', { descending: true, limit });
      // Project legacy waves into a minimal topic-like shape so the client can render a list
      topics = legacy.rows.map((r) => ({ id: `legacy:${r.value}`, title: '(legacy) wave', createdAt: r.key }));
      await respondWithUnread(topics, false);
      return;
    }
    await respondWithUnread(topics, hasMore);
    return;
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'couch_error', requestId: (req as any)?.id });
    return;
  }
});

// POST /api/topics
router.post('/', requireAuth, csrfProtect(), inviteRateLimit, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const parsed = CreateTopicSchema.parse(req.body ?? {});
    const participantEmails = [...new Set<string>(parsed.participants || [])];
    const ownerEmail = String(req.user?.email || '').trim().toLowerCase();
    if (ownerEmail && participantEmails.includes(ownerEmail)) {
      res.status(400).json({ error: 'owner_already_participant' });
      return;
    }
    const now = Date.now();
    // Seed initial sectionAttribution so a freshly-created topic
    // already has per-block author entries. First edit after create
    // will diff against this and only re-stamp changed blocks.
    const initialAttribution = parsed.content
      ? stampInitialAttribution({ html: parsed.content, authorId: userId, now })
      : {};
    const doc: Topic = {
      type: 'topic',
      title: parsed.title,
      content: parsed.content,
      authorId: userId,
      shareLevel: 'private',
      allowComments: false,
      allowEdits: false,
      createdAt: now,
      updatedAt: now,
      sectionAttribution: initialAttribution,
    };
    const r = await insertDoc(doc);
    const topicId = r.id;

    // Every topic has an explicit owner participant, even when the creator
    // did not invite anyone during creation. Authorization must not depend on
    // whether the optional participants input happened to be non-empty.
    const ownerParticipantId = `participant:wave:${topicId}:user:${userId}`;
    const ownerParticipant: WaveParticipant = {
      _id: ownerParticipantId,
      type: 'participant',
      waveId: topicId,
      userId,
      email: req.user?.email || '',
      role: 'owner',
      invitedAt: now,
      acceptedAt: now,
      status: 'accepted',
    };
    await insertDoc(ownerParticipant as any).catch(() => undefined);

    let invitedCount = 0;
    if (participantEmails.length > 0) {
      // Get inviter info
      const inviterUser = await findOne<User>({ type: 'user', _id: userId }).catch(() => null)
        || await getDoc<User>(userId).catch(() => null);
      const inviterName = inviterUser?.name || inviterUser?.email?.split('@')[0] || 'Someone';
      const inviterEmail = inviterUser?.email || '';

      const baseUrl = resolveInviteBaseUrl(req);
      // Invite each participant
      for (const email of participantEmails) {
        try {
          // Resolve an existing account when possible. Do not create a
          // credential-less `type:user` placeholder: that used to block the
          // invitee's later registration with `email_in_use`.
          const user = await findOne<User>({ type: 'user', email }).catch(() => null);
          const targetUserId = user?._id || `invite:${email}`;
          const invite = createInviteToken(now);
          const topicUrl = buildInviteUrl(baseUrl, topicId, invite.token);

          // Create participant record
          const participantId = `participant:wave:${topicId}:user:${targetUserId}`;
          const participant: WaveParticipant = {
            _id: participantId,
            type: 'participant',
            waveId: topicId,
            userId: targetUserId,
            email,
            role: 'editor',
            invitedBy: userId,
            invitedAt: now,
            status: 'pending',
            inviteTokenHash: invite.tokenHash,
            inviteExpiresAt: invite.expiresAt,
          };

          await insertDoc(participant as any);
          const tokenDoc: any = {
            _id: invitationTokenDocId(invite.tokenHash),
            type: 'invitation_token',
            tokenHash: invite.tokenHash,
            participantId,
            waveId: topicId,
            email,
            status: 'pending_delivery',
            createdAt: now,
            expiresAt: invite.expiresAt,
          };
          const tokenInsert = await insertDoc(tokenDoc);
          tokenDoc._rev = tokenInsert.rev;

          const delivery = await sendInviteEmail({
            inviterName,
            inviterEmail,
            topicTitle: doc.title,
            topicUrl,
            recipientEmail: email,
            recipientName: user?.name || undefined,
          }).catch((err) => ({ success: false, error: err?.message }));
          if (!delivery.success) {
            await updateDoc({ ...tokenDoc, status: 'failed', failedAt: Date.now() } as any).catch(() => undefined);
            console.warn('[topics] invite email failed', { email, error: delivery.error });
            continue;
          }
          await updateDoc({ ...tokenDoc, status: 'sent', deliveredAt: Date.now() } as any).catch(() => undefined);

          invitedCount++;
        } catch (err: any) {
          console.error('[topics] invite participant error', { email, error: err?.message });
        }
      }
    }

    res.status(201).json({ id: topicId, rev: r.rev, participantsInvited: invitedCount });
    try { emitEvent('topic:created', { id: topicId, title: doc.title, createdAt: doc.createdAt }); } catch {}
    return;
  } catch (e: any) {
    if (e?.issues) {
      res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'couch_error', requestId: (req as any)?.id });
    return;
  }
});

// GET /api/topics/:id
router.get('/:id', async (req, res): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const doc = await loadLiveTopic(id);
    const access = await requireWaveAccess(req, res, id, 'read', doc);
    if (!access) return;
    let authorName: string | undefined;
    let authorAvatar: string | undefined;
    if (doc.authorId) {
      try {
        const author = await getDoc<User>(doc.authorId);
        if (author && author.type === 'user') {
          authorName = author.name || (author.email ? author.email.split('@')[0] : undefined);
          authorAvatar = author.avatar ?? undefined;
        }
      } catch { /* ignore */ }
    }
    // Hydrate section attribution with per-authorId name lookups so the
    // client can render each block badge without N round-trips.
    let sectionAttributionHydrated:
      | Record<string, { authorId: string; authorName?: string; authorAvatar?: string; updatedAt: number }>
      | undefined;
    if (doc.sectionAttribution && Object.keys(doc.sectionAttribution).length > 0) {
      const uniqueAuthorIds = Array.from(new Set(Object.values(doc.sectionAttribution).map((e) => e.authorId).filter(Boolean)));
      const authorLookupEntries = await Promise.all(
        uniqueAuthorIds.map(async (aid) => {
          try {
            const u = await getDoc<User>(aid);
            if (u && u.type === 'user') {
              return [aid, {
                name: u.name || (u.email ? u.email.split('@')[0] : undefined),
                avatar: u.avatar ?? undefined,
              }] as const;
            }
          } catch { /* ignore */ }
          return [aid, { name: undefined, avatar: undefined }] as const;
        })
      );
      const authorLookup = Object.fromEntries(authorLookupEntries);
      sectionAttributionHydrated = {};
      for (const [blockHash, entry] of Object.entries(doc.sectionAttribution)) {
        const lookup = authorLookup[entry.authorId];
        sectionAttributionHydrated[blockHash] = {
          authorId: entry.authorId,
          authorName: lookup?.name,
          authorAvatar: lookup?.avatar,
          updatedAt: entry.updatedAt,
        };
      }
    }
    res.json({
      id: doc._id,
      title: doc.title,
      content: doc.content,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      authorId: doc.authorId,
      authorName,
      authorAvatar,
      sectionAttribution: sectionAttributionHydrated,
      sharing: normalizeSharingPolicy(doc),
      permissions: {
        role: access.role,
        canRead: access.canRead,
        canComment: access.canComment,
        canEdit: access.canEdit,
        canManage: access.canManage,
      },
    });
    return;
  } catch (e: any) {
    if (respondTopicLookupFailure(e, res, (req as any)?.id)) return;
    res.status(500).json({ error: e?.message || 'topic_read_error', requestId: (req as any)?.id });
    return;
  }
});

// POST /api/topics/:id/follow
router.post('/:id/follow', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const topicId = req.params['id'] as string;
  try {
    const topic = await loadLiveTopic(topicId);
    const access = await requireWaveAccess(req, res, topicId, 'read', topic);
    if (!access) return;
  } catch (e: any) {
    if (respondTopicLookupFailure(e, res, (req as any)?.id)) return;
    res.status(500).json({ error: e?.message || 'follow_access_error', requestId: (req as any)?.id });
    return;
  }

  const followId = `topic_follow:${userId}:${topicId}`;
  try {
    const existing = await getDoc<TopicFollow>(followId).catch(() => null);
    if (existing && existing.type === 'topic_follow') {
      res.json({ ok: true, topicId, isFollowed: true });
      return;
    }

    const now = Date.now();
    const doc: TopicFollow = {
      _id: followId,
      type: 'topic_follow',
      userId,
      topicId,
      createdAt: now,
      updatedAt: now,
    };
    await insertDoc(doc as any);
    res.status(201).json({ ok: true, topicId, isFollowed: true });
    return;
  } catch (e: any) {
    if (String(e?.message).startsWith('409')) {
      res.json({ ok: true, topicId, isFollowed: true });
      return;
    }
    res.status(500).json({ error: e?.message || 'follow_error', requestId: (req as any)?.id });
    return;
  }
});

// POST /api/topics/:id/unfollow
router.post('/:id/unfollow', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const topicId = req.params['id'] as string;
  const followId = `topic_follow:${userId}:${topicId}`;

  try {
    const topic = await loadLiveTopic(topicId);
    const access = await requireWaveAccess(req, res, topicId, 'read', topic);
    if (!access) return;
    const existing = await getDoc<TopicFollow & { _rev?: string }>(followId).catch(() => null);
    if (!existing || !existing._rev) {
      res.json({ ok: true, topicId, isFollowed: false });
      return;
    }
    await deleteDoc(followId, existing._rev);
    res.json({ ok: true, topicId, isFollowed: false });
    return;
  } catch (e: any) {
    if (respondTopicLookupFailure(e, res, (req as any)?.id)) return;
    res.status(500).json({ error: e?.message || 'unfollow_error', requestId: (req as any)?.id });
    return;
  }
});

// PATCH /api/topics/:id
router.patch('/:id', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const payload = UpdateTopicSchema.parse(req.body ?? {});
    const existing = await loadLiveTopic(id);
    const access = await requireWaveAccess(req, res, id, 'edit', existing);
    if (!access) return;
    const nowPatch = Date.now();
    // Authorship is server authority. Ignore any unknown client sidecar and
    // derive changed blocks from the stored old/new content plus this session.
    let nextSectionAttribution = existing.sectionAttribution;
    if (payload.content !== undefined && payload.content !== existing.content) {
      nextSectionAttribution = diffAndStampAttribution({
        prevAttribution: existing.sectionAttribution,
        oldHtml: existing.content || '',
        newHtml: payload.content,
        currentUserId: req.user!.id,
        now: nowPatch,
      });
    }
    const next: Topic & { _rev?: string } = {
      ...existing,
      title: payload.title ?? existing.title,
      content: payload.content ?? existing.content,
      sectionAttribution: nextSectionAttribution,
      updatedAt: nowPatch,
    };
    const r = await updateDoc(next as any);
    res.json({ id: r['id'], rev: r['rev'] });
    try { emitEvent('topic:updated', { id: r['id'], title: next.title, updatedAt: next.updatedAt }); } catch {}
    return;
  } catch (e: any) {
    if (e?.issues) { res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id }); return; }
    if (respondTopicLookupFailure(e, res, (req as any)?.id)) return;
    res.status(500).json({ error: e?.message || 'update_error', requestId: (req as any)?.id });
    return;
  }
});

// DELETE /api/topics/:id
router.delete('/:id', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const doc = await loadLiveTopic(id);
    if (!doc._rev) {
      res.status(409).json({ error: 'topic_revision_missing', requestId: (req as any)?.id });
      return;
    }
    const access = await requireWaveAccess(req, res, id, 'manage', doc);
    if (!access) return;
    const deletedAt = Date.now();
    // Do not physically delete the metadata document. `resolveWaveAccess`
    // intentionally maps a missing wave document to legacy public-read-only;
    // retaining this explicit private tombstone prevents surviving blips from
    // ever crossing that compatibility boundary after deletion.
    const tombstone: TopicTombstone = {
      ...(doc as any),
      _id: id,
      _rev: (doc as any)._rev,
      type: 'topic_tombstone',
      deleted: true,
      deletedAt,
      deletedBy: req.user!.id,
      title: '',
      content: '',
      sectionAttribution: undefined,
      shareLevel: 'private',
      allowComments: false,
      allowEdits: false,
      updatedAt: deletedAt,
    };
    const r = await updateDoc(tombstone as any);
    disconnectWaveSockets(id);
    // The tombstone is the security boundary. Cascade after it has landed so
    // even an interrupted cleanup cannot expose a leftover blip. A failed
    // cascade is surfaced as an error, while the topic remains inaccessible.
    const deletedBlips = await cascadeDeletedTopicBlips(id, req.user!.id, deletedAt);
    res.json({ id: r['id'], rev: r['rev'], deleted: true, deletedBlips });
    try { emitEvent('topic:deleted', { id: r['id'], deletedAt }); } catch {}
    return;
  } catch (e: any) {
    if (respondTopicLookupFailure(e, res, (req as any)?.id)) return;
    res.status(500).json({ error: e?.message || 'delete_error', requestId: (req as any)?.id });
    return;
  }
});

export default router;
