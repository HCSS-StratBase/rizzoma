import { createHash } from 'node:crypto';
import { parseFragment } from 'parse5';
import { deleteDoc, find, getDoc, getDocsById, insertDoc, updateDoc } from './couch.js';

type Actor = { id: string; email?: string; name?: string };
type ParsedMention = { userId: string; label: string };
type ParsedTask = { taskId: string; assigneeId: string; taskText: string; dueDate?: number };
type ParsedReferences = { mentions: ParsedMention[]; tasks: ParsedTask[] };

type ParticipantDoc = {
  userId?: string;
  status?: 'pending' | 'accepted' | 'declined';
  role?: string;
};

type MentionDoc = {
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
};

type TaskDoc = {
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
};

const CLIENT_TASK_ID = /^task:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function attributes(node: any): Record<string, string> {
  return Object.fromEntries((Array.isArray(node?.attrs) ? node.attrs : []).map((attribute: any) => [String(attribute.name), String(attribute.value)]));
}

function textContent(node: any): string {
  if (node?.nodeName === '#text') return String(node.value || '');
  return (Array.isArray(node?.childNodes) ? node.childNodes : []).map(textContent).join('');
}

function textContentWithout(node: any, excluded: any): string {
  if (node === excluded) return '';
  if (node?.nodeName === '#text') return String(node.value || '');
  return (Array.isArray(node?.childNodes) ? node.childNodes : []).map((child: any) => textContentWithout(child, excluded)).join('');
}

export function parseStoredContentReferences(html: string, blipId: string): ParsedReferences {
  const fragment: any = parseFragment(String(html || ''));
  const mentions = new Map<string, ParsedMention>();
  const tasks = new Map<string, ParsedTask>();
  let anonymousTaskIndex = 0;
  const blockTags = new Set(['p', 'li', 'h1', 'h2', 'h3', 'blockquote', 'div', 'td', 'th']);
  const walk = (node: any, ancestors: any[] = []) => {
    if (node?.tagName === 'span') {
      const attrs = attributes(node);
      const classNames = String(attrs['class'] || '').split(/\s+/);
      if (attrs['data-type'] === 'mention' || classNames.includes('mention')) {
        const userId = String(attrs['data-id'] || '').trim();
        if (userId) {
          const label = String(attrs['data-label'] || textContent(node).replace(/^@/, '') || userId).trim().slice(0, 200);
          mentions.set(userId, { userId, label });
        }
      }
      if (Object.prototype.hasOwnProperty.call(attrs, 'data-task-widget')) {
        const assigneeId = String(attrs['data-assignee-id'] || '').trim();
        const rawTaskId = String(attrs['data-task-id'] || '').trim();
        const taskId = rawTaskId || `task:${createHash('sha256').update(`${blipId}:${anonymousTaskIndex}:${assigneeId}`).digest('hex').slice(0, 32)}`;
        anonymousTaskIndex += 1;
        const rawDueDate = String(attrs['data-due-date'] || '').trim();
        const parsedDueDate = rawDueDate ? new Date(rawDueDate).getTime() : undefined;
        const nearestBlock = [...ancestors].reverse().find((ancestor) => blockTags.has(String(ancestor?.tagName || '')));
        const taskText = textContentWithout(nearestBlock || node, node).replace(/\s+/g, ' ').trim().slice(0, 500);
        tasks.set(taskId, {
          taskId,
          assigneeId,
          taskText,
          dueDate: Number.isFinite(parsedDueDate) ? parsedDueDate : undefined,
        });
      }
    }
    for (const child of Array.isArray(node?.childNodes) ? node.childNodes : []) walk(child, [...ancestors, node]);
  };
  walk(fragment);
  return { mentions: [...mentions.values()], tasks: [...tasks.values()] };
}

async function acceptedRoster(waveId: string): Promise<Set<string>> {
  const roster = new Set<string>();
  const pageSize = 500;
  for (let skip = 0; skip < 10_000; skip += pageSize) {
    const page = await find<ParticipantDoc>({ type: 'participant', waveId }, { limit: pageSize, skip });
    for (const participant of page.docs || []) {
      if (
        participant.userId
        && (participant.status === 'accepted' || participant.status === undefined)
        && !participant.userId.startsWith('invite:')
      ) roster.add(participant.userId);
    }
    if ((page.docs || []).length < pageSize) break;
  }
  const topic = await getDoc<{ type?: string; authorId?: string }>(waveId).catch(() => null);
  if (topic?.type === 'topic' && topic.authorId) roster.add(topic.authorId);
  return roster;
}

