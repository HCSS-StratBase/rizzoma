import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { issueTicket, redeemTicket } from '../server/lib/authTickets';

describe('native OAuth verifier-bound tickets', () => {
  it('refuses to mint a bearer-style ticket without a valid verifier challenge', () => {
    const payload = { userId: 'user-1', email: 'user@example.test' };
    expect(() => issueTicket(payload, undefined as unknown as string)).toThrow('invalid_native_verifier_challenge');
    expect(() => issueTicket(payload, 'caller-nonce')).toThrow('invalid_native_verifier_challenge');
  });

  it('rejects missing/wrong verifiers without burning the legitimate single-use ticket', () => {
    const verifier = 'v'.repeat(43);
    const challenge = createHash('sha256').update(verifier, 'utf8').digest('base64url');
    const ticket = issueTicket({ userId: 'user-1', email: 'user@example.test' }, challenge);
    expect(redeemTicket(ticket)).toBeNull();
    expect(redeemTicket(ticket, 'x'.repeat(43))).toBeNull();
    expect(redeemTicket(ticket, verifier)).toEqual({ userId: 'user-1', email: 'user@example.test' });
    expect(redeemTicket(ticket, verifier)).toBeNull();
  });
});
