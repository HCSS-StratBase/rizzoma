export const PENDING_INVITE_URL_KEY = 'rizzoma:pendingInvite';
export const OWNER_RECOVERY_TOKEN_KEY = 'rizzoma:ownerRecovery';
export const PASSWORD_RESET_TOKEN_KEY = 'rizzoma:passwordReset';

const INVITE_SESSION_TTL_MS = 60 * 60 * 1000;
const OWNER_RECOVERY_SESSION_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_SESSION_TTL_MS = 30 * 60 * 1000;

export type PendingInvite = {
  token: string;
  waveId: string;
  createdAt: number;
  expiresAt: number;
};

type PendingOwnerRecovery = {
  token: string;
  createdAt: number;
  expiresAt: number;
};

type PendingPasswordReset = {
  token: string;
  createdAt: number;
  expiresAt: number;
};

export function getFragmentParam(name: string, hash = window.location.hash): string | null {
  const [, query = ''] = hash.split('?', 2);
  return new URLSearchParams(query).get(name);
}

export function removeFragmentParam(name: string): void {
  const [hashPath, hashQuery = ''] = window.location.hash.split('?', 2);
  const params = new URLSearchParams(hashQuery);
  if (!params.has(name)) return;
  params.delete(name);
  const cleanHash = `${hashPath}${params.toString() ? `?${params.toString()}` : ''}`;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${cleanHash}`);
}

function writeSessionRecord(key: string, value: unknown): void {
  try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function readSessionRecord<T extends { expiresAt: number }>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw) as T;
    if (!record || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return record;
  } catch {
    try { window.sessionStorage.removeItem(key); } catch {}
    return null;
  }
}

/**
 * Move an invitation bearer out of the address bar before React renders.
 * Only the minimum tab-scoped record is retained and it expires even if the
 * user abandons an OAuth transaction.
 */
export function scrubInviteFragment(now = Date.now()): PendingInvite | null {
  const token = getFragmentParam('invite');
  if (!token) return readPendingInvite();
  const match = window.location.hash.split('?', 1)[0].match(/^#\/topic\/([^/]+)/);
  const waveId = match?.[1] ? decodeURIComponent(match[1]) : '';
  removeFragmentParam('invite');
  if (!waveId || token.length < 32) {
    clearPendingInvite();
    return null;
  }
  const record: PendingInvite = {
    token,
    waveId,
    createdAt: now,
    expiresAt: now + INVITE_SESSION_TTL_MS,
  };
  writeSessionRecord(PENDING_INVITE_URL_KEY, record);
  return record;
}

export function readPendingInvite(): PendingInvite | null {
  const record = readSessionRecord<PendingInvite>(PENDING_INVITE_URL_KEY);
  if (!record || typeof record.token !== 'string' || record.token.length < 32 || typeof record.waveId !== 'string' || !record.waveId) {
    clearPendingInvite();
    return null;
  }
  return record;
}

export function clearPendingInvite(): void {
  removeFragmentParam('invite');
  try { window.sessionStorage.removeItem(PENDING_INVITE_URL_KEY); } catch {}
}

export function scrubOwnerRecoveryFragment(now = Date.now()): string | null {
  const fragmentToken = getFragmentParam('ownerRecovery');
  if (fragmentToken) {
    removeFragmentParam('ownerRecovery');
    if (fragmentToken.length < 32) {
      clearOwnerRecoveryToken();
      return null;
    }
    writeSessionRecord(OWNER_RECOVERY_TOKEN_KEY, {
      token: fragmentToken,
      createdAt: now,
      expiresAt: now + OWNER_RECOVERY_SESSION_TTL_MS,
    } satisfies PendingOwnerRecovery);
    return fragmentToken;
  }
  return readOwnerRecoveryToken();
}

export function readOwnerRecoveryToken(): string | null {
  const record = readSessionRecord<PendingOwnerRecovery>(OWNER_RECOVERY_TOKEN_KEY);
  if (!record || typeof record.token !== 'string' || record.token.length < 32) {
    clearOwnerRecoveryToken();
    return null;
  }
  return record.token;
}

export function clearOwnerRecoveryToken(): void {
  removeFragmentParam('ownerRecovery');
  try { window.sessionStorage.removeItem(OWNER_RECOVERY_TOKEN_KEY); } catch {}
}

/** Move the password-reset bearer out of browser history before rendering. */
export function scrubPasswordResetFragment(now = Date.now()): string | null {
  const fragmentToken = getFragmentParam('passwordReset');
  if (fragmentToken) {
    removeFragmentParam('passwordReset');
    if (!/^[A-Za-z0-9_-]{43}$/.test(fragmentToken)) {
      clearPasswordResetToken();
      return null;
    }
    writeSessionRecord(PASSWORD_RESET_TOKEN_KEY, {
      token: fragmentToken,
      createdAt: now,
      expiresAt: now + PASSWORD_RESET_SESSION_TTL_MS,
    } satisfies PendingPasswordReset);
    return fragmentToken;
  }
  return readPasswordResetToken();
}

export function readPasswordResetToken(): string | null {
  const record = readSessionRecord<PendingPasswordReset>(PASSWORD_RESET_TOKEN_KEY);
  if (!record || typeof record.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(record.token)) {
    clearPasswordResetToken();
    return null;
  }
  return record.token;
}

export function clearPasswordResetToken(): void {
  removeFragmentParam('passwordReset');
  try { window.sessionStorage.removeItem(PASSWORD_RESET_TOKEN_KEY); } catch {}
}
