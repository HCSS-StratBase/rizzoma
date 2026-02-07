/**
 * Mentions Routes
 *
 * API endpoints for retrieving and managing user mentions.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { find, updateDoc, getDoc } from '../lib/couch.js';

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
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const filter = req.query['filter'] as string; // 'all' | 'unread'
  const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 100);
  const offset = parseInt(req.query['offset'] as string) || 0;

  try {
    const selector: Record<string, unknown> = {
      type: 'mention',
      mentionedUserId: userId,
    };

    if (filter === 'unread') {
      selector['isRead'] = false;
    }

    const result = await find<MentionDoc>(selector, {
      limit,
      skip: offset,
      sort: [{ createdAt: 'desc' }],
    });

    // Get topic titles for each mention
    const topicIds = [...new Set(result.docs.map(d => d.topicId))];
    const topicTitles: Record<string, string> = {};

    for (const topicId of topicIds) {
      try {
        const topic = await getDoc<{ title?: string }>(topicId);
        topicTitles[topicId] = topic?.title || 'Untitled Topic';
      } catch {
        topicTitles[topicId] = 'Untitled Topic';
      }
    }

    const mentions = result.docs.map(doc => ({
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

    // Get total counts
    const allResult = await find<MentionDoc>({ type: 'mention', mentionedUserId: userId }, { limit: 0 });
    const unreadResult = await find<MentionDoc>({ type: 'mention', mentionedUserId: userId, isRead: false }, { limit: 0 });

    res.json({
      mentions,
      total: allResult.docs?.length || 0,
      unreadCount: unreadResult.docs?.length || 0,
    });
  } catch (e: any) {
    console.error('[mentions] list error', e);
    res.status(500).json({ error: e?.message || 'list_mentions_error' });
  }
});

// POST /api/mentions/:id/read - Mark mention as read
router.post('/:id/read', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const mentionId = req.params['id'];

  try {
    const doc = await getDoc<MentionDoc & { _rev: string }>(mentionId);

    if (!doc || doc.type !== 'mention') {
      res.status(404).json({ error: 'mention_not_found' });
      return;
    }

    if (doc.mentionedUserId !== userId) {
      res.status(403).json({ error: 'not_authorized' });
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
router.post('/read-all', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  try {
    const result = await find<MentionDoc & { _rev: string }>({
      type: 'mention',
      mentionedUserId: userId,
      isRead: false,
    }, { limit: 1000 });

    for (const doc of result.docs) {
      doc.isRead = true;
      await updateDoc(doc as any);
    }

    res.json({ success: true, count: result.docs.length });
  } catch (e: any) {
    console.error('[mentions] mark all read error', e);
    res.status(500).json({ error: e?.message || 'mark_all_read_error' });
  }
});

export default router;
