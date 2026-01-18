/**
 * Email Notification Service
 *
 * Provides email sending capabilities for invites, notifications, and digests.
 * Uses nodemailer for SMTP transport.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// Email configuration from environment
const EMAIL_CONFIG = {
  host: process.env['SMTP_HOST'] || 'localhost',
  port: parseInt(process.env['SMTP_PORT'] || '587', 10),
  secure: process.env['SMTP_SECURE'] === 'true',
  auth: process.env['SMTP_USER'] ? {
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'] || '',
  } : undefined,
  from: process.env['EMAIL_FROM'] || 'Rizzoma <noreply@rizzoma.com>',
};

// Create transporter (lazy initialization)
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: EMAIL_CONFIG.host,
      port: EMAIL_CONFIG.port,
      secure: EMAIL_CONFIG.secure,
      auth: EMAIL_CONFIG.auth,
    });
  }
  return transporter;
}

// Email templates
export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface InviteEmailData {
  inviterName: string;
  inviterEmail: string;
  topicTitle: string;
  topicUrl: string;
  recipientEmail: string;
  recipientName?: string;
  message?: string;
}

export interface NotificationEmailData {
  userName: string;
  userEmail: string;
  topicTitle: string;
  topicUrl: string;
  blipPreview: string;
  authorName: string;
}

export interface DigestEmailData {
  userName: string;
  userEmail: string;
  topics: Array<{
    title: string;
    url: string;
    changes: number;
    lastActivity: Date;
  }>;
  period: 'daily' | 'weekly';
}

// Template generators
function generateInviteEmail(data: InviteEmailData): EmailTemplate {
  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi,';
  const messageBlock = data.message ? `<p style="color: #555; font-style: italic; border-left: 3px solid #2c3e50; padding-left: 12px; margin: 16px 0;">"${data.message}"</p>` : '';

  return {
    subject: `${data.inviterName} invited you to "${data.topicTitle}" on Rizzoma`,
    text: `${greeting}

${data.inviterName} (${data.inviterEmail}) has invited you to collaborate on "${data.topicTitle}" in Rizzoma.

${data.message ? `Message: "${data.message}"` : ''}

Click here to join: ${data.topicUrl}

---
Rizzoma - Real-time collaboration platform
`,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #2c3e50; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">Rizzoma</h1>
  </div>
  <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">${greeting}</p>
    <p><strong>${data.inviterName}</strong> (${data.inviterEmail}) has invited you to collaborate on:</p>
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <h2 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 18px;">${data.topicTitle}</h2>
    </div>
    ${messageBlock}
    <a href="${data.topicUrl}" style="display: inline-block; background: #3498db; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 16px;">Join Topic</a>
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
    <p style="color: #888; font-size: 12px; margin-bottom: 0;">
      Rizzoma - Real-time collaboration platform<br>
      <a href="${data.topicUrl}" style="color: #3498db;">${data.topicUrl}</a>
    </p>
  </div>
</body>
</html>`,
  };
}

function generateNotificationEmail(data: NotificationEmailData): EmailTemplate {
  return {
    subject: `New activity in "${data.topicTitle}"`,
    text: `Hi ${data.userName},

${data.authorName} added a new comment in "${data.topicTitle}":

"${data.blipPreview}"

View the topic: ${data.topicUrl}

---
Rizzoma - Real-time collaboration platform
`,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #2c3e50; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">Rizzoma</h1>
  </div>
  <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">Hi ${data.userName},</p>
    <p><strong>${data.authorName}</strong> added a new comment in:</p>
    <div style="background: white; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <h2 style="margin: 0 0 12px 0; color: #2c3e50; font-size: 18px;">${data.topicTitle}</h2>
      <p style="margin: 0; color: #555; font-style: italic;">"${data.blipPreview}"</p>
    </div>
    <a href="${data.topicUrl}" style="display: inline-block; background: #3498db; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; margin-top: 8px;">View Topic</a>
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
    <p style="color: #888; font-size: 12px; margin-bottom: 0;">
      You received this notification because you're a participant in this topic.<br>
      <a href="${data.topicUrl}" style="color: #3498db;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`,
  };
}

function generateDigestEmail(data: DigestEmailData): EmailTemplate {
  const periodText = data.period === 'daily' ? 'Daily' : 'Weekly';
  const topicsHtml = data.topics.map(topic => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
        <a href="${topic.url}" style="color: #2c3e50; text-decoration: none; font-weight: 500;">${topic.title}</a>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">${topic.changes}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; color: #888; font-size: 12px;">${topic.lastActivity.toLocaleDateString()}</td>
    </tr>
  `).join('');

  const topicsText = data.topics.map(topic =>
    `- ${topic.title} (${topic.changes} changes) - ${topic.url}`
  ).join('\n');

  return {
    subject: `Your ${periodText} Rizzoma Digest`,
    text: `Hi ${data.userName},

Here's your ${periodText.toLowerCase()} summary of activity in Rizzoma:

${topicsText}

---
Rizzoma - Real-time collaboration platform
`,
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #2c3e50; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">Rizzoma ${periodText} Digest</h1>
  </div>
  <div style="background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="margin-top: 0;">Hi ${data.userName},</p>
    <p>Here's your ${periodText.toLowerCase()} summary of activity:</p>
    <table style="width: 100%; background: white; border: 1px solid #ddd; border-radius: 6px; border-collapse: collapse; margin: 16px 0;">
      <thead>
        <tr style="background: #f5f5f5;">
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Topic</th>
          <th style="padding: 12px; text-align: center; border-bottom: 2px solid #ddd;">Changes</th>
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #ddd;">Last Activity</th>
        </tr>
      </thead>
      <tbody>
        ${topicsHtml}
      </tbody>
    </table>
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
    <p style="color: #888; font-size: 12px; margin-bottom: 0;">
      Manage your notification preferences in Rizzoma settings.<br>
      <a href="#" style="color: #3498db;">Unsubscribe from digest emails</a>
    </p>
  </div>
</body>
</html>`,
  };
}

// Main email sending functions
export async function sendInviteEmail(data: InviteEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const template = generateInviteEmail(data);
    const transport = getTransporter();

    const result = await transport.sendMail({
      from: EMAIL_CONFIG.from,
      to: data.recipientEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    console.log('[email] Invite sent', { to: data.recipientEmail, messageId: result.messageId });
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    console.error('[email] Failed to send invite', { to: data.recipientEmail, error: error.message });
    return { success: false, error: error.message };
  }
}

export async function sendNotificationEmail(data: NotificationEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const template = generateNotificationEmail(data);
    const transport = getTransporter();

    const result = await transport.sendMail({
      from: EMAIL_CONFIG.from,
      to: data.userEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    console.log('[email] Notification sent', { to: data.userEmail, messageId: result.messageId });
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    console.error('[email] Failed to send notification', { to: data.userEmail, error: error.message });
    return { success: false, error: error.message };
  }
}

export async function sendDigestEmail(data: DigestEmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const template = generateDigestEmail(data);
    const transport = getTransporter();

    const result = await transport.sendMail({
      from: EMAIL_CONFIG.from,
      to: data.userEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    console.log('[email] Digest sent', { to: data.userEmail, period: data.period, messageId: result.messageId });
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    console.error('[email] Failed to send digest', { to: data.userEmail, error: error.message });
    return { success: false, error: error.message };
  }
}

// Verify email configuration
export async function verifyEmailConfig(): Promise<{ ready: boolean; error?: string }> {
  try {
    const transport = getTransporter();
    await transport.verify();
    console.log('[email] SMTP connection verified');
    return { ready: true };
  } catch (error: any) {
    console.warn('[email] SMTP connection failed', { error: error.message });
    return { ready: false, error: error.message };
  }
}

// Close transporter (cleanup)
export function closeEmailTransport(): void {
  if (transporter) {
    transporter.close();
    transporter = null;
  }
}
