/**
 * "Send to…" on a blip.
 *
 * POST /api/blips/:id/send   { to: [{userId?|email?}], message?, sendEmail? }
 * GET  /api/blips/:id/sends  what the signed-in user has sent from this blip, with delivery state.
 *
 * Delivery: an in-app Mentions entry for people who can already read the topic, plus an optional email with a link to
 * that exact blip. Nobody gets access through this: a person who cannot read the topic is reported as `no_access`
 * (the sender invites them to the topic first). Test addresses (INVITE_MAIL_SUPPRESS_PATTERN) never get mail.
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { noStore } from '../middleware/noStore.js';
import { csrfProtect } from '../middleware/csrf.js';
import { find, getDoc, insertDoc } from '../lib/couch.js';
import { identityFromRequest, resolveBlipAccess, resolveWaveAccess } from '../lib/access.js';
import { resolveInviteBaseUrl } from '../lib/invitations.js';
import { sendBlipSendEmail } from '../services/email.js';

const router = Router();

export type SendRecipientStatus = 'delivered' | 'no_access' | 'no_account' | 'error';
export type SendEmailStatus = 'not_requested' | 'sent' | 'suppressed' | 'failed' | 'skipped';

export interface SendRecipientResult {
  userId?: string;
  email?: string;
  name?: string;
  status: SendRecipientStatus;
  inApp: boolean;
  emailStatus: SendEmailStatus;
  error?: string;
}

export function blipPlainPreview(content: unknown): string {
  return String(content || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function blipLink(origin: string, blipId: string): string {
  const colon = blipId.indexOf(':');
  const wave = colon >= 0 ? blipId.slice(0, colon) : blipId;
  const seg = colon >= 0 ? blipId.slice(colon + 1) : '';
  const url = new URL(origin);
  url.pathname = '/';
  url.searchParams.set('layout', 'rizzoma');
  url.hash = seg
    ? `#/topic/${encodeURIComponent(wave)}/${encodeURIComponent(seg)}/`
    : `#/topic/${encodeURIComponent(wave)}`;
  return url.toString();
}

const sendBody = z.object({
  to: z.array(z.object({
    userId: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(320).transform((e) => e.toLowerCase()).optional(),
  }).refine((r) => r.userId || r.email, 'recipient_needs_userId_or_email')).min(1).max(10),
  message: z.string().max(2_000).optional(),
  sendEmail: z.boolean().default(false),
});

router.post('/:id/send', requireAuth, csrfProtect(), async (req, res): Promise<void> => {
  const blipId = String(req.params['id'] || '');
  const parsed = sendBody.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_send_request', issues: parsed.error.issues });
    return;
  }
  const { to, message, sendEmail } = parsed.data;
  try {
    const identity = identityFromRequest(req);
    const { blip, access } = await resolveBlipAccess(blipId, identity);
    if (!access.canRead) { res.status(403).json({ error: 'forbidden' }); return; }
    const waveId = String(blip.waveId || blip._id);
    const wave = await getDoc<any>(waveId).catch(() => null);
    const topicTitle = String(wave?.title || 'Untitled Topic');
    const senderId = String(identity.id);
    const senderName = String(identity.name || identity.email || 'A Rizzoma user');
    let origin = '';
    if (sendEmail) {
      try { origin = resolveInviteBaseUrl(req); } catch (e: any) {
        res.status(500).json({ error: e?.message || 'invite_url_configuration_error' });
        return;
      }
    }
    const sendId = randomUUID();
    const now = Date.now();
    const seen = new Set<string>();
    const results: SendRecipientResult[] = [];

    for (const target of to) {
      const key = target.userId || target.email || '';
      if (seen.has(key)) continue;
      seen.add(key);
      const r: SendRecipientResult = { userId: target.userId, email: target.email, status: 'error', inApp: false, emailStatus: 'not_requested' };
      try {
        let user: any = null;
        if (target.userId) user = await getDoc<any>(target.userId).catch(() => null);
        else if (target.email) {
          const found = await find<any>({ type: 'user', email: target.email }, { limit: 1 }).catch(() => ({ docs: [] as any[] }));
          user = found.docs?.[0] || null;
        }
        if (!user || user.type !== 'user') { r.status = 'no_account'; results.push(r); continue; }
        r.userId = user._id;
        r.email = String(user.email || target.email || '').toLowerCase() || undefined;
        r.name = String(user.name || '').trim() || undefined;
        if (user._id === senderId) { r.status = 'error'; r.error = 'cannot_send_to_yourself'; results.push(r); continue; }
        const rAccess = await resolveWaveAccess(waveId, { id: user._id, email: r.email, name: r.name }).catch(() => null);
        if (!rAccess?.canRead) { r.status = 'no_access'; results.push(r); continue; }

        await insertDoc({
          _id: `mention:send:${sendId}:${user._id}`,
          type: 'mention',
          source: 'send',
          topicId: waveId,
          blipId,
          mentionedUserId: user._id,
          mentionText: message ? `Sent you this blip: ${message.slice(0, 200)}` : 'Sent you this blip',
          authorId: senderId,
          authorName: senderName,
          isRead: false,
          createdAt: now,
        } as any);
        r.inApp = true;
        r.status = 'delivered';

        if (sendEmail) {
          if (!r.email) { r.emailStatus = 'skipped'; }
          else {
            const mail = await sendBlipSendEmail({
              senderName,
              recipientEmail: r.email,
              recipientName: r.name,
              topicTitle,
              blipPreview: blipPlainPreview(blip.content),
              blipUrl: blipLink(origin, blipId),
              message: message || undefined,
            });
            r.emailStatus = !mail.success ? 'failed'
              : mail.messageId === 'suppressed-by-INVITE_MAIL_SUPPRESS_PATTERN' ? 'suppressed' : 'sent';
            if (!mail.success) r.error = mail.error;
          }
        }
      } catch (err: any) {
        r.status = 'error';
        r.error = String(err?.message || err).slice(0, 200);
      }
      results.push(r);
    }

    await insertDoc({
      _id: `blip-send:${sendId}`,
      type: 'blip_send',
      waveId,
      blipId,
      senderId,
      message: message || undefined,
      sendEmail,
      recipients: results,
      createdAt: now,
    } as any);
    res.json({ ok: true, sendId, results });
  } catch (err: any) {
    const m = String(err?.message || '');
    if (m.startsWith('404')) { res.status(404).json({ error: 'blip_not_found' }); return; }
    if (m.startsWith('410')) { res.status(410).json({ error: 'blip_deleted' }); return; }
    console.error('[blips] send failed', { blipId, error: m });
    res.status(500).json({ error: 'send_error', requestId: (req as any).id });
  }
});

router.get('/:id/sends', noStore, requireAuth, async (req, res): Promise<void> => {
  const blipId = String(req.params['id'] || '');
  try {
    const identity = identityFromRequest(req);
    const { access } = await resolveBlipAccess(blipId, identity);
    if (!access.canRead) { res.status(403).json({ error: 'forbidden' }); return; }
    const selector = { type: 'blip_send', blipId, senderId: String(identity.id) };
    const r = await find<any>(selector, { limit: 100, use_index: 'idx_blip_send_blip_sender' })
      .catch(() => find<any>(selector, { limit: 100 }));
    const sends = (r.docs || [])
      .map((d: any) => ({ id: d._id, createdAt: d.createdAt, message: d.message, sendEmail: !!d.sendEmail, recipients: d.recipients || [] }))
      .sort((a: any, b: any) => b.createdAt - a.createdAt);
    res.json({ sends });
  } catch (err: any) {
    const m = String(err?.message || '');
    if (m.startsWith('404')) { res.status(404).json({ error: 'blip_not_found' }); return; }
    res.status(500).json({ error: 'sends_load_error', requestId: (req as any).id });
  }
});

export default router;
