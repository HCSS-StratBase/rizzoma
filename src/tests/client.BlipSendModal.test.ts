import { describe, it, expect } from 'vitest';
import { describeRecipient } from '../client/components/blip/BlipSendModal';

describe('describeRecipient (what the sender is told per person)', () => {
  it('says delivered, and what happened to the email', () => {
    const base = { name: 'Ann', status: 'delivered' as const, inApp: true };
    expect(describeRecipient({ ...base, emailStatus: 'not_requested' })).toBe('Ann: delivered to their Mentions.');
    expect(describeRecipient({ ...base, emailStatus: 'sent' })).toContain('and emailed');
    expect(describeRecipient({ ...base, emailStatus: 'suppressed' })).toContain('test address, no email sent');
    expect(describeRecipient({ ...base, emailStatus: 'failed' })).toContain('email FAILED');
  });
  it('says plainly when nothing was sent and why', () => {
    const r = { inApp: false, emailStatus: 'not_requested' as const };
    expect(describeRecipient({ ...r, name: 'Bo', status: 'no_access' })).toContain('Invite them to the topic first');
    expect(describeRecipient({ ...r, email: 'x@example.org', status: 'no_account' })).toContain('No Rizzoma account');
    expect(describeRecipient({ ...r, name: 'Me', status: 'error', error: 'cannot_send_to_yourself' })).toContain('that is you');
  });
});
