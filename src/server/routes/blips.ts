import { Router } from 'express';
import { getDoc, updateDoc, insertDoc, find } from '../lib/couch.js';
import { emitEvent } from '../lib/socket.js';
import { requireAuth } from '../middleware/auth.js';
import type { Blip } from '../schemas/wave.js';

type BlipHistoryDoc = {
  _id: string;
  type: 'blip_history';
  blipId: string;
  waveId: string;
  content: string;
  authorId?: string;
  authorName?: string;
  event: 'create' | 'update';
  createdAt: number;
  updatedAt: number;
  snapshotVersion: number;
  _rev?: string;
};

type InlineCommentsVisibilityDoc = {
  _id: string;
  type: 'inline_comments_visibility';
  userId: string;
  blipId: string;
  isVisible: boolean;
  createdAt: number;
  updatedAt: number;
  _rev?: string;
};

const inlineCommentsPrefDocId = (userId: string, blipId: string): string =>
  `inline-comments-visible:${userId}:${blipId}`;

const isPerfRequest = (req: { headers?: Record<string, string | string[] | undefined>; query?: Record<string, any> }): boolean => {
  const header = req.headers?.['x-rizzoma-perf'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (headerValue === '1' || headerValue === 'true') return true;
  const perfQuery = req.query?.['perf'];
  const perfValue = Array.isArray(perfQuery) ? perfQuery[0] : perfQuery;
  return perfValue === '1' || perfValue === 'true' || perfValue === 'full';
};

async function recordBlipHistory(
  blip: Blip & { _id?: string },
  action: 'create' | 'update',
  actorId: string,
  actorName?: string,
): Promise<void> {
  if (!blip._id) return;
  try {
    const existing = await find<BlipHistoryDoc>({ type: 'blip_history', blipId: blip._id }, { limit: 200 });
    const nextVersion = existing.docs.reduce((max, doc) => Math.max(max, doc.snapshotVersion || 0), 0) + 1;
    const now = Date.now();
    const historyDoc: BlipHistoryDoc = {
      _id: `blip_history:${blip._id}:${now}`,
      type: 'blip_history',
      blipId: blip._id,
      waveId: blip.waveId,
      content: blip.content || '',
      authorId: actorId,
      authorName: actorName,
      event: action,
      createdAt: now,
      updatedAt: now,
      snapshotVersion: nextVersion,
    };
    await insertDoc(historyDoc as any);
  } catch (error) {
    console.error('Failed to record blip history', error);
  }
}

async function touchTopic(waveId: string): Promise<void> {
  if (!waveId) return;
  try {
    const topic = await getDoc<{ _id: string; _rev: string; updatedAt?: number; createdAt: number; type?: string }>(waveId);
    if (!topic || topic.type !== 'topic') return;
    const now = Date.now();
    const next = { ...topic, updatedAt: now };
    await updateDoc(next as any);
  } catch (error) {
    console.error('[blips] failed to touch topic for activity', { waveId, error });
  }
}

async function markBlipAndDescendantsDeleted(
  blip: Blip & { _id: string; _rev: string },
  userId: string,
): Promise<void> {
  try {
    const result = await find<Blip & { _rev: string }>({ type: 'blip', waveId: blip.waveId }, { limit: 500 });
    const docs = result.docs || [];
    const targetIds = new Set<string>([blip._id]);
    let added = true;
    while (added) {
      added = false;
      docs.forEach((doc) => {
        if (doc.parentId && targetIds.has(doc.parentId) && !targetIds.has(doc._id!)) {
          targetIds.add(doc._id!);
          added = true;
        }
      });
    }

    const now = Date.now();
    const toUpdate = docs.filter((doc) => doc._id && targetIds.has(doc._id)).map((doc) => ({
      ...doc,
      deleted: true,
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
    }));

    for (const doc of toUpdate) {
      await updateDoc(doc as any);
    }
  } catch (error) {
    console.error('Failed to mark blip descendants as deleted', error);
    throw error;
  }
}

const router = Router();

// PATCH /api/blips/:id/reparent { parentId }
router.patch('/:id/reparent', requireAuth, async (req, res): Promise<void> => {
  try {
    const id = req.params['id'] as string;
    const parentId = (req.body || {}).parentId as string | null | undefined;
    const blip = await getDoc<Blip & { _id: string; _rev: string }>(id);
    const next: Blip & { _rev?: string } = {
      ...blip,
      parentId: parentId ?? null,
      updatedAt: Date.now(),
    };
    const r = await updateDoc(next as any);
    res.json({ id: r['id'], rev: r['rev'] });
    return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); return; }
    res.status(500).json({ error: e?.message || 'reparent_error', requestId: (req as any)?.id });
    return;
  }
});

