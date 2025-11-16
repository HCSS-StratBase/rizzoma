import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { view, insertDoc, getDoc, updateDoc, deleteDoc } from '../lib/couch';
import { InlineComment } from '@shared/types/comments';
import { FEATURES } from '@shared/featureFlags';

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
router.get('/blip/:blipId/comments', async (req, res): Promise<void> => {
  try {
    if (!FEATURES.INLINE_COMMENTS) {
      res.status(404).json({ error: 'Feature not enabled' });
      return;
    }

    const { blipId } = req.params;
    
    try {
      const result = await view<InlineComment>('comments', 'by_blip', {
        key: blipId,
        include_docs: true
      });
      
      const comments = result.rows.map(row => row.doc).filter(Boolean);
      res.json({ comments });
    } catch (error) {
      // If view doesn't exist, return empty array
      res.json({ comments: [] });
    }
  } catch (error) {
    console.error('Error in comments route:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new comment
router.post('/comments', requireAuth, async (req, res): Promise<void> => {
  try {
    if (!FEATURES.INLINE_COMMENTS) {
      res.status(404).json({ error: 'Feature not enabled' });
      return;
    }

    const { blipId, content, range } = createCommentSchema.parse(req.body);
    const userId = req.user!.id;
    const userName = req.user!.name || 'Anonymous';
    
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const comment: InlineComment & { _id: string; type: string } = {
      _id: commentId,
      id: commentId,
      blipId,
      userId,
      userName,
      content,
      range,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resolved: false,
      type: 'inline_comment'
    };
    
    await insertDoc(comment);
    
    res.json({ comment });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Resolve/unresolve a comment
router.patch('/comments/:commentId/resolve', requireAuth, async (req, res): Promise<void> => {
  try {
    if (!FEATURES.INLINE_COMMENTS) {
      res.status(404).json({ error: 'Feature not enabled' });
      return;
    }

    const { commentId } = req.params;
    const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
    
    const doc = await getDoc<any>(commentId);
    await updateDoc({
      ...doc,
      resolved,
      updatedAt: Date.now()
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// Delete a comment (only by creator)
router.delete('/comments/:commentId', requireAuth, async (req, res): Promise<void> => {
  try {
    if (!FEATURES.INLINE_COMMENTS) {
      res.status(404).json({ error: 'Feature not enabled' });
      return;
    }

    const { commentId } = req.params;
    const userId = req.user!.id;
    
    const doc = await getDoc<any>(commentId);
    if (doc.userId !== userId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    
    await deleteDoc(doc._id, doc._rev);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export const inlineCommentsRouter = router;