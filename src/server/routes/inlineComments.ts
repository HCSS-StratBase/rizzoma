import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { find, insertDoc, getDoc, updateDoc, deleteDoc } from '../lib/couch.js';
import { InlineComment } from '../../shared/types/comments.js';
import { FEATURES } from '../../shared/featureFlags.js';

const router = Router();

// Schema for comment creation
const createCommentSchema = z.object({
  blipId: z.string(),
  content: z.string().min(1),
  range: z.object({
    start: z.number(),
    end: z.number(),
    text: z.string()
  }),
  parentId: z.string().optional(),
});

// Get comments for a blip
//
// Previously used `view('comments', 'by_blip')` against a non-existent
// `_design/comments` design doc — the fetch 404'd, fell into the
// catch, and returned `{ comments: [] }` for every call. Result:
// inline comments never displayed in the UI even when persisted in
// CouchDB. Switched to a Mango find against the existing
// `idx_inline_comment_blip` index (task #16 resilience fix).
router.get('/blip/:blipId/comments', async (req, res): Promise<void> => {
  try {
    if (!FEATURES.INLINE_COMMENTS) {
      res.status(404).json({ error: 'Feature not enabled' });
      return;
    }

    const blipId = req.params['blipId'] as string;

    const result = await find<InlineComment>(
      { type: 'inline_comment', blipId },
      { limit: 500 },
    );

    const comments = (result.docs || [])
      .map((comment) => ({
        ...comment,
        isAuthenticated:
          typeof comment.userId === 'string' && comment.userId.trim().length > 0,
      }));

    res.json({ comments });
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

    const { blipId, content, range, parentId } = createCommentSchema.parse(req.body);
    const userId = req.user!.id;
    const userName = req.user!.name || 'Anonymous';
    const userEmail = req.user!.email || '';
    const userAvatar = (req.session as any)?.userAvatar || '';
    let resolvedRange = range;
    let rootId: string | undefined;

    if (parentId) {
      try {
        const parent = await getDoc<InlineComment & { _id: string }>(parentId);
        if (!parent || parent.blipId !== blipId) {
          res.status(400).json({ error: 'invalid_parent' });
          return;
        }
        resolvedRange = parent.range;
        rootId = parent.rootId || parent._id;
      } catch (error) {
        res.status(404).json({ error: 'parent_not_found' });
        return;
      }
    }
    
    const commentId = `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const comment: InlineComment & { _id: string; type: string } = {
      _id: commentId,
      id: commentId,
      blipId,
      userId,
      userName,
      userEmail,
      userAvatar,
      isAuthenticated: true,
      content,
      range: resolvedRange,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resolved: false,
      parentId,
      rootId: rootId || commentId,
      resolvedAt: null,
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

    const commentId = req.params['commentId'] as string;
    const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
    
    const doc = await getDoc<any>(commentId);
    await updateDoc({
      ...doc,
      resolved,
      resolvedAt: resolved ? Date.now() : null,
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

    const commentId = req.params['commentId'] as string;
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
