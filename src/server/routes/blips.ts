import { Router } from 'express';
import { getDoc, updateDoc, insertDoc, find } from '../lib/couch.js';
import { emitEvent, revokeBlipSockets } from '../lib/socket.js';
import { requireAuth } from '../middleware/auth.js';
import { noStore } from '../middleware/noStore.js';
import { invalidateUnreadCacheForWave } from '../lib/unread.js';
import type { Blip } from '../schemas/wave.js';
import { identityFromRequest, requireWaveAccess, resolveBlipAccess } from '../lib/access.js';
import { csrfProtect } from '../middleware/csrf.js';
import { randomUUID } from 'node:crypto';

type LinkDoc = {
  _id?: string;
  type: 'link';
  fromBlipId: string;
  toBlipId: string;
  waveId: string;
  authorId?: string;
  createdAt: number;
};

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
      _id: `blip_history:${blip._id}:${now}:${randomUUID()}`,
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
  blip: Blip & { _id: string; _rev?: string },
  userId: string,
  allowSubtree: boolean,
): Promise<string[]> {
  try {
    const docs: Array<Blip & { _rev?: string }> = [];
    const pageSize = 500;
    for (let skip = 0; ; skip += pageSize) {
      const result = await find<Blip & { _rev?: string }>(
        { type: 'blip', waveId: blip.waveId },
        { limit: pageSize, skip },
      );
      const page = result.docs || [];
      docs.push(...page);
      if (page.length < pageSize) break;
      if (docs.length >= 100_000) throw new Error('blip_subtree_too_large');
    }
    if (!docs.some((doc) => doc._id === blip._id)) docs.push(blip);
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

    // Commenters may remove only their own leaf. Cascading a commenter-owned
    // parent would otherwise erase owner/editor replies they cannot edit.
    if (!allowSubtree && targetIds.size > 1) throw new Error('commenter_cannot_delete_subtree');

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
    return [...targetIds];
  } catch (error) {
    console.error('Failed to mark blip descendants as deleted', error);
    throw error;
  }
}

const router = Router();

type StoredBlip = Blip & { _id: string; _rev?: string };

async function loadBlipDoc(id: string): Promise<StoredBlip> {
  const doc = await getDoc<unknown>(id) as Partial<StoredBlip> | null;
  if (
    !doc
    || doc.type !== 'blip'
    || typeof doc._id !== 'string'
    || typeof doc.waveId !== 'string'
    || !doc.waveId
  ) {
    // Keep every blip-specific route type-safe. A task, mention, participant,
    // or other Couch document must never be mutated through a blip endpoint.
    throw new Error('404 not_a_blip');
  }
  return doc as StoredBlip;
}

async function validateNewParent(
  blip: Blip & { _id: string },
  parentId: string | null,
): Promise<void> {
  if (!parentId) return;
  if (parentId === blip._id) throw new Error('cannot_move_to_self');
  let current: any;
  try {
    current = await getDoc<any>(parentId);
  } catch (error: any) {
    if (String(error?.message || '').startsWith('404')) throw new Error('parent_not_found');
    throw error;
  }
  const visited = new Set<string>();
  for (let depth = 0; depth < 1_000; depth += 1) {
    const currentId = String(current?._id || '');
    if (!currentId || current.type !== 'blip') throw new Error('invalid_parent');
    if (current.deleted) throw new Error('parent_deleted');
    if (String(current.waveId) !== String(blip.waveId)) throw new Error('cross_wave_parent');
    if (currentId === blip._id) throw new Error('cannot_move_to_descendant');
    if (visited.has(currentId)) throw new Error('parent_cycle_detected');
    visited.add(currentId);
    const nextParentId = current.parentId ? String(current.parentId) : '';
    if (!nextParentId) return;
    try {
      current = await getDoc<any>(nextParentId);
    } catch (error: any) {
      if (String(error?.message || '').startsWith('404')) throw new Error('parent_chain_broken');
      throw error;
    }
  }
  throw new Error('parent_depth_exceeded');
}

