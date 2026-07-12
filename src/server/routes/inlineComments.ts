import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { find, insertDoc, getDoc, updateDoc, deleteDoc } from '../lib/couch.js';
import { InlineComment } from '../../shared/types/comments.js';
import { FEATURES } from '../../shared/featureFlags.js';
import type { Blip } from '../schemas/wave.js';
import { requireWaveAccess } from '../lib/access.js';
import { csrfProtect } from '../middleware/csrf.js';

const router = Router();

// Schema for comment creation
const inlineCommentRangeSchema = z.object({
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string().max(10_000),
}).refine(({ start, end }) => end >= start, { message: 'range end must not precede start' });

const createCommentSchema = z.object({
  blipId: z.string().min(1).max(500),
  content: z.string().trim().min(1).max(20_000),
  range: inlineCommentRangeSchema,
  parentId: z.string().min(1).max(500).optional(),
});

const inlineCommentDocSchema = z.object({
  _id: z.string().min(1),
  _rev: z.string().optional(),
  id: z.string().min(1),
  type: z.literal('inline_comment'),
  blipId: z.string().min(1),
  userId: z.string().min(1),
  content: z.string(),
  range: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    text: z.string(),
  }),
  resolved: z.boolean(),
  rootId: z.string().optional(),
}).passthrough();

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
    const blip = await getDoc<Blip>(blipId);
    const access = await requireWaveAccess(req, res, blip.waveId, 'read');
    if (!access) return;

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
router.post('/comments', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  try {
    if (!FEATURES.INLINE_COMMENTS) {
      res.status(404).json({ error: 'Feature not enabled' });
      return;
    }

    const { blipId, content, range, parentId } = createCommentSchema.parse(req.body);
    const blip = await getDoc<Blip>(blipId);
    const access = await requireWaveAccess(req, res, blip.waveId, 'comment');
    if (!access) return;
    const userId = req.user!.id;
    const userName = req.user!.name || 'Anonymous';
    const userEmail = req.user!.email || '';
    const userAvatar = (req.session as any)?.userAvatar || '';
    let resolvedRange = range;
    let rootId: string | undefined;

    if (parentId) {
      try {
        const rawParent = await getDoc<unknown>(parentId);
        const parsedParent = inlineCommentDocSchema.safeParse(rawParent);
        if (!parsedParent.success || parsedParent.data.blipId !== blipId) {
          res.status(400).json({ error: 'invalid_parent' });
          return;
        }
        const parent = parsedParent.data;
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
router.patch('/comments/:commentId/resolve', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  try {
    if (!FEATURES.INLINE_COMMENTS) {
      res.status(404).json({ error: 'Feature not enabled' });
      return;
    }

    const commentId = req.params['commentId'] as string;
    const { resolved } = z.object({ resolved: z.boolean() }).parse(req.body);
    
    const parsed = inlineCommentDocSchema.safeParse(await getDoc<unknown>(commentId));
    if (!parsed.success) {
      res.status(404).json({ error: 'comment_not_found' });
      return;
    }
    const doc = parsed.data;
    const blip = await getDoc<Blip>(doc.blipId);
    const access = await requireWaveAccess(req, res, blip.waveId, 'comment');
    if (!access) return;
    if (doc.userId !== req.user!.id && !access.canEdit) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
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
router.delete('/comments/:commentId', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  try {
    if (!FEATURES.INLINE_COMMENTS) {
      res.status(404).json({ error: 'Feature not enabled' });
      return;
    }

    const commentId = req.params['commentId'] as string;
    const userId = req.user!.id;
    
    const parsed = inlineCommentDocSchema.safeParse(await getDoc<unknown>(commentId));
    if (!parsed.success) {
      res.status(404).json({ error: 'comment_not_found' });
      return;
    }
    const doc = parsed.data;
    const blip = await getDoc<Blip>(doc.blipId);
    const access = await requireWaveAccess(req, res, blip.waveId, 'comment');
    if (!access) return;
    if (doc.userId !== userId && !access.canEdit) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    
    if (!doc._rev) {
      res.status(409).json({ error: 'comment_revision_missing' });
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
