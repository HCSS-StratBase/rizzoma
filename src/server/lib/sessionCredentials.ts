import { getDoc } from './couch.js';

export type CredentialVersionSession = {
  userId?: string;
  authVersion?: number;
};

export type CredentialVersionCheck =
  | { status: 'valid'; userId?: string; authVersion: number }
  | { status: 'invalid'; userId: string; authVersion: number }
  | { status: 'unavailable'; userId: string; error: string };

export function normalizeAuthVersion(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Compare the credential generation captured when a session was established
 * with the current generation on the user document. Password reset increments
 * the user generation in the same atomic CouchDB write that changes the hash,
 * so every older HTTP and Socket.IO session fails closed even if eager session
 * deletion is temporarily unavailable.
 */
export async function checkSessionCredentialVersion(
  session: CredentialVersionSession | null | undefined,
): Promise<CredentialVersionCheck> {
  const userId = String(session?.userId || '').trim();
  const sessionVersion = normalizeAuthVersion(session?.authVersion);
  if (!userId) return { status: 'valid', authVersion: sessionVersion };

  try {
    const user = await getDoc<Record<string, unknown>>(userId);
    if (!user || user['type'] !== 'user') {
      return { status: 'invalid', userId, authVersion: sessionVersion };
    }
    const currentVersion = normalizeAuthVersion(user['authVersion']);
    return currentVersion === sessionVersion
      ? { status: 'valid', userId, authVersion: currentVersion }
      : { status: 'invalid', userId, authVersion: currentVersion };
  } catch (error: any) {
    const message = String(error?.message || error || 'credential version lookup failed');
    if (/^404\b/.test(message)) {
      return { status: 'invalid', userId, authVersion: sessionVersion };
    }
    return { status: 'unavailable', userId, error: message };
  }
}
