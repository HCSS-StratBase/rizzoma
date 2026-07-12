import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OWNER_RECOVERY_TOKEN_KEY,
  PASSWORD_RESET_TOKEN_KEY,
  PENDING_INVITE_URL_KEY,
  readOwnerRecoveryToken,
  readPasswordResetToken,
  readPendingInvite,
  scrubInviteFragment,
  scrubOwnerRecoveryFragment,
  scrubPasswordResetFragment,
} from '../client/lib/fragmentSecrets';

const inviteToken = 'invite-secret-token-that-is-long-enough-123456789';
const recoveryToken = 'owner-recovery-secret-that-is-long-enough-123456789';
const passwordResetToken = 'p'.repeat(43);

describe('fragment secret lifecycle', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?layout=rizzoma#/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrubs an invite immediately into a minimal TTL-limited tab record', () => {
    const now = Date.now();
    window.history.replaceState(null, '', `/?layout=rizzoma#/topic/wave-1?invite=${inviteToken}&view=compact`);
    const record = scrubInviteFragment(now);

    expect(window.location.hash).toBe('#/topic/wave-1?view=compact');
    expect(window.location.href).not.toContain(inviteToken);
    expect(record).toMatchObject({ token: inviteToken, waveId: 'wave-1', createdAt: now });
    expect(record!.expiresAt).toBeGreaterThan(now);
    const stored = JSON.parse(sessionStorage.getItem(PENDING_INVITE_URL_KEY) || '{}');
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'expiresAt', 'token', 'waveId']);
    expect(JSON.stringify(stored)).not.toContain(window.location.origin);
  });

  it('expires abandoned invite records and removes the durable secret', () => {
    const now = Date.now();
    window.history.replaceState(null, '', `/#/topic/wave-1?invite=${inviteToken}`);
    const record = scrubInviteFragment(now)!;
    vi.spyOn(Date, 'now').mockReturnValue(record.expiresAt + 1);
    expect(readPendingInvite()).toBeNull();
    expect(sessionStorage.getItem(PENDING_INVITE_URL_KEY)).toBeNull();
  });

  it('scrubs owner recovery into a shorter-lived minimal record', () => {
    const now = Date.now();
    window.history.replaceState(null, '', `/?layout=rizzoma#/?ownerRecovery=${recoveryToken}`);
    expect(scrubOwnerRecoveryFragment(now)).toBe(recoveryToken);
    expect(window.location.href).not.toContain(recoveryToken);
    expect(readOwnerRecoveryToken()).toBe(recoveryToken);
    const stored = JSON.parse(sessionStorage.getItem(OWNER_RECOVERY_TOKEN_KEY) || '{}');
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'expiresAt', 'token']);
    expect(stored.expiresAt - stored.createdAt).toBeLessThan(60 * 60 * 1000);
  });

  it('scrubs a password reset before render and retains only a tab-scoped TTL record', () => {
    const now = Date.now();
    window.history.replaceState(null, '', `/?layout=rizzoma#/?passwordReset=${passwordResetToken}`);
    expect(scrubPasswordResetFragment(now)).toBe(passwordResetToken);
    expect(window.location.hash).toBe('#/');
    expect(window.location.href).not.toContain(passwordResetToken);
    expect(readPasswordResetToken()).toBe(passwordResetToken);
    const stored = JSON.parse(sessionStorage.getItem(PASSWORD_RESET_TOKEN_KEY) || '{}');
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'expiresAt', 'token']);
    expect(stored.expiresAt - stored.createdAt).toBe(30 * 60 * 1000);
  });

  it('rejects malformed password reset fragments instead of retaining them', () => {
    window.history.replaceState(null, '', '/#/?passwordReset=too-short');
    expect(scrubPasswordResetFragment()).toBeNull();
    expect(window.location.href).not.toContain('too-short');
    expect(sessionStorage.getItem(PASSWORD_RESET_TOKEN_KEY)).toBeNull();
  });
});