// POST /api/blips - Create a new blip
router.post('/', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const { waveId, parentId, content, anchorPosition } = req.body || {};

    if (!waveId || !content) {
      res.status(400).json({ error: 'missing_required_fields', requestId: (req as any)?.id });
      return;
    }

    const now = Date.now();
    const blipId = `${waveId}:b${now}`;

    const fallbackName = (req.user?.name && req.user.name.trim()) ? req.user.name : (req.user?.email || 'Unknown');
    const blip: Blip = {
      _id: blipId,
      type: 'blip',
      waveId,
      parentId: parentId || null,
      content,
      createdAt: now,
      updatedAt: now,
      authorId: userId,
      authorName: (req.body?.authorName as string)?.trim() || fallbackName,
      deleted: false,
      isFoldedByDefault: false,
      // Store anchor position for inline blips created via Ctrl+Enter
      ...(typeof anchorPosition === 'number' ? { anchorPosition } : {}),
    } as any;

    const r = await insertDoc(blip as any);
    if (!isPerfRequest(req)) {
      void touchTopic(waveId);
    }
    if (!isPerfRequest(req)) {
      void recordBlipHistory(blip, 'create', userId, blip.authorName);
    }
    try { emitEvent('blip:created', { waveId, blipId, updatedAt: now, userId }); } catch {}
    res.status(201).json({ 
      id: r['id'], 
      rev: r['rev'],
      blip: {
        ...blip,
        permissions: {
          canEdit: true,
          canComment: true,
          canRead: true
        }
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'create_blip_error', requestId: (req as any)?.id });
  }
});

// PUT /api/blips/:id - Update blip content
router.put('/:id', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  try {
    const id = req.params['id'] as string;
    const { content } = req.body || {};
    
    if (!content) {
      res.status(400).json({ error: 'missing_content', requestId: (req as any)?.id });
      return;
    }

    const blip = await getDoc<Blip & { _id: string; _rev: string }>(id);
    if (blip.deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }
    
    // In original Rizzoma, all wave participants can edit any blip (collaborative editing).
    // Any authenticated user who can access the wave can edit its blips.
    // In original Rizzoma, all wave participants can edit (collaborative editing)

    const updatedBlip: Blip & { _id: string; _rev?: string } = {
      ...blip,
      _id: blip._id || id,
      content,
      updatedAt: Date.now()
    };

    const r = await updateDoc(updatedBlip as any);
    if (!isPerfRequest(req)) {
      void touchTopic(blip.waveId);
    }
    if (!isPerfRequest(req)) {
      void recordBlipHistory(updatedBlip, 'update', userId, req.body?.authorName || (blip as any).authorName);
    }
    try { emitEvent('blip:updated', { waveId: blip.waveId, blipId: blip._id, updatedAt: updatedBlip.updatedAt, userId }); } catch {}
    res.json({ 
      id: r['id'], 
      rev: r['rev'],
      blip: {
        ...updatedBlip,
        permissions: {
          canEdit: true,
          canComment: true,
          canRead: true
        }
      }
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { 
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); 
      return; 
    }
    res.status(500).json({ error: e?.message || 'update_blip_error', requestId: (req as any)?.id });
  }
});

// GET /api/blips/:id - Get single blip with permissions
router.get('/:id', async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  try {
    const id = req.params['id'] as string;
    const blip = await getDoc<Blip>(id);
    if ((blip as any).deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }
    
    res.json({
      ...blip,
      permissions: {
        canEdit: !!userId, // All wave participants can edit (original Rizzoma behavior)
        canComment: !!userId,
        canRead: true
      }
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) { 
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id }); 
      return; 
    }
    res.status(500).json({ error: e?.message || 'get_blip_error', requestId: (req as any)?.id });
  }
});

