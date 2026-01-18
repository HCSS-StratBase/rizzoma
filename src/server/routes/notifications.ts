/**
 * Notification Routes
 *
 * API endpoints for sending invites and managing notification preferences.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendInviteEmail } from '../services/email.js';
import { getDoc, insertDoc, updateDoc, find } from '../lib/couch.js';

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
router.post('/invite', requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;
  const userName = req.user?.name || req.user?.email || 'Someone';

  try {
    const { topicId, recipientEmail, recipientName, message } = req.body || {};

    if (!topicId || !recipientEmail) {
      res.status(400).json({ error: 'missing_required_fields' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      res.status(400).json({ error: 'invalid_email_format' });
      return;
    }

    // Get topic details
    const topic = await getDoc<{ _id: string; title?: string; type?: string }>(topicId);
    if (!topic || topic.type !== 'topic') {
      res.status(404).json({ error: 'topic_not_found' });
      return;
    }

    const baseUrl = process.env['APP_URL'] || 'http://localhost:8000';
    const topicUrl = `${baseUrl}/?layout=rizzoma#/topic/${topicId}`;

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
      // Record the invite
      const inviteDoc = {
        _id: `invite:${topicId}:${Date.now()}`,
        type: 'topic_invite',
        topicId,
        inviterId: userId,
        inviterName: userName,
        recipientEmail,
        recipientName: recipientName || null,
        message: message || null,
        sentAt: Date.now(),
        status: 'sent',
      };
      await insertDoc(inviteDoc as any);

      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(500).json({ error: 'email_send_failed', details: result.error });
    }
  } catch (e: any) {
    console.error('[notifications] invite error', e);
    res.status(500).json({ error: e?.message || 'invite_error' });
  }
});

// GET /api/notifications/preferences - Get user notification preferences
router.get('/preferences', requireAuth, async (req, res): Promise<void> => {
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
router.patch('/preferences', requireAuth, async (req, res): Promise<void> => {
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
    const topicId = req.params['topicId'];
    const result = await find<{ _id: string; recipientEmail: string; sentAt: number; status: string }>(
      { type: 'topic_invite', topicId },
      { limit: 100 }
    );

    const invites = result.docs.map(doc => ({
      id: doc._id,
      recipientEmail: doc.recipientEmail,
      sentAt: doc.sentAt,
      status: doc.status,
    }));

    res.json({ invites });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'list_invites_error' });
  }
});

export default router;
