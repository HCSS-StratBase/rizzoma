import { createHash, randomBytes } from 'node:crypto';

export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createInviteToken(now = Date.now()): {
  token: string;
  tokenHash: string;
  expiresAt: number;
} {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashInviteToken(token),
    expiresAt: now + INVITE_TOKEN_TTL_MS,
  };
}

export function invitationTokenDocId(tokenHash: string): string {
  return `invitation-token:${tokenHash}`;
}

export function buildInviteUrl(baseUrl: string, waveId: string, token: string): string {
  const url = new URL(baseUrl);
  url.pathname = '/';
  url.searchParams.set('layout', 'rizzoma');
  // Keep the bearer secret in the URL fragment. Browsers do not send the
  // fragment in HTTP requests, nginx access logs, or Referer headers.
  url.hash = `#/topic/${encodeURIComponent(waveId)}?invite=${encodeURIComponent(token)}`;
  return url.toString();
}

/** Resolve the public application origin used in emailed bearer links.
 * Production must configure APP_URL explicitly; localhost/request-host
 * fallbacks are restricted to development and tests. */
export function resolveInviteBaseUrl(req: { get?: (name: string) => string | undefined; protocol?: string; headers?: Record<string, unknown> }): string {
  const configured = String(process.env['APP_URL'] || '').trim();
  if (configured) {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('invalid_app_url');
    }
    if (process.env['NODE_ENV'] === 'production' && url.protocol !== 'https:') {
      throw new Error('production_app_url_must_be_https');
    }
    return url.origin;
  }
  if (process.env['NODE_ENV'] === 'production') throw new Error('app_url_required');

  const forwardedHost = req.get?.('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = req.get?.('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = forwardedHost || req.get?.('host') || String(req.headers?.['host'] || 'localhost:3000');
  const protocol = forwardedProto || req.protocol || 'http';
  if (!['http', 'https'].includes(protocol)) throw new Error('invalid_request_origin');
  const url = new URL(`${protocol}://${host}`);
  if (url.username || url.password || !url.hostname) throw new Error('invalid_request_origin');
  return url.origin;
}

type ParticipantCandidate = {
  _id?: string;
  userId?: string;
  email?: string;
  role?: 'owner' | 'editor' | 'commenter' | 'viewer';
  status?: 'pending' | 'accepted' | 'declined';
  invitedAt?: number;
  acceptedAt?: number;
  updatedAt?: number;
};

const PARTICIPANT_ROLE_RANK = { viewer: 1, commenter: 2, editor: 3, owner: 4 } as const;

/** Stable duplicate selection: exact account, accepted grant, strongest role,
 * newest record, then id. CouchDB result order must never decide authority. */
export function sortParticipantCandidates<T extends ParticipantCandidate>(
  candidates: T[],
  preferredUserId?: string,
): T[] {
  const time = (candidate: T) => Math.max(
    Number(candidate.updatedAt || 0),
    Number(candidate.acceptedAt || 0),
    Number(candidate.invitedAt || 0),
  );
  return [...candidates].sort((a, b) => {
    const exact = Number(b.userId === preferredUserId) - Number(a.userId === preferredUserId);
    if (exact) return exact;
    const accepted = Number(b.status === 'accepted' || b.status === undefined)
      - Number(a.status === 'accepted' || a.status === undefined);
    if (accepted) return accepted;
    const role = (PARTICIPANT_ROLE_RANK[b.role || 'viewer'] || 0)
      - (PARTICIPANT_ROLE_RANK[a.role || 'viewer'] || 0);
    if (role) return role;
    const newest = time(b) - time(a);
    if (newest) return newest;
    return String(a._id || '').localeCompare(String(b._id || ''));
  });
}
