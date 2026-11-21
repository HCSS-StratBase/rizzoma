import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMail = vi.fn(async () => ({ messageId: 'real' }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) }, createTransport: () => ({ sendMail }) }));

describe('INVITE_MAIL_SUPPRESS_PATTERN', () => {
  beforeEach(() => { sendMail.mockClear(); vi.resetModules(); });
  const data = { inviterName: 'A', inviterEmail: 'a@example.com', topicTitle: 'T', topicUrl: 'https://x/#/topic/1?invite=t', recipientEmail: 'me+fractal2@gmail.com' };
  it('sends no mail to a matching address but still reports success', async () => {
    process.env['INVITE_MAIL_SUPPRESS_PATTERN'] = '\\+fractal\\d@gmail\\.com$';
    const { sendInviteEmail } = await import('../server/services/email');
    const r = await sendInviteEmail(data);
    expect(r.success).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('still sends to everyone else', async () => {
    process.env['INVITE_MAIL_SUPPRESS_PATTERN'] = '\\+fractal\\d@gmail\\.com$';
    const { sendInviteEmail } = await import('../server/services/email');
    await sendInviteEmail({ ...data, recipientEmail: 'real@example.com' });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
