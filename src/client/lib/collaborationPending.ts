/**
 * In-memory accounting for Yjs updates that the collaboration server has not
 * acknowledged yet. Nothing here is durable: the Y.Doc remains the source of
 * truth for retrying after reconnect, while this registry exists solely to
 * prevent a tab close from silently discarding that in-memory state.
 */

export const COLLABORATION_PENDING_EVENT = 'rizzoma:collaboration-pending-change';

const pendingByOwnerAndBlip = new Map<string, number>();

function normalizedOwner(ownerId: string | null | undefined): string {
  return ownerId?.trim() || 'guest';
}

function pendingKey(ownerId: string | null | undefined, blipId: string): string {
  return `${encodeURIComponent(normalizedOwner(ownerId))}:${encodeURIComponent(blipId)}`;
}

function notify(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COLLABORATION_PENDING_EVENT, {
    detail: { count: getPendingCollaborationCount() },
  }));
}

export function markCollaborationUpdatePending(ownerId: string | null, blipId: string): void {
  const key = pendingKey(ownerId, blipId);
  pendingByOwnerAndBlip.set(key, (pendingByOwnerAndBlip.get(key) ?? 0) + 1);
  notify();
}

/** Acknowledge one ordinary update accepted by the server. */
export function acknowledgeCollaborationUpdate(ownerId: string | null, blipId: string): void {
  const key = pendingKey(ownerId, blipId);
  const count = pendingByOwnerAndBlip.get(key) ?? 0;
  if (count <= 1) pendingByOwnerAndBlip.delete(key);
  else pendingByOwnerAndBlip.set(key, count - 1);
  notify();
}

/**
 * A reconnect diff represents the complete local Y.Doc state. Once the server
 * accepts it, every older unacknowledged update for this blip is covered.
 */
export function acknowledgeCollaborationSnapshot(ownerId: string | null, blipId: string): void {
  pendingByOwnerAndBlip.delete(pendingKey(ownerId, blipId));
  notify();
}

export function getPendingCollaborationCount(): number {
  let total = 0;
  pendingByOwnerAndBlip.forEach((count) => { total += count; });
  return total;
}

export function hasPendingCollaborationChanges(): boolean {
  return getPendingCollaborationCount() > 0;
}

export function hasPendingCollaborationChangesFor(
  ownerId: string | null,
  blipId: string,
): boolean {
  return (pendingByOwnerAndBlip.get(pendingKey(ownerId, blipId)) ?? 0) > 0;
}

/** Test-only reset; production deliberately keeps pending state across mounts. */
export function resetPendingCollaborationChanges(): void {
  pendingByOwnerAndBlip.clear();
  notify();
}
