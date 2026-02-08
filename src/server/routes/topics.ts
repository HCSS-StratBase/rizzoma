import { Router } from 'express';
import { deleteDoc, find, findOne, getDoc, insertDoc, updateDoc, view } from '../lib/couch.js';
import { emitEvent } from '../lib/socket.js';
import { csrfProtect } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/auth.js';
import { CreateTopicSchema, UpdateTopicSchema } from '../schemas/topic.js';
import { computeWaveUnreadCounts } from '../lib/unread.js';
import { sendInviteEmail } from '../services/email.js';
import type { WaveParticipant } from '../schemas/wave.js';

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

type Topic = {
  _id?: string;
  type: 'topic';
  title: string;
  content?: string;
  authorId?: string;
  createdAt: number; // epoch millis
  updatedAt: number; // epoch millis
};

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
router.get('/', async (req, res): Promise<void> => {
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
    const sessUser = (req as any).session?.userId as string | undefined;
    const selector: any = { type: 'topic' };
    if (myOnly && sessUser) selector.authorId = sessUser;

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
router.post('/', csrfProtect(), requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const parsed = CreateTopicSchema.parse(req.body ?? {});
    const now = Date.now();
    const doc: Topic = {
      type: 'topic',
      title: parsed.title,
      content: parsed.content,
      authorId: userId,
      createdAt: now,
      updatedAt: now,
    };
    const r = await insertDoc(doc);
    const topicId = r.id;

    // Handle participants if provided
    const participantEmails = Array.isArray((req.body as any)?.participants)
      ? (req.body as any).participants
          .map((e: string) => String(e).trim().toLowerCase())
          .filter((e: string) => e.length > 0 && e.includes('@'))
      : [];

    let invitedCount = 0;
    if (participantEmails.length > 0) {
      // Get inviter info
      const inviterUser = await findOne<User>({ type: 'user', _id: userId }).catch(() => null)
        || await getDoc<User>(userId).catch(() => null);
      const inviterName = inviterUser?.name || inviterUser?.email?.split('@')[0] || 'Someone';
      const inviterEmail = inviterUser?.email || '';

      const baseUrl = process.env['APP_BASE_URL'] || `${req.protocol}://${req.headers.host}`;
      const topicUrl = `${baseUrl}/#/topic/${topicId}`;

      // Create owner participant record for the creator
      const ownerParticipantId = `participant:wave:${topicId}:user:${userId}`;
      const ownerParticipant: WaveParticipant = {
        _id: ownerParticipantId,
        type: 'participant',
        waveId: topicId,
        userId: userId,
        email: inviterEmail,
        role: 'owner',
        invitedAt: now,
        acceptedAt: now,
        status: 'accepted',
      };
      await insertDoc(ownerParticipant as any).catch(() => undefined);

      // Invite each participant
      for (const email of participantEmails) {
        try {
          // Find or create user
          let user = await findOne<User>({ type: 'user', email }).catch(() => null);
          let newUser = false;

          if (!user) {
            const newUserDoc: User = {
              type: 'user',
              email,
              name: email.split('@')[0],
              createdAt: now,
              updatedAt: now,
            };
            const userResult = await insertDoc(newUserDoc as any);
            user = { ...newUserDoc, _id: userResult.id };
            newUser = true;
          }

          // Create participant record
          const participantId = `participant:wave:${topicId}:user:${user._id}`;
          const participant: WaveParticipant = {
            _id: participantId,
            type: 'participant',
            waveId: topicId,
            userId: user._id!,
            email,
            role: 'editor',
            invitedBy: userId,
            invitedAt: now,
            status: newUser ? 'pending' : 'accepted',
            acceptedAt: newUser ? undefined : now,
          };
          await insertDoc(participant as any);

          // Send invite email
          await sendInviteEmail({
            inviterName,
            inviterEmail,
            topicTitle: doc.title,
            topicUrl,
            recipientEmail: email,
            recipientName: user.name || undefined,
          }).catch((err) => {
            console.warn('[topics] invite email failed', { email, error: err?.message });
          });

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
    const doc = await getDoc<Topic>(id);
    res.json({ id: doc._id, title: doc.title, content: doc.content, createdAt: doc.createdAt, updatedAt: doc.updatedAt });
    return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'couch_error', requestId: (req as any)?.id });
    return;
  }
});

// POST /api/topics/:id/follow
router.post('/:id/follow', csrfProtect(), requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const topicId = req.params['id'] as string;
  try {
    await getDoc<Topic>(topicId);
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
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
router.post('/:id/unfollow', csrfProtect(), requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const topicId = req.params['id'] as string;
  const followId = `topic_follow:${userId}:${topicId}`;

  try {
    const existing = await getDoc<TopicFollow & { _rev?: string }>(followId).catch(() => null);
    if (!existing || !existing._rev) {
      res.json({ ok: true, topicId, isFollowed: false });
      return;
    }
    await deleteDoc(followId, existing._rev);
    res.json({ ok: true, topicId, isFollowed: false });
    return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.json({ ok: true, topicId, isFollowed: false });
      return;
    }
    res.status(500).json({ error: e?.message || 'unfollow_error', requestId: (req as any)?.id });
    return;
  }
});

// PATCH /api/topics/:id
router.patch('/:id', csrfProtect(), requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const id = req.params['id'] as string;
    const payload = UpdateTopicSchema.parse(req.body ?? {});
    const existing = await getDoc<Topic & { _rev: string }>(id);
    // All authenticated users can edit topics (collaborative editing, like original Rizzoma)
    const next: Topic & { _rev?: string } = {
      ...existing,
      title: payload.title ?? existing.title,
      content: payload.content ?? existing.content,
      updatedAt: Date.now(),
    };
    const r = await updateDoc(next as any);
    res.json({ id: r['id'], rev: r['rev'] });
    try { emitEvent('topic:updated', { id: r['id'], title: next.title, updatedAt: next.updatedAt }); } catch {}
    return;
  } catch (e: any) {
    if (e?.issues) { res.status(400).json({ error: 'validation_error', issues: e.issues, requestId: (req as any)?.id }); return; }
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'update_error', requestId: (req as any)?.id });
    return;
  }
});

// DELETE /api/topics/:id
router.delete('/:id', csrfProtect(), requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const id = req.params['id'] as string;
    const doc = await getDoc<{ _rev: string } & Topic>(id);
    if ((doc as any).authorId && (doc as any).authorId !== userId) {
      console.warn('[topics] forbidden delete', { topicId: id, userId, ownerId: (doc as any).authorId, requestId: (req as any)?.id });
      res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id });
      return;
    }
    const r = await deleteDoc(id, (doc as any)._rev);
    res.json({ id: r['id'], rev: r['rev'] });
    try { emitEvent('topic:deleted', { id: r['id'] }); } catch {}
    return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'delete_error', requestId: (req as any)?.id });
    return;
  }
});

export default router;
