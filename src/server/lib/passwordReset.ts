import { createHash, randomBytes } from 'node:crypto';
import { findOne, updateDoc } from './couch.js';
import { sendPasswordResetEmail } from '../services/email.js';
import { normalizeAuthVersion } from './sessionCredentials.js';

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const MAX_COUCH_ATTEMPTS = 4;

export type PasswordResetState = {
  tokenHash: string;
  requestedAt: number;
  expiresAt: number;
  deliveryStatus: 'pending_delivery' | 'sent' | 'delivery_failed';
};

export type PasswordResetUser = {
  _id: string;
  _rev?: string;
  type: 'user';
  email: string;
  passwordHash?: string;
  name?: string;
  authVersion?: number;
  passwordReset?: PasswordResetState;
  passwordChangedAt?: number;
  createdAt: number;
  updatedAt: number;
};

function isConflict(error: unknown): boolean {
  return /^409\b/.test(String((error as any)?.message || error || ''));
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function buildPasswordResetUrl(appBaseUrl: string, token: string): string {
  const base = new URL(appBaseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('invalid password reset base URL');
  base.hash = `/?passwordReset=${encodeURIComponent(token)}`;
  return base.toString();
}

async function storeLatestResetToken(
  normalizedEmail: string,
  tokenHash: string,
  now: number,
): Promise<PasswordResetUser | null> {
  for (let attempt = 0; attempt < MAX_COUCH_ATTEMPTS; attempt += 1) {
    const user = await findOne<PasswordResetUser>({ type: 'user', email: normalizedEmail });
    // Password recovery applies only to an existing password credential.
    // OAuth-only accounts keep using their verified provider.
    if (!user?._id || !user.passwordHash) return null;
    const next: PasswordResetUser = {
      ...user,
      passwordReset: {
        tokenHash,
        requestedAt: now,
        expiresAt: now + PASSWORD_RESET_TTL_MS,
        deliveryStatus: 'pending_delivery',
      },
      updatedAt: now,
    };
    try {
      await updateDoc(next);
      return next;
    } catch (error) {
      if (isConflict(error) && attempt + 1 < MAX_COUCH_ATTEMPTS) continue;
      throw error;
    }
  }
  return null;
}

async function setDeliveryStatus(
  userId: string,
  tokenHash: string,
  deliveryStatus: PasswordResetState['deliveryStatus'],
): Promise<void> {
  for (let attempt = 0; attempt < MAX_COUCH_ATTEMPTS; attempt += 1) {
    const user = await findOne<PasswordResetUser>({ type: 'user', _id: userId });
    // A newer request supersedes this token. Never overwrite its state.
    if (!user?._id || user.passwordReset?.tokenHash !== tokenHash) return;
    try {
      await updateDoc({
        ...user,
        passwordReset: { ...user.passwordReset, deliveryStatus },
        updatedAt: Date.now(),
      });
      return;
    } catch (error) {
      if (isConflict(error) && attempt + 1 < MAX_COUCH_ATTEMPTS) continue;
      throw error;
    }
  }
}

/**
 * Background delivery deliberately starts after the request handler has chosen
 * its generic response. Known and unknown addresses therefore have identical
 * HTTP status/body and do not expose SMTP latency as an account oracle.
 */
export async function deliverPasswordReset(
  normalizedEmail: string,
  appBaseUrl: string,
  now = Date.now(),
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashPasswordResetToken(token);
  const user = await storeLatestResetToken(normalizedEmail, tokenHash, now);
  if (!user) return;

  const result = await sendPasswordResetEmail({
    recipientEmail: user.email,
    recipientName: user.name,
    resetUrl: buildPasswordResetUrl(appBaseUrl, token),
    expiresInMinutes: PASSWORD_RESET_TTL_MS / 60_000,
  });
  await setDeliveryStatus(user._id, tokenHash, result.success ? 'sent' : 'delivery_failed');
}

const pendingDeliveries = new Set<Promise<void>>();

export function queuePasswordResetDelivery(normalizedEmail: string, appBaseUrl: string): void {
  const job = deliverPasswordReset(normalizedEmail, appBaseUrl)
    .catch((error: any) => {
      // Do not include the address or reset token in operational logs.
      console.error('[auth] password reset delivery failed', {
        error: String(error?.message || error || 'unknown error'),
      });
    });
  pendingDeliveries.add(job);
  void job.finally(() => pendingDeliveries.delete(job));
}

export async function waitForPasswordResetDeliveriesForTests(): Promise<void> {
  await Promise.allSettled([...pendingDeliveries]);
}

export async function consumePasswordReset(
  token: string,
  passwordHash: string,
  now = Date.now(),
): Promise<{ userId: string; authVersion: number } | null> {
  const tokenHash = hashPasswordResetToken(token);
  for (let attempt = 0; attempt < MAX_COUCH_ATTEMPTS; attempt += 1) {
    const user = await findOne<PasswordResetUser>({
      type: 'user',
      'passwordReset.tokenHash': tokenHash,
    });
    const reset = user?.passwordReset;
    if (
      !user?._id
      || !reset
      || reset.tokenHash !== tokenHash
      || !['pending_delivery', 'sent'].includes(reset.deliveryStatus)
      || !Number.isFinite(reset.expiresAt)
      || reset.expiresAt <= now
    ) {
      return null;
    }

    const authVersion = normalizeAuthVersion(user.authVersion) + 1;
    const next: PasswordResetUser = {
      ...user,
      passwordHash,
      authVersion,
      passwordReset: undefined,
      passwordChangedAt: now,
      updatedAt: now,
    };
    try {
      await updateDoc(next);
      return { userId: user._id, authVersion };
    } catch (error) {
      // A concurrent consumer or unrelated user-doc update changes `_rev`.
      // Re-read by token: if it was consumed, the lookup disappears; if it
      // was unrelated, the same token can safely retry against the new rev.
      if (isConflict(error) && attempt + 1 < MAX_COUCH_ATTEMPTS) continue;
      throw error;
    }
  }
  return null;
}