async function moveBlip(req: any, res: any, requestedParentId: unknown): Promise<void> {
  const id = String(req.params?.['id'] || '');
  if (requestedParentId !== null && requestedParentId !== undefined && typeof requestedParentId !== 'string') {
    res.status(400).json({ error: 'invalid_parent', requestId: req.id });
    return;
  }
  const parentId = typeof requestedParentId === 'string' && requestedParentId.trim()
    ? requestedParentId.trim()
    : null;
  try {
    const blip = await loadBlipDoc(id);
    if (blip.deleted) {
      res.status(410).json({ error: 'deleted', requestId: req.id });
      return;
    }
    const access = await requireWaveAccess(req, res, blip.waveId, 'edit');
    if (!access) return;
    await validateNewParent(blip, parentId);
    const updatedAt = Date.now();
    const updatedBlip = { ...blip, parentId, updatedAt };
    const result = await updateDoc(updatedBlip as any);
    void touchTopic(blip.waveId);
    try { emitEvent('blip:moved', { waveId: blip.waveId, blipId: id, newParentId: parentId, updatedAt, userId: req.user!.id }); } catch {}
    res.json({
      id: result['id'],
      rev: result['rev'],
      blip: {
        ...updatedBlip,
        permissions: {
          role: access.role,
          canEdit: access.canEdit,
          canComment: access.canComment,
          canRead: access.canRead,
          canManage: access.canManage,
        },
      },
    });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'parent_not_found') {
      res.status(404).json({ error: code, requestId: req.id });
      return;
    }
    if (['cannot_move_to_self', 'invalid_parent', 'parent_deleted', 'cross_wave_parent', 'cannot_move_to_descendant', 'parent_cycle_detected', 'parent_chain_broken', 'parent_depth_exceeded'].includes(code)) {
      res.status(400).json({ error: code, requestId: req.id });
      return;
    }
    if (code.startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: req.id });
      return;
    }
    res.status(500).json({ error: code || 'move_blip_error', requestId: req.id });
  }
}

// PATCH /api/blips/:id/reparent { parentId }
router.patch('/:id/reparent', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  await moveBlip(req, res, (req.body || {}).parentId);
});

// POST /api/blips - Create a new blip
router.post('/', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const { waveId, parentId, content, anchorPosition } = req.body || {};

    if (!waveId || !content) {
      res.status(400).json({ error: 'missing_required_fields', requestId: (req as any)?.id });
      return;
    }

    const access = await requireWaveAccess(req, res, String(waveId), 'comment');
    if (!access) return;

    const now = Date.now();
    const blipId = `${waveId}:b${randomUUID()}`;
    if (parentId !== null && parentId !== undefined && typeof parentId !== 'string') {
      res.status(400).json({ error: 'invalid_parent', requestId: (req as any)?.id });
      return;
    }
    const normalizedParentId = typeof parentId === 'string' && parentId.trim() ? parentId.trim() : null;
    try {
      await validateNewParent({ _id: blipId, waveId } as Blip & { _id: string }, normalizedParentId);
    } catch (error: any) {
      const code = String(error?.message || 'invalid_parent');
      res.status(code === 'parent_not_found' ? 404 : 400).json({ error: code, requestId: (req as any)?.id });
      return;
    }

    const fallbackName = (req.user?.name && req.user.name.trim()) ? req.user.name : (req.user?.email || 'Unknown');
    const blip: Blip = {
      _id: blipId,
      type: 'blip',
      waveId,
      parentId: normalizedParentId,
      content,
      createdAt: now,
      updatedAt: now,
      authorId: userId,
      authorName: fallbackName,
      deleted: false,
      isFoldedByDefault: false,
      // Store anchor position for inline blips created via Ctrl+Enter
      ...(typeof anchorPosition === 'number' ? { anchorPosition } : {}),
    } as any;

    const r = await insertDoc(blip as any);
    invalidateUnreadCacheForWave(waveId);
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
          role: access.role,
          canEdit: access.canEdit,
          canComment: access.canComment,
          canRead: access.canRead,
          canManage: access.canManage,
        }
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'create_blip_error', requestId: (req as any)?.id });
  }
});