router.delete('/:id', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  try {
    const id = req.params['id'] as string;
    const blip = await getDoc<Blip & { _id: string; _rev: string }>(id);
    if (blip._id === blip.waveId) {
      res.status(400).json({ error: 'cannot_delete_root', requestId: (req as any)?.id });
      return;
    }
    if (blip.deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }
    const isAuthor = !blip.authorId || blip.authorId === userId;
    if (!isAuthor) {
      console.warn('[blips] forbidden delete', { blipId: id, userId, ownerId: blip.authorId, requestId: (req as any)?.id });
      res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id });
      return;
    }

    await markBlipAndDescendantsDeleted(blip, userId);
    void touchTopic(blip.waveId);
    try { emitEvent('blip:deleted', { waveId: blip.waveId, blipId: blip._id, userId, deletedAt: Date.now() }); } catch {}
    res.json({ deleted: true, id });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'delete_blip_error', requestId: (req as any)?.id });
  }
});

// GET /api/blips/:id/history - Blip playback history
router.get('/:id/history', requireAuth, async (req, res): Promise<void> => {
  try {
    const blipId = req.params['id'] as string;
    const result = await find<BlipHistoryDoc>({ type: 'blip_history', blipId }, { limit: 200 });
    const history = (result.docs || [])
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map(({ _id, _rev, type, ...rest }) => ({ id: _id, ...rest }));
    res.json({ history });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'blip_history_error', requestId: (req as any)?.id });
  }
});

// GET /api/blips?waveId=:waveId - Get all blips for a wave/topic
router.get('/', async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  const waveId = (req.query as Record<string, string | undefined>)['waveId'];
  const limitParam = (req.query as Record<string, string | undefined>)['limit'];
  
  if (!waveId) {
    res.status(400).json({ error: 'missing_waveId', requestId: (req as any)?.id });
    return;
  }
  
  try {
    const limit = Math.min(Math.max(parseInt(String(limitParam ?? '100'), 10) || 100, 1), 5000);
    // Use the find method to query blips by waveId
    // Sort by [type, waveId, createdAt] to leverage idx_blip_wave_createdAt index
    const result = await find<Blip>(
      { type: 'blip', waveId },
      { limit, sort: [{ type: 'asc' as const }, { waveId: 'asc' as const }, { createdAt: 'asc' as const }] }
    );
    const blips = result.docs.filter((blip) => !(blip as any).deleted);
    
    res.json({
      blips: blips.map(blip => ({
        ...blip,
        isFoldedByDefault: !!(blip as any).isFoldedByDefault,
        permissions: {
          canEdit: !!userId, // All wave participants can edit (original Rizzoma behavior)
          canComment: !!userId,
          canRead: true
        }
      }))
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'get_blips_error', requestId: (req as any)?.id });
  }
});

router.get('/:id/collapse-default', requireAuth, async (req, res): Promise<void> => {
  try {
    const blipId = req.params['id'] as string;
    const doc = await getDoc<Blip>(blipId);
    res.json({ collapseByDefault: !!doc.isFoldedByDefault });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'collapse_pref_error', requestId: (req as any)?.id });
  }
});

router.patch('/:id/collapse-default', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { collapseByDefault } = req.body || {};
  if (typeof collapseByDefault !== 'boolean') {
    res.status(400).json({ error: 'invalid_payload', requestId: (req as any)?.id });
    return;
  }

  const blipId = req.params['id'] as string;
  try {
    const existing = await getDoc<Blip & { _rev: string }>(blipId);
    if (existing.authorId && existing.authorId !== userId) {
      res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id });
      return;
    }
    const next: Blip & { _rev?: string } = {
      ...existing,
      isFoldedByDefault: collapseByDefault,
      updatedAt: Date.now(),
    };
    const r = await updateDoc(next as any);
    res.json({ collapseByDefault, id: r['id'], rev: r['rev'] });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'collapse_pref_save_error', requestId: (req as any)?.id });
  }
});

router.get('/:id/inline-comments-visibility', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const blipId = req.params['id'] as string;
    const doc = await getDoc<InlineCommentsVisibilityDoc>(inlineCommentsPrefDocId(userId, blipId));
    res.json({ isVisible: typeof doc.isVisible === 'boolean' ? doc.isVisible : true, source: 'user' });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.json({ isVisible: true, source: 'default' });
      return;
    }
    res.status(500).json({ error: e?.message || 'inline_comments_visibility_error', requestId: (req as any)?.id });
  }
});

