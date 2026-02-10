/**
 * Tasks Routes
 *
 * API endpoints for retrieving and managing user tasks.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { find, updateDoc, getDoc } from '../lib/couch.js';

const router = Router();

interface TaskDoc {
  _id: string;
  _rev?: string;
  type: 'task';
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

// GET /api/tasks - Get tasks for current user
router.get('/', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const filter = req.query['filter'] as string; // 'all' | 'pending' | 'completed'
  const limit = Math.min(parseInt(req.query['limit'] as string) || 50, 100);
  const offset = parseInt(req.query['offset'] as string) || 0;

  try {
    const selector: Record<string, unknown> = {
      type: 'task',
      assigneeId: userId,
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
    });

    // Get topic titles for each task
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

    const tasks = result.docs.map(doc => ({
      id: doc._id,
      topicId: doc.topicId,
      topicTitle: topicTitles[doc.topicId],
      blipId: doc.blipId,
      taskText: doc.taskText,
      assignee: doc.assigneeName || 'you',
      authorName: doc.authorName,
      dueDate: doc.dueDate ? new Date(doc.dueDate).toISOString() : undefined,
      isCompleted: doc.isCompleted,
      completedAt: doc.completedAt ? new Date(doc.completedAt).toISOString() : undefined,
      createdAt: new Date(doc.createdAt).toISOString(),
    }));

    // Get counts
    const allResult = await find<TaskDoc>({ type: 'task', assigneeId: userId }, { limit: 0 });
    const pendingResult = await find<TaskDoc>({ type: 'task', assigneeId: userId, isCompleted: false }, { limit: 0 });
    const completedResult = await find<TaskDoc>({ type: 'task', assigneeId: userId, isCompleted: true }, { limit: 0 });

    res.json({
      tasks,
      total: allResult.docs?.length || 0,
      pendingCount: pendingResult.docs?.length || 0,
      completedCount: completedResult.docs?.length || 0,
    });
  } catch (e: any) {
    console.error('[tasks] list error', e);
    res.status(500).json({ error: e?.message || 'list_tasks_error' });
  }
});

// POST /api/tasks/:id/toggle - Toggle task completion status
router.post('/:id/toggle', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const taskId = String(req.params['id']);

  try {
    const doc = await getDoc<TaskDoc & { _rev: string }>(taskId);

    if (!doc || doc.type !== 'task') {
      res.status(404).json({ error: 'task_not_found' });
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
      isCompleted: doc.isCompleted,
      completedAt: doc.completedAt ? new Date(doc.completedAt).toISOString() : undefined,
    });
  } catch (e: any) {
    console.error('[tasks] toggle error', e);
    res.status(500).json({ error: e?.message || 'toggle_task_error' });
  }
});

// PATCH /api/tasks/:id - Update task (due date, text, etc.)
router.patch('/:id', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const taskId = String(req.params['id']);
  const updates = req.body || {};

  try {
    const doc = await getDoc<TaskDoc & { _rev: string }>(taskId);

    if (!doc || doc.type !== 'task') {
      res.status(404).json({ error: 'task_not_found' });
      return;
    }

    if (doc.assigneeId !== userId && doc.authorId !== userId) {
      res.status(403).json({ error: 'not_authorized' });
      return;
    }

    // Only allow certain fields to be updated
    if (updates.taskText !== undefined) {
      doc.taskText = String(updates.taskText);
    }
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
