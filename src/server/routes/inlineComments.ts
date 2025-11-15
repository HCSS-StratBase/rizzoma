import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import { getCouchDB } from '../services/couchdb';
import { InlineComment } from '../../shared/types/comments';
import { FEATURES } from '../../shared/featureFlags';

const router = Router();

// Schema for comment creation
const createCommentSchema = z.object({
  blipId: z.string(),
  content: z.string().min(1),
  range: z.object({
    start: z.number(),
    end: z.number(),
    text: z.string()
  })
});

// Get comments for a blip
router.get('/blip/:blipId/comments', asyncHandler(async (req, res) => {
  if (!FEATURES.INLINE_COMMENTS) {
    return res.status(404).json({ error: 'Feature not enabled' });
  }

  const { blipId } = req.params;
  const db = await getCouchDB('inline_comments');
  
  try {
    const result = await db.view('comments', 'by_blip', {
      key: blipId,
      include_docs: true
    });
    
    const comments = result.rows.map(row => row.doc);
    res.json({ comments });
  } catch (error) {
    res.json({ comments: [] });
  }
}));

// Create a new comment
router.post('/comments', requireAuth, asyncHandler(async (req, res) => {
  if (!FEATURES.INLINE_COMMENTS) {
    return res.status(404).json({ error: 'Feature not enabled' });
  }

  const { blipId, content, range } = createCommentSchema.parse(req.body);
  const userId = req.user!.id;
  const userName = req.user!.name || 'Anonymous';
  
  const db = await getCouchDB('inline_comments');
  
  const comment: InlineComment = {
    id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    blipId,
    userId,
    userName,
    content,
    range,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    resolved: false
  };
  
  await db.insert({
    ...comment,
    _id: comment.id,
    type: 'inline_comment'
  });
  
  res.json({ comment });
}));

// Resolve/unresolve a comment
router.patch('/comments/:commentId/resolve', requireAuth, asyncHandler(async (req, res) => {
  if (!FEATURES.INLINE_COMMENTS) {
    return res.status(404).json({ error: 'Feature not enabled' });
  }

  const { commentId } = req.params;
  const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
  
  const db = await getCouchDB('inline_comments');
  
  const doc = await db.get(commentId);
  await db.insert({
    ...doc,
    resolved,
    updatedAt: Date.now()
  });
  
  res.json({ success: true });
}));

// Delete a comment (only by creator)
router.delete('/comments/:commentId', requireAuth, asyncHandler(async (req, res) => {
  if (!FEATURES.INLINE_COMMENTS) {
    return res.status(404).json({ error: 'Feature not enabled' });
  }

  const { commentId } = req.params;
  const userId = req.user!.id;
  
  const db = await getCouchDB('inline_comments');
  
  const doc = await db.get(commentId);
  if (doc.userId !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  await db.destroy(doc._id, doc._rev);
  
  res.json({ success: true });
}));

export const inlineCommentsRouter = router;