// PUT /api/blips/:id - Update blip content
router.put('/:id', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;

  try {
    const id = req.params['id'] as string;
    const { content } = req.body || {};
    
    if (!content) {
      res.status(400).json({ error: 'missing_content', requestId: (req as any)?.id });
      return;
    }

    const blip = await loadBlipDoc(id);
    if (blip.deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }
    const access = await requireWaveAccess(req, res, blip.waveId, 'edit');
    if (!access) return;

    const updatedBlip: Blip & { _id: string; _rev?: string } = {
      ...blip,
      _id: blip._id || id,
      content,
      updatedAt: Date.now()
    };

    const r = await updateDoc(updatedBlip as any);
    invalidateUnreadCacheForWave(blip.waveId);
    if (!isPerfRequest(req)) {
      void touchTopic(blip.waveId);
    }
    if (!isPerfRequest(req)) {
      const actorName = (req.user?.name && req.user.name.trim()) ? req.user.name : (req.user?.email || 'Unknown');
      void recordBlipHistory(updatedBlip, 'update', userId, actorName);
    }
    try { emitEvent('blip:updated', { waveId: blip.waveId, blipId: blip._id, updatedAt: updatedBlip.updatedAt, userId }); } catch {}
    res.json({ 
      id: r['id'], 
      rev: r['rev'],
      blip: {
        ...updatedBlip,
        permissions: {
          role: access.role,
          canEdit: access.canEdit,
          canComment: access.canComment,
          canRead: access.canRead,
          canManage: access.canManage,
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
  try {
    const id = req.params['id'] as string;
    const blip = await loadBlipDoc(id);
    if ((blip as any).deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }
    const access = await requireWaveAccess(req, res, blip.waveId, 'read');
    if (!access) return;
    
    res.json({
      ...blip,
      permissions: {
        role: access.role,
        canEdit: access.canEdit,
        canComment: access.canComment,
        canRead: access.canRead,
        canManage: access.canManage,
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

router.delete('/:id', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;

  try {
    const id = req.params['id'] as string;
    const blip = await loadBlipDoc(id);
    if (blip._id === blip.waveId) {
      res.status(400).json({ error: 'cannot_delete_root', requestId: (req as any)?.id });
      return;
    }
    if (blip.deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }
    const access = await requireWaveAccess(req, res, blip.waveId, 'read');
    if (!access) return;
    const isAuthor = !blip.authorId || blip.authorId === userId;
    if (!access.canManage && !access.canEdit && !(access.canComment && isAuthor)) {
      console.warn('[blips] forbidden delete', { blipId: id, userId, ownerId: blip.authorId, requestId: (req as any)?.id });
      res.status(403).json({ error: 'forbidden', requestId: (req as any)?.id });
      return;
    }

    const deletedBlipIds = await markBlipAndDescendantsDeleted(blip, userId, access.canManage || access.canEdit);
    revokeBlipSockets(deletedBlipIds);
    invalidateUnreadCacheForWave(blip.waveId);
    void touchTopic(blip.waveId);
    try { emitEvent('blip:deleted', { waveId: blip.waveId, blipId: blip._id, descendantIds: deletedBlipIds.slice(1), userId, deletedAt: Date.now() }); } catch {}
    res.json({ deleted: true, id });
  } catch (e: any) {
    if (String(e?.message) === 'commenter_cannot_delete_subtree') {
      res.status(403).json({ error: 'commenter_cannot_delete_subtree', requestId: (req as any)?.id });
      return;
    }
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'delete_blip_error', requestId: (req as any)?.id });
  }
});

// GET /api/blips/:id/links → { out: [], in: [] }
// BUG #43 (2026-04-21): moved here from linksRouter because the linksRouter
// used to be mounted at /api, and its /blips/:id/links route had to live
// there to resolve correctly. Now that linksRouter is mounted at /api/links,
// this handler belongs in the blipsRouter (mounted at /api/blips).
router.get('/:id/links', async (req, res): Promise<void> => {
  const id = req.params['id'] as string;
  try {
    const blip = await loadBlipDoc(id);
    const access = await requireWaveAccess(req, res, blip.waveId, 'read');
    if (!access) return;
    const out = (await find<LinkDoc>({ type: 'link', fromBlipId: id }, { limit: 1000 })).docs || [];
    const inn = (await find<LinkDoc>({ type: 'link', toBlipId: id }, { limit: 1000 })).docs || [];
    const identity = identityFromRequest(req);
    const canReadBothEnds = async (link: LinkDoc): Promise<boolean> => {
      try {
        const [from, to] = await Promise.all([
          link.fromBlipId === id ? Promise.resolve({ access }) : resolveBlipAccess(link.fromBlipId, identity),
          link.toBlipId === id ? Promise.resolve({ access }) : resolveBlipAccess(link.toBlipId, identity),
        ]);
        return from.access.canRead && to.access.canRead;
      } catch {
        return false;
      }
    };
    const [visibleOutFlags, visibleInFlags] = await Promise.all([
      Promise.all(out.map(canReadBothEnds)),
      Promise.all(inn.map(canReadBothEnds)),
    ]);
    const visibleOut = out.filter((_, index) => visibleOutFlags[index]);
    const visibleIn = inn.filter((_, index) => visibleInFlags[index]);
    res.json({
      out: visibleOut.map((d) => ({ fromBlipId: d.fromBlipId, toBlipId: d.toBlipId, waveId: d.waveId })),
      in: visibleIn.map((d) => ({ fromBlipId: d.fromBlipId, toBlipId: d.toBlipId, waveId: d.waveId })),
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'links_error', requestId: (req as any)?.id });
  }
});

// GET /api/blips/:id/history - Blip playback history
router.get('/:id/history', requireAuth, async (req, res): Promise<void> => {
  try {
    const blipId = req.params['id'] as string;
    const blip = await loadBlipDoc(blipId);
    const access = await requireWaveAccess(req, res, blip.waveId, 'read');
    if (!access) return;
    const result = await find<BlipHistoryDoc>({ type: 'blip_history', blipId }, { limit: 200 });
    const history = (result.docs || [])
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .map(({ _id, _rev, type, ...rest }) => ({ id: _id, ...rest }));
    res.json({ history });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'blip_history_error', requestId: (req as any)?.id });
  }
});

// GET /api/blips?waveId=:waveId - Get all blips for a wave/topic
// noStore: blips returned here carry per-user permissions fields
// (canEdit / canComment / canRead) and isRead markers — cached body
// would show the wrong permissions after a session switch and would
// mask mark-read state changes.
router.get('/', noStore, async (req, res): Promise<void> => {
  const waveId = (req.query as Record<string, string | undefined>)['waveId'];
  const limitParam = (req.query as Record<string, string | undefined>)['limit'];
  const bookmark = (req.query as Record<string, string | undefined>)['bookmark'];
  
  if (!waveId) {
    res.status(400).json({ error: 'missing_waveId', requestId: (req as any)?.id });
    return;
  }
  
  try {
    const access = await requireWaveAccess(req, res, waveId, 'read');
    if (!access) return;
    const limit = Math.min(Math.max(parseInt(String(limitParam ?? '100'), 10) || 100, 1), 500);
    // Use the find method to query blips by waveId
    // Sort by [type, waveId, createdAt] to leverage idx_blip_wave_createdAt index
    const result = await find<Blip>(
      { type: 'blip', waveId },
      {
        limit,
        sort: [{ type: 'asc' as const }, { waveId: 'asc' as const }, { createdAt: 'asc' as const }],
        ...(bookmark ? { bookmark } : {}),
      }
    );
    const blips = result.docs.filter((blip) => !(blip as any).deleted);
    
    res.json({
      blips: blips.map(blip => ({
        ...blip,
        isFoldedByDefault: !!(blip as any).isFoldedByDefault,
        permissions: {
          role: access.role,
          canEdit: access.canEdit,
          canComment: access.canComment,
          canRead: access.canRead,
          canManage: access.canManage,
        }
      })),
      nextBookmark: result.docs.length === limit && result.bookmark ? result.bookmark : null,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'get_blips_error', requestId: (req as any)?.id });
  }
});

// noStore: per-user collapse preference — cached body would show the
// other user's preference after a session switch.
router.get('/:id/collapse-default', noStore, requireAuth, async (req, res): Promise<void> => {
  try {
    const blipId = req.params['id'] as string;
    const doc = await loadBlipDoc(blipId);
    const access = await requireWaveAccess(req, res, doc.waveId, 'read');
    if (!access) return;
    res.json({ collapseByDefault: !!doc.isFoldedByDefault });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'collapse_pref_error', requestId: (req as any)?.id });
  }
});

router.patch('/:id/collapse-default', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const { collapseByDefault } = req.body || {};
  if (typeof collapseByDefault !== 'boolean') {
    res.status(400).json({ error: 'invalid_payload', requestId: (req as any)?.id });
    return;
  }

  const blipId = req.params['id'] as string;
  try {
    const existing = await loadBlipDoc(blipId);
    const access = await requireWaveAccess(req, res, existing.waveId, 'edit');
    if (!access) return;
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

// noStore: per-user inline-comments visibility preference
router.get('/:id/inline-comments-visibility', noStore, requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const blipId = req.params['id'] as string;
  try {
    const blip = await loadBlipDoc(blipId);
    const access = await requireWaveAccess(req, res, blip.waveId, 'read');
    if (!access) return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'blip_access_error', requestId: (req as any)?.id });
    return;
  }
  try {
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

router.patch('/:id/inline-comments-visibility', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const { isVisible } = req.body || {};
  if (typeof isVisible !== 'boolean') {
    res.status(400).json({ error: 'invalid_payload', requestId: (req as any)?.id });
    return;
  }

  const blipId = req.params['id'] as string;
  const docId = inlineCommentsPrefDocId(userId, blipId);

  try {
    const blip = await loadBlipDoc(blipId);
    const access = await requireWaveAccess(req, res, blip.waveId, 'read');
    if (!access) return;
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.status(404).json({ error: 'not_found', requestId: (req as any)?.id });
      return;
    }
    res.status(500).json({ error: e?.message || 'blip_access_error', requestId: (req as any)?.id });
    return;
  }
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
router.post('/:id/duplicate', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const id = req.params['id'] as string;
    const sourceBlip = await loadBlipDoc(id);

    if ((sourceBlip as any).deleted) {
      res.status(410).json({ error: 'deleted', requestId: (req as any)?.id });
      return;
    }
    const access = await requireWaveAccess(req, res, sourceBlip.waveId, 'edit');
    if (!access) return;

    const now = Date.now();
    const newBlipId = `${sourceBlip.waveId}:b${randomUUID()}`;
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
          role: access.role,
          canEdit: access.canEdit,
          canComment: access.canComment,
          canRead: access.canRead,
          canManage: access.canManage,
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
router.post('/:id/move', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  await moveBlip(req, res, (req.body || {}).newParentId);
});

export default router;