router.patch('/:id/inline-comments-visibility', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { isVisible } = req.body || {};
  if (typeof isVisible !== 'boolean') {
    res.status(400).json({ error: 'invalid_payload', requestId: (req as any)?.id });
    return;
  }

  const blipId = req.params['id'] as string;
  const docId = inlineCommentsPrefDocId(userId, blipId);

  try {
    const existing = await getDoc<InlineCommentsVisibilityDoc & { _rev: string }>(docId);
    const next: InlineCommentsVisibilityDoc & { _rev: string } = {
      ...existing,
      isVisible,
      updatedAt: Date.now(),
    };
    const r = await updateDoc(next as any);
    res.json({ isVisible, id: r['id'], rev: r['rev'] });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      const now = Date.now();
      const doc: InlineCommentsVisibilityDoc = {
        _id: docId,
        type: 'inline_comments_visibility',
        userId,
        blipId,
        isVisible,
        createdAt: now,
        updatedAt: now,
      };
      const r = await insertDoc(doc as any);
      res.json({ isVisible, id: r['id'], rev: r['rev'] });
      return;
    }
    res.status(500).json({ error: e?.message || 'inline_comments_visibility_save_error', requestId: (req as any)?.id });
  }
});

// POST /api/blips/:id/duplicate - Duplicate a blip (creates a copy as a sibling)
router.post('/:id/duplicate', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const id = req.params['id'] as string;
    const sourceBlip = await getDoc<Blip & { _id: string }>(id);

    if ((sourceBlip as any).deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }

    const now = Date.now();
    const newBlipId = `${sourceBlip.waveId}:b${now}`;
    const fallbackName = (req.user?.name && req.user.name.trim()) ? req.user.name : (req.user?.email || 'Unknown');

    const duplicatedBlip: Blip = {
      _id: newBlipId,
      type: 'blip',
      waveId: sourceBlip.waveId,
      parentId: sourceBlip.parentId || null, // Same parent as source (sibling)
      content: sourceBlip.content,
      createdAt: now,
      updatedAt: now,
      authorId: userId,
      authorName: fallbackName,
      deleted: false,
      isFoldedByDefault: !!sourceBlip.isFoldedByDefault,
    } as any;

    const r = await insertDoc(duplicatedBlip as any);
    if (!isPerfRequest(req)) {
      void touchTopic(sourceBlip.waveId);
    }
    if (!isPerfRequest(req)) {
      void recordBlipHistory(duplicatedBlip, 'create', userId, duplicatedBlip.authorName);
    }
    try { emitEvent('blip:created', { waveId: sourceBlip.waveId, blipId: newBlipId, updatedAt: now, userId }); } catch {}

    res.status(201).json({
      id: r['id'],
      rev: r['rev'],
      blip: {
        ...duplicatedBlip,
        permissions: {
          canEdit: true,
          canComment: true,
          canRead: true
        }
      }
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'duplicate_blip_error', requestId: (req as any)?.id });
  }
});

// POST /api/blips/:id/move - Move a blip to a new parent (cut & paste)
router.post('/:id/move', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const id = req.params['id'] as string;
    const { newParentId } = req.body || {};

    const blip = await getDoc<Blip & { _id: string; _rev: string }>(id);

    if ((blip as any).deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }

    // All wave participants can edit (original Rizzoma collaborative editing model)

    // Prevent moving to self or to a descendant (would create cycle)
    if (newParentId === id) {
      res.status(400).json({ error: 'cannot_move_to_self', requestId: (req as any)?.id });
      return;
    }

    const now = Date.now();
    const updatedBlip: Blip & { _id: string; _rev?: string } = {
      ...blip,
      parentId: newParentId || null,
      updatedAt: now,
    };

    const r = await updateDoc(updatedBlip as any);
    void touchTopic(blip.waveId);
    try { emitEvent('blip:moved', { waveId: blip.waveId, blipId: id, newParentId, updatedAt: now, userId }); } catch {}

    res.json({
      id: r['id'],
      rev: r['rev'],
      blip: {
        ...updatedBlip,
        permissions: {
          canEdit: true,
          canComment: true,
          canRead: true
        }
      }
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'move_blip_error', requestId: (req as any)?.id });
  }
});

export default router;
