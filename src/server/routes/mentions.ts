/**
 * Mentions Routes
 *
 * API endpoints for retrieving and managing user mentions.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { noStore } from '../middleware/noStore.js';
import { find, updateDoc, getDoc, getDocsById } from '../lib/couch.js';
import { csrfProtect } from '../middleware/csrf.js';
import { identityFromRequest, resolveWaveAccess } from '../lib/access.js';

const router = Router();

interface MentionDoc {
  _id: string;
  _rev?: string;
  type: 'mention';
  topicId: string;
  blipId: string;
  mentionedUserId: string;
  mentionText: string;
  authorId: string;
  authorName: string;
  isRead: boolean;
  createdAt: number;
}

// GET /api/mentions - Get mentions for current user
// noStore: per-user mention list including isRead state (see middleware/noStore.ts)
router.get('/', noStore, requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const filter = req.query['filter'] as string; // 'all' | 'unread'
  const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 100);
  const offset = parseInt(req.query['offset'] as string) || 0;

  try {
    const selector: Record<string, unknown> = {
      type: 'mention',
      mentionedUserId: userId,
      // Bound createdAt so Mango uses idx_mention_user_createdAt instead
      // of falling back to a full-DB scan. 0 == Unix epoch, which
      // covers every real mention (timestamps are ms since epoch).
      createdAt: { $gt: 0 },
    };

    if (filter === 'unread') {
      selector['isRead'] = false;
    }

    // Main query — sort matches the index so Mango uses it.
    const result = await find<MentionDoc>(selector, {
      limit,
      skip: offset,
      sort: [{ createdAt: 'desc' }],
      use_index: filter === 'unread'
        ? 'idx_mention_user_isRead'
        : 'idx_mention_user_createdAt',
    });

    const identity = identityFromRequest(req);
    const accessByTopic = new Map<string, Promise<boolean>>();
    const canReadTopic = (topicId: string) => {
      if (!accessByTopic.has(topicId)) {
        accessByTopic.set(topicId, resolveWaveAccess(topicId, identity).then((access) => access.canRead).catch(() => false));
      }
      return accessByTopic.get(topicId)!;
    };
    const visibleFlags = await Promise.all(result.docs.map((doc) => canReadTopic(doc.topicId)));
    const visibleDocs = result.docs.filter((_, index) => visibleFlags[index]);

    // Batch-fetch topic titles in a single _all_docs request instead
    // of N serial GETs (the N+1 bug the Loading mentions... spinner
    // hung on — 2026-04-14 task #39).
    const topicIds = [...new Set(visibleDocs.map(d => d.topicId))];
    const topicDocs = await getDocsById<{ title?: string }>(topicIds);
    const topicTitles: Record<string, string> = {};
    for (const id of topicIds) {
      topicTitles[id] = topicDocs[id]?.title || 'Untitled Topic';
    }

    const mentions = visibleDocs.map(doc => ({
      id: doc._id,
      topicId: doc.topicId,
      topicTitle: topicTitles[doc.topicId],
      blipId: doc.blipId,
      mentionText: doc.mentionText,
      authorId: doc.authorId,
      authorName: doc.authorName,
      isRead: doc.isRead,
      timestamp: new Date(doc.createdAt).toISOString(),
    }));

    // Count unread via a capped, indexed query. Previous impl passed
    // `limit: 0` which the couch wrapper treated as falsy and
    // OMITTED from the request body — meaning CouchDB happily
    // returned every matching doc (unbounded full scan × 2, the
    // second root cause of the Loading mentions... hang). Cap at
    // 500 which is enough to show "500+" in the UI and keeps the
    // indexed query cheap.
    const COUNT_CAP = 500;
    const unreadCountResult = await find<{ _id: string }>(
      { type: 'mention', mentionedUserId: userId, isRead: false },
      { limit: COUNT_CAP, use_index: 'idx_mention_user_isRead' },
    );
    const unreadVisibleFlags = await Promise.all(
      (unreadCountResult.docs as Array<{ _id: string; topicId?: string }>).map((doc) => canReadTopic(String(doc.topicId || ''))),
    );
    const unreadCount = unreadCountResult.docs.filter((_, index) => unreadVisibleFlags[index]).length;

    res.json({
      mentions,
      // Total is approximate: the current page size informs whether
      // there are more pages, but we don't pay for a full scan to
      // produce an exact "how many total mentions" figure (callers
      // that need paging can use offset + hasMore).
      total: visibleDocs.length + offset + (result.docs.length === limit ? 1 : 0),
      unreadCount,
      hasMore: result.docs.length === limit,
    });
  } catch (e: any) {
    console.error('[mentions] list error', e);
    res.status(500).json({ error: e?.message || 'list_mentions_error' });
  }
});

// POST /api/mentions/:id/read - Mark mention as read
router.post('/:id/read', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const mentionId = req.params['id'];

  try {
    const doc = await getDoc<MentionDoc & { _rev: string }>(String(mentionId));

    if (!doc || doc.type !== 'mention') {
      res.status(404).json({ error: 'mention_not_found' });
      return;
    }

    if (doc.mentionedUserId !== userId) {
      res.status(403).json({ error: 'not_authorized' });
      return;
    }
    const access = await resolveWaveAccess(doc.topicId, identityFromRequest(req));
    if (!access.canRead) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (!doc.isRead) {
      doc.isRead = true;
      await updateDoc(doc as any);
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error('[mentions] mark read error', e);
    res.status(500).json({ error: e?.message || 'mark_read_error' });
  }
});

// POST /api/mentions/read-all - Mark all mentions as read
router.post('/read-all', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;

  try {
    const result = await find<MentionDoc & { _rev: string }>({
      type: 'mention',
      mentionedUserId: userId,
      isRead: false,
    }, { limit: 1000 });

    let updated = 0;
    for (const doc of result.docs) {
      const access = await resolveWaveAccess(doc.topicId, identityFromRequest(req)).catch(() => null);
      if (!access?.canRead) continue;
      doc.isRead = true;
      await updateDoc(doc as any);
      updated += 1;
    }

    res.json({ success: true, count: updated });
  } catch (e: any) {
    console.error('[mentions] mark all read error', e);
    res.status(500).json({ error: e?.message || 'mark_all_read_error' });
  }
});

export default router;
