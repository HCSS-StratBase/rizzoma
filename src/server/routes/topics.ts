import { Router } from 'express';
import { createIndex, deleteDoc, find, getDoc, insertDoc, updateDoc, view } from '../lib/couch.js';
import { emitEvent } from '../lib/socket.js';
import { csrfProtect } from '../middleware/csrf.js';
import { requireAuth } from '../middleware/auth.js';
import { CreateTopicSchema, UpdateTopicSchema } from '../schemas/topic.js';
import { computeWaveUnreadCounts } from '../lib/unread.js';

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

type TopicListItem = { id: string | undefined; title: string; createdAt: number; updatedAt?: number };

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
    if (userId) {
      const ids = enriched.map((t) => t.id).filter(Boolean) as string[];
      if (ids.length > 0) {
        const counts = await computeWaveUnreadCounts(userId, ids);
        enriched = enriched.map((topic) => {
          const entry = topic.id ? counts[topic.id] : undefined;
          return entry ? { ...topic, unreadCount: entry.unread, totalCount: entry.total } : topic;
        });
      }
    }
    res.json({ topics: enriched, hasMore: more, nextBookmark: bookmarkValue });
  };

  try {
    // Prefer modern topics docs via Mango query; create minimal index for sort
    const sessUser = (req as any).session?.userId as string | undefined;
    const selector: any = { type: 'topic' };
    if (myOnly && sessUser) selector.authorId = sessUser;

    // Ensure indexes (idempotent)
    try { await createIndex(['type', 'updatedAt'], 'idx_topic_updatedAt'); } catch {}
    if (myOnly) { try { await createIndex(['type', 'authorId', 'updatedAt'], 'idx_topic_author_updatedAt'); } catch {} }

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
        const r = await find<Topic>(searchSelector, { limit: limit + 1, skip: offset, sort: [{ updatedAt: 'desc' }, { createdAt: 'desc' }], bookmark });
        const window = r.docs || [];
        topics = window.slice(0, limit).map((d) => ({
          id: String(d._id ?? ''),
          title: d.title,
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
        r = await find<Topic>(selector, { limit: limit + 1, skip: offset, sort: [{ updatedAt: 'desc' }, { createdAt: 'desc' }], bookmark });
      } catch {
        r = await find<Topic>(selector, { limit: limit + 1, skip: offset, bookmark });
      }
      const window = r.docs || [];
      topics = window.slice(0, limit).map((d) => ({
        id: String(d._id ?? ''),
        title: d.title,
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
    res.status(201).json({ id: r.id, rev: r.rev });
    try { emitEvent('topic:created', { id: r.id, title: doc.title, createdAt: doc.createdAt }); } catch {}
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

// PATCH /api/topics/:id
router.patch('/:id', csrfProtect(), requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const id = req.params['id'] as string;
    const payload = UpdateTopicSchema.parse(req.body ?? {});
    const existing = await getDoc<Topic & { _rev: string }>(id);
    if (existing.authorId && existing.authorId !== userId) {
      console.warn('[topics] forbidden update', { topicId: id, userId, ownerId: existing.authorId, requestId: (req as any)?.id });
      res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id });
      return;
    }
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
