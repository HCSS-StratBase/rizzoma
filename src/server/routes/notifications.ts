/**
 * Notification Routes
 *
 * API endpoints for sending invites and managing notification preferences.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { noStore } from '../middleware/noStore.js';
import { sendInviteEmail } from '../services/email.js';
import { getDoc, insertDoc, updateDoc, find } from '../lib/couch.js';
import { requireWaveAccess } from '../lib/access.js';
import { csrfProtect } from '../middleware/csrf.js';
import { buildInviteUrl, createInviteToken, invitationTokenDocId, resolveInviteBaseUrl, sortParticipantCandidates } from '../lib/invitations.js';
import type { WaveParticipant } from '../schemas/wave.js';
import { refreshWaveSocketAccess } from '../lib/socket.js';
import { inviteRateLimit } from '../middleware/inviteRateLimit.js';
import { z } from 'zod';

const router = Router();

// User notification preferences document type
interface NotificationPreferencesDoc {
  _id: string;
  _rev?: string;
  type: 'notification_preferences';
  userId: string;
  emailEnabled: boolean;
  digestFrequency: 'none' | 'daily' | 'weekly';
  inviteNotifications: boolean;
  mentionNotifications: boolean;
  replyNotifications: boolean;
  createdAt: number;
  updatedAt: number;
}

const prefsDocId = (userId: string) => `notification_prefs:${userId}`;

// Default preferences
const defaultPreferences: Omit<NotificationPreferencesDoc, '_id' | 'type' | 'userId' | 'createdAt' | 'updatedAt'> = {
  emailEnabled: true,
  digestFrequency: 'weekly',
  inviteNotifications: true,
  mentionNotifications: true,
  replyNotifications: true,
};

// POST /api/notifications/invite - Send invite to topic
router.post('/invite', requireAuth, csrfProtect(), inviteRateLimit, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const userName = req.user?.name || req.user?.email || 'Someone';

  try {
    const parsed = z.object({
      topicId: z.string().min(1).max(300),
      recipientEmail: z.string().trim().email().max(320).transform((email) => email.toLowerCase()),
      recipientName: z.string().max(200).optional(),
      message: z.string().max(2_000).optional(),
    }).safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_invite_request', issues: parsed.error.issues });
      return;
    }
    const { topicId, recipientEmail, recipientName, message } = parsed.data;

    // Get topic details
    const topic = await getDoc<{ _id: string; title?: string; type?: string; authorId?: string }>(topicId);
    if (!topic || topic.type !== 'topic') {
      res.status(404).json({ error: 'topic_not_found' });
      return;
    }
    const access = await requireWaveAccess(req, res, String(topicId), 'manage', topic);
    if (!access) return;

    const normalizedEmail = recipientEmail;
    if (normalizedEmail === String(req.user?.email || '').trim().toLowerCase()) {
      res.status(400).json({ error: 'owner_already_participant' });
      return;
    }
    const now = Date.now();
    const existingUsers = await find<any>({ type: 'user', email: normalizedEmail }, { limit: 1 }).catch(() => ({ docs: [] as any[] }));
    const existingUser = existingUsers.docs?.[0];
    const invite = createInviteToken(now);
    const targetUserId = existingUser?._id || `invite:${normalizedEmail}`;
    const participantCandidates = await find<WaveParticipant & { _id: string; _rev: string }>(
      { type: 'participant', waveId: String(topicId) },
      { limit: 500 },
    ).catch(() => ({ docs: [] as Array<WaveParticipant & { _id: string; _rev: string }> }));
    const allMatchingParticipants = (participantCandidates.docs || []).filter((candidate) => (
      candidate.userId === targetUserId || String(candidate.email || '').trim().toLowerCase() === normalizedEmail
    ));
    if (allMatchingParticipants.some((candidate) => candidate.role === 'owner')) {
      res.status(400).json({ error: 'owner_already_participant' });
      return;
    }
    const matchingParticipants = sortParticipantCandidates(
      allMatchingParticipants.filter((candidate) => candidate.role !== 'owner'),
      targetUserId,
    );
    const existingParticipant = matchingParticipants[0] || null;
    const participantId = existingParticipant?._id || `participant:wave:${topicId}:user:${targetUserId}`;
    if (existingParticipant?.status === 'accepted') {
      res.json({ success: true, status: 'accepted', alreadyParticipant: true });
      return;
    }
    const participant: WaveParticipant & { _rev?: string } = {
      ...(existingParticipant || {}),
      _id: participantId,
      type: 'participant',
      waveId: String(topicId),
      userId: targetUserId,
      email: normalizedEmail,
      role: existingParticipant?.role || 'editor',
      invitedBy: userId,
      invitedAt: now,
      status: 'pending',
      acceptedAt: undefined,
      inviteTokenHash: invite.tokenHash,
      inviteExpiresAt: invite.expiresAt,
    };

    const baseUrl = resolveInviteBaseUrl(req);
    const topicUrl = buildInviteUrl(baseUrl, String(topicId), invite.token);

    if (existingParticipant) await updateDoc(participant as any);
    else await insertDoc(participant as any);
    const tokenDoc: any = {
      _id: invitationTokenDocId(invite.tokenHash),
      type: 'invitation_token',
      tokenHash: invite.tokenHash,
      participantId,
      waveId: String(topicId),
      email: normalizedEmail,
      status: 'pending_delivery',
      createdAt: now,
      expiresAt: invite.expiresAt,
    };
    const tokenInsert = await insertDoc(tokenDoc);
    tokenDoc._rev = tokenInsert.rev;
    for (const duplicate of matchingParticipants.slice(1)) {
      await updateDoc({
        ...duplicate,
        status: 'declined',
        declinedAt: now,
        declinedBy: userId,
        inviteTokenHash: undefined,
        inviteExpiresAt: undefined,
        acceptedInviteTokenHash: undefined,
        acceptedInviteExpiresAt: undefined,
      } as any);
    }

    const result = await sendInviteEmail({
      inviterName: userName,
      inviterEmail: req.user?.email || 'unknown@rizzoma.com',
      topicTitle: topic.title || 'Untitled Topic',
      topicUrl,
      recipientEmail,
      recipientName,
      message,
    });

    if (result.success) {
      await updateDoc({ ...tokenDoc, status: 'sent', deliveredAt: Date.now() } as any).catch(() => undefined);
      await refreshWaveSocketAccess(String(topicId));
      res.json({ success: true, messageId: result.messageId, status: 'pending' });
    } else {
      await updateDoc({ ...tokenDoc, status: 'failed', failedAt: Date.now() } as any).catch(() => undefined);
      res.status(500).json({ error: 'email_send_failed', details: result.error });
    }
  } catch (e: any) {
    console.error('[notifications] invite error', e);
    res.status(500).json({ error: e?.message || 'invite_error' });
  }
});

// GET /api/notifications/preferences - Get user notification preferences
// noStore: per-user notification preferences
router.get('/preferences', noStore, requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  try {
    const doc = await getDoc<NotificationPreferencesDoc>(prefsDocId(userId));
    res.json({
      emailEnabled: doc.emailEnabled,
      digestFrequency: doc.digestFrequency,
      inviteNotifications: doc.inviteNotifications,
      mentionNotifications: doc.mentionNotifications,
      replyNotifications: doc.replyNotifications,
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      res.json(defaultPreferences);
      return;
    }
    res.status(500).json({ error: e?.message || 'preferences_error' });
  }
});

// PATCH /api/notifications/preferences - Update user notification preferences
router.patch('/preferences', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const updates = req.body || {};

  // Validate update fields
  const allowedFields = ['emailEnabled', 'digestFrequency', 'inviteNotifications', 'mentionNotifications', 'replyNotifications'];
  const validUpdates: Partial<NotificationPreferencesDoc> = {};

  for (const field of allowedFields) {
    if (field in updates) {
      if (field === 'digestFrequency') {
        if (!['none', 'daily', 'weekly'].includes(updates[field])) {
          res.status(400).json({ error: `invalid_${field}` });
          return;
        }
        validUpdates[field as keyof typeof validUpdates] = updates[field];
      } else if (typeof updates[field] === 'boolean') {
        (validUpdates as any)[field] = updates[field];
      }
    }
  }

  if (Object.keys(validUpdates).length === 0) {
    res.status(400).json({ error: 'no_valid_updates' });
    return;
  }

  try {
    const existing = await getDoc<NotificationPreferencesDoc & { _rev: string }>(prefsDocId(userId));
    const updated: NotificationPreferencesDoc & { _rev: string } = {
      ...existing,
      ...validUpdates,
      updatedAt: Date.now(),
    };
    await updateDoc(updated as any);
    res.json({
      emailEnabled: updated.emailEnabled,
      digestFrequency: updated.digestFrequency,
      inviteNotifications: updated.inviteNotifications,
      mentionNotifications: updated.mentionNotifications,
      replyNotifications: updated.replyNotifications,
    });
  } catch (e: any) {
    if (String(e?.message).startsWith('404')) {
      // Create new preferences doc
      const now = Date.now();
      const newDoc: NotificationPreferencesDoc = {
        _id: prefsDocId(userId),
        type: 'notification_preferences',
        userId,
        ...defaultPreferences,
        ...validUpdates,
        createdAt: now,
        updatedAt: now,
      };
      await insertDoc(newDoc as any);
      res.json({
        emailEnabled: newDoc.emailEnabled,
        digestFrequency: newDoc.digestFrequency,
        inviteNotifications: newDoc.inviteNotifications,
        mentionNotifications: newDoc.mentionNotifications,
        replyNotifications: newDoc.replyNotifications,
      });
      return;
    }
    res.status(500).json({ error: e?.message || 'preferences_update_error' });
  }
});

// GET /api/notifications/invites - List pending invites for a topic (topic owner only)
router.get('/invites/:topicId', requireAuth, async (req, res): Promise<void> => {
  try {
    const topicId = String(req.params['topicId'] || '');
    const access = await requireWaveAccess(req, res, topicId, 'manage');
    if (!access) return;
    const result = await find<WaveParticipant>(
      { type: 'participant', waveId: topicId },
      { limit: 100 }
    );

    const invites = result.docs.filter((doc) => doc.role !== 'owner').map(doc => ({
      id: doc._id,
      recipientEmail: doc.email,
      sentAt: doc.invitedAt,
      status: doc.status,
      role: doc.role,
    }));

    res.json({ invites });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'list_invites_error' });
  }
});

export default router;