export async function validateStoredContentReferences(
  waveId: string,
  blipId: string,
  html: string,
): Promise<ParsedReferences> {
  const references = parseStoredContentReferences(html, blipId);
  if (references.mentions.length === 0 && references.tasks.length === 0) return references;
  const roster = await acceptedRoster(waveId);
  for (const mention of references.mentions) {
    if (!roster.has(mention.userId)) throw new Error('invalid_mention_target');
  }
  for (const task of references.tasks) {
    if (!task.assigneeId || !roster.has(task.assigneeId)) throw new Error('invalid_task_assignee');
    if (!CLIENT_TASK_ID.test(task.taskId) && !/^task:[a-f0-9]{32}$/i.test(task.taskId)) {
      throw new Error('invalid_task_reference');
    }
    const existing = await getDoc<TaskDoc>(task.taskId).catch((error: any) => {
      if (String(error?.message || '').startsWith('404')) return null;
      throw error;
    });
    if (existing && (existing.type !== 'task' || existing.waveId !== waveId || existing.blipId !== blipId)) {
      throw new Error('task_reference_conflict');
    }
  }
  return references;
}

function mentionDocId(blipId: string, userId: string): string {
  return `mention:${createHash('sha256').update(`${blipId}:${userId}`).digest('hex')}`;
}

export async function reconcileStoredContentReferences(
  waveId: string,
  blipId: string,
  references: ParsedReferences,
  actor: Actor,
): Promise<void> {
  const now = Date.now();
  const actorName = actor.name?.trim() || actor.email?.split('@')[0] || 'Unknown';
  const userIds = [...new Set([
    ...references.mentions.map((mention) => mention.userId),
    ...references.tasks.map((task) => task.assigneeId),
  ])];
  const users = await getDocsById<{ type?: string; name?: string; email?: string }>(userIds);

  const existingMentions = await find<MentionDoc>(
    { type: 'mention', blipId },
    { limit: 1_000, use_index: 'idx_mention_blip' },
  );
  const desiredMentionIds = new Set<string>();
  for (const mention of references.mentions) {
    const id = mentionDocId(blipId, mention.userId);
    desiredMentionIds.add(id);
    const existing = existingMentions.docs.find((doc) => doc._id === id);
    const user = users[mention.userId]?.type === 'user' ? users[mention.userId] : undefined;
    const trustedLabel = user?.name || user?.email?.split('@')[0] || mention.userId;
    if (existing) {
      const next = { ...existing, mentionText: `@${trustedLabel}` };
      if (next.mentionText !== existing.mentionText) await updateDoc(next as any);
    } else {
      await insertDoc({
        _id: id,
        type: 'mention',
        topicId: waveId,
        blipId,
        mentionedUserId: mention.userId,
        mentionText: `@${trustedLabel}`,
        authorId: actor.id,
        authorName: actorName,
        isRead: false,
        createdAt: now,
      } as MentionDoc);
    }
  }
  for (const stale of existingMentions.docs.filter((doc) => !desiredMentionIds.has(doc._id))) {
    if (stale._rev) await deleteDoc(stale._id, stale._rev);
  }

  const existingTasks = await find<TaskDoc>(
    { type: 'task', blipId },
    { limit: 1_000, use_index: 'idx_task_blip_createdAt' },
  );
  const desiredTaskIds = new Set(references.tasks.map((task) => task.taskId));
  for (const task of references.tasks) {
    const existing = existingTasks.docs.find((doc) => doc._id === task.taskId);
    const assignee = users[task.assigneeId]?.type === 'user' ? users[task.assigneeId] : undefined;
    const assigneeName = assignee?.name || assignee?.email?.split('@')[0] || task.assigneeId;
    if (existing) {
      await updateDoc({
        ...existing,
        taskText: task.taskText || `Task for ${assigneeName}`,
        assigneeId: task.assigneeId,
        assigneeName,
        dueDate: task.dueDate,
        updatedAt: now,
      } as any);
    } else {
      await insertDoc({
        _id: task.taskId,
        type: 'task',
        waveId,
        topicId: waveId,
        blipId,
        taskText: task.taskText || `Task for ${assigneeName}`,
        assigneeId: task.assigneeId,
        assigneeName,
        authorId: actor.id,
        authorName: actorName,
        dueDate: task.dueDate,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
      } as TaskDoc);
    }
  }
  for (const stale of existingTasks.docs.filter((doc) => !desiredTaskIds.has(doc._id))) {
    if (stale._rev) await deleteDoc(stale._id, stale._rev);
  }
}
