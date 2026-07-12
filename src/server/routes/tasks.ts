/**
 * Tasks Routes
 *
 * API endpoints for creating, retrieving, updating, and toggling user tasks.
 * A task is a persistent CouchDB doc (`type: 'task'`) backing each `~task`
 * widget a user inserts into a blip. The Tasks sidebar reads these docs.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { noStore } from '../middleware/noStore.js';
import { find, updateDoc, getDoc, getDocsById, insertDoc } from '../lib/couch.js';
import { randomUUID } from 'crypto';
import { identityFromRequest, requireWaveAccess, resolveBlipAccess, resolveWaveAccess } from '../lib/access.js';
import { csrfProtect } from '../middleware/csrf.js';

const router = Router();

interface TaskDoc {
  _id: string;
  _rev?: string;
  type: 'task';
  waveId: string;
  topicId: string;
  blipId: string;
  taskText: string;
  assigneeId: string;
  assigneeName?: string;
  authorId: string;
  authorName: string;
  dueDate?: number;
  isCompleted: boolean;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

// GET /api/tasks - List tasks assigned to the current user.
// Indexed + batched lookups; see /api/mentions for the same pattern.
// noStore: per-user task list including isCompleted state
router.get('/', noStore, requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const filter = req.query['filter'] as string; // 'all' | 'pending' | 'completed'
  const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 100);
  const offset = parseInt(req.query['offset'] as string) || 0;

  try {
    const selector: Record<string, unknown> = {
      type: 'task',
      assigneeId: userId,
      // Bound createdAt so Mango picks idx_task_assignee_createdAt
      // instead of a full-DB scan (mirrors the Mentions fix).
      createdAt: { $gt: 0 },
    };

    if (filter === 'pending') {
      selector['isCompleted'] = false;
    } else if (filter === 'completed') {
      selector['isCompleted'] = true;
    }

    const result = await find<TaskDoc>(selector, {
      limit,
      skip: offset,
      sort: [{ createdAt: 'desc' }],
      use_index: filter === 'pending' || filter === 'completed'
        ? 'idx_task_assignee_isCompleted'
        : 'idx_task_assignee_createdAt',
    });

    const identity = identityFromRequest(req);
    const accessByWave = new Map<string, Promise<boolean>>();
    const canReadWave = (waveId: string) => {
      if (!accessByWave.has(waveId)) {
        accessByWave.set(waveId, resolveWaveAccess(waveId, identity).then((access) => access.canRead).catch(() => false));
      }
      return accessByWave.get(waveId)!;
    };
    const visibleFlags = await Promise.all(result.docs.map((doc) => canReadWave(doc.waveId)));
    const visibleDocs = result.docs.filter((_, index) => visibleFlags[index]);

    // Batch topic title lookups in a single _all_docs request.
    const topicIds = [...new Set(visibleDocs.map(d => d.topicId).filter(Boolean))];
    const topicDocs = await getDocsById<{ title?: string }>(topicIds);
    const topicTitles: Record<string, string> = {};
    for (const id of topicIds) {
      topicTitles[id] = topicDocs[id]?.title || 'Untitled Topic';
    }

    const tasks = visibleDocs.map(doc => ({
      id: doc._id,
      waveId: doc.waveId,
      topicId: doc.topicId,
      topicTitle: topicTitles[doc.topicId] || 'Untitled Topic',
      blipId: doc.blipId,
      taskText: doc.taskText,
      assigneeId: doc.assigneeId,
      assignee: doc.assigneeName || 'you',
      authorId: doc.authorId,
      authorName: doc.authorName,
      dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : undefined,
      isCompleted: doc.isCompleted,
      completedAt: doc.completedAt ? new Date(doc.completedAt).toISOString() : undefined,
      createdAt: new Date(doc.createdAt).toISOString(),
    }));

    // Capped count queries — no more unbounded full scans.
    const COUNT_CAP = 500;
    const pendingResult = await find<{ _id: string }>(
      { type: 'task', assigneeId: userId, isCompleted: false },
      { limit: COUNT_CAP, use_index: 'idx_task_assignee_isCompleted' },
    );
    const completedResult = await find<{ _id: string }>(
      { type: 'task', assigneeId: userId, isCompleted: true },
      { limit: COUNT_CAP, use_index: 'idx_task_assignee_isCompleted' },
    );
    const countDocs = [...(pendingResult.docs as any[]), ...(completedResult.docs as any[])];
    const countVisible = await Promise.all(countDocs.map((doc) => canReadWave(String(doc.waveId || ''))));
    const pendingVisible = pendingResult.docs.filter((_, index) => countVisible[index]).length;
    const completedVisible = completedResult.docs.filter((_, index) => countVisible[pendingResult.docs.length + index]).length;

    res.json({
      tasks,
      total: pendingVisible + completedVisible,
      pendingCount: pendingVisible,
      completedCount: completedVisible,
      // Filtering revoked/private waves after the indexed query must not make
      // clients stop while a later raw page can still contain visible tasks.
      hasMore: result.docs.length === limit,
    });
  } catch (e: any) {
    console.error('[tasks] list error', e);
    res.status(500).json({ error: e?.message || 'list_tasks_error' });
  }
});

// GET /api/tasks/by-blip/:blipId - List tasks anchored to a specific blip.
// Used by the TaskWidget node view to hydrate current completion state for
// every task the blip's content references.
router.get('/by-blip/:blipId', requireAuth, async (req, res): Promise<void> => {
  const blipId = String(req.params['blipId']);
  try {
    const resolved = await resolveBlipAccess(blipId, {
      id: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
    });
    if (!resolved.access.canRead) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const result = await find<TaskDoc>(
      { type: 'task', blipId, createdAt: { $gt: 0 } },
      {
        limit: 100,
        sort: [{ createdAt: 'desc' }],
        use_index: 'idx_task_wave_blip_createdAt',
      },
    );
    res.json({
      tasks: result.docs.map(doc => ({
        id: doc._id,
        blipId: doc.blipId,
        taskText: doc.taskText,
        assigneeId: doc.assigneeId,
        assigneeName: doc.assigneeName,
        dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : undefined,
        isCompleted: doc.isCompleted,
      })),
    });
  } catch (e: any) {
    console.error('[tasks] by-blip error', e);
    res.status(500).json({ error: e?.message || 'list_by_blip_error' });
  }
});

// POST /api/tasks - Create a new task backing a ~task widget instance.
// Called by TaskWidget.command() when the user picks an assignee, so the
// sidebar can find it immediately.
router.post('/', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const author = req.user!;
  const {
    waveId,
    topicId,
    blipId,
    taskText,
    assigneeId,
    assigneeName,
    dueDate,
  } = req.body || {};

  if (!waveId || !topicId || !assigneeId) {
    res.status(400).json({ error: 'missing_required_fields' });
    return;
  }

  if (String(waveId) !== String(topicId)) {
    res.status(400).json({ error: 'wave_topic_mismatch' });
    return;
  }

  try {
    if (blipId) {
      const resolved = await resolveBlipAccess(String(blipId), {
        id: author.id,
        email: author.email,
        name: author.name,
      });
      if (String(resolved.blip.waveId) !== String(waveId)) {
        res.status(400).json({ error: 'blip_wave_mismatch' });
        return;
      }
      if (!resolved.access.canEdit) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
    } else {
      const access = await requireWaveAccess(req, res, String(waveId), 'edit');
      if (!access) return;
    }
  } catch (error: any) {
    if (String(error?.message || '').startsWith('404') || String(error?.message || '').startsWith('410')) {
      res.status(404).json({ error: 'blip_not_found' });
      return;
    }
    throw error;
  }

  const now = Date.now();
  const doc: TaskDoc = {
    _id: `task:${randomUUID()}`,
    type: 'task',
    waveId: String(waveId),
    topicId: String(topicId),
    blipId: String(blipId || ''),
    taskText: String(taskText || ''),
    assigneeId: String(assigneeId),
    assigneeName: assigneeName ? String(assigneeName) : undefined,
    authorId: author.id,
    authorName: author.name || author.email?.split('@')[0] || 'Unknown',
    dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
    isCompleted: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const inserted = await insertDoc(doc);
    res.json({
      id: inserted.id,
      taskId: inserted.id,
      waveId: doc.waveId,
      topicId: doc.topicId,
      blipId: doc.blipId,
      taskText: doc.taskText,
      assigneeId: doc.assigneeId,
      assigneeName: doc.assigneeName,
      dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : undefined,
      isCompleted: false,
      createdAt: new Date(now).toISOString(),
    });
  } catch (e: any) {
    console.error('[tasks] create error', e);
    res.status(500).json({ error: e?.message || 'create_task_error' });
  }
});

// POST /api/tasks/:id/toggle - Toggle task completion status.
router.post('/:id/toggle', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const taskId = String(req.params['id']);

  try {
    const doc = await getDoc<TaskDoc & { _rev: string }>(taskId);

    if (!doc || doc.type !== 'task') {
      res.status(404).json({ error: 'task_not_found' });
      return;
    }

    const access = await resolveWaveAccess(doc.waveId, identityFromRequest(req));
    if (!access.canRead) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (doc.assigneeId !== userId && doc.authorId !== userId) {
      res.status(403).json({ error: 'not_authorized' });
      return;
    }

    doc.isCompleted = !doc.isCompleted;
    doc.completedAt = doc.isCompleted ? Date.now() : undefined;
    doc.updatedAt = Date.now();

    await updateDoc(doc as any);

    res.json({
      success: true,
      id: doc._id,
      isCompleted: doc.isCompleted,
      completedAt: doc.completedAt ? new Date(doc.completedAt).toISOString() : undefined,
    });
  } catch (e: any) {
    console.error('[tasks] toggle error', e);
    res.status(500).json({ error: e?.message || 'toggle_task_error' });
  }
});

// PATCH /api/tasks/:id - Update task (due date, text, etc.)
router.patch('/:id', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const taskId = String(req.params['id']);
  const updates = req.body || {};

  try {
    const doc = await getDoc<TaskDoc & { _rev: string }>(taskId);

    if (!doc || doc.type !== 'task') {
      res.status(404).json({ error: 'task_not_found' });
      return;
    }


    const access = await resolveWaveAccess(doc.waveId, identityFromRequest(req));
    const completionOnly = Object.keys(updates).every((key) => key === 'isCompleted');
    if (!(completionOnly ? access.canRead : access.canEdit)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (doc.assigneeId !== userId && doc.authorId !== userId) {
      res.status(403).json({ error: 'not_authorized' });
      return;
    }

    if (updates.taskText !== undefined) doc.taskText = String(updates.taskText);
    if (updates.dueDate !== undefined) {
      doc.dueDate = updates.dueDate ? new Date(updates.dueDate).getTime() : undefined;
    }
    if (updates.isCompleted !== undefined) {
      doc.isCompleted = Boolean(updates.isCompleted);
      doc.completedAt = doc.isCompleted ? Date.now() : undefined;
    }

    doc.updatedAt = Date.now();
    await updateDoc(doc as any);

    res.json({ success: true });
  } catch (e: any) {
    console.error('[tasks] update error', e);
    res.status(500).json({ error: e?.message || 'update_task_error' });
  }
});

export default router;
