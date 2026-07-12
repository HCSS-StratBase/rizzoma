export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

export interface AuthenticatedUserIdentity {
  id: string;
  email?: string;
  name?: string;
}

export const COLLABORATION_CURSOR_COLORS = [
  '#e91e63',
  '#9c27b0',
  '#673ab7',
  '#3f51b5',
  '#2196f3',
  '#00bcd4',
  '#009688',
  '#4caf50',
  '#ff9800',
  '#ff5722',
  '#795548',
  '#607d8b',
] as const;

/**
 * Return a stable cursor colour for a user id.
 *
 * User ids are not guaranteed to be numeric, so `parseInt(id, 36)` is not
 * safe here. FNV-1a gives us a deterministic unsigned hash for UUIDs, CouchDB
 * ids, email-like ids, and every other string shape used by the auth layer.
 */
export function collaborationColorForUserId(userId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return COLLABORATION_CURSOR_COLORS[(hash >>> 0) % COLLABORATION_CURSOR_COLORS.length];
}

/** Build the awareness identity from the authenticated application user. */
export function collaborationUserFromAuth(user: AuthenticatedUserIdentity): CollaborationUser {
  const email = user.email?.trim() || '';
  const rawId = String(user.id).trim();
  const id = rawId.length > 0 ? rawId : email;
  const preferredName = user.name?.trim();
  const name = preferredName !== undefined && preferredName.length > 0
    ? preferredName
    : (email || id || 'Anonymous');
  return {
    id,
    name,
    color: collaborationColorForUserId(id),
  };
}

/**
 * Unauthenticated/editor-harness fallback. Production editable surfaces pass
 * an authenticated identity synchronously; this deliberately never invents
 * a misleading "User 1234" label.
 */
export function anonymousCollaborationUser(clientId: number | string): CollaborationUser {
  const id = `anonymous:${String(clientId)}`;
  return {
    id,
    name: 'Anonymous',
    color: collaborationColorForUserId(id),
  };
}

export function isCollaborationUser(value: unknown): value is CollaborationUser {
  if (value === null || value === undefined || typeof value !== 'object') return false;
  const candidate = value as Partial<CollaborationUser>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.color === 'string' &&
    candidate.color.trim().length > 0
  );
}
