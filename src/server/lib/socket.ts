import type { Server as HttpServer } from 'http';
import type { RequestHandler } from 'express';
import { Server } from 'socket.io';
import * as Y from 'yjs';
import { modifyAwarenessUpdate } from 'y-protocols/awareness';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { EditorPresenceManager, type PresenceIdentity, type PresenceEmitPayload } from './editorPresence.js';
import { yjsDocCache } from './yjsDocCache.js';
import {
  hasWavePermission,
  identityFromSocketRequest,
  resolveBlipAccess,
  resolveWaveAccess,
  type WavePermission,
} from './access.js';
import { checkSessionCredentialVersion } from './sessionCredentials.js';
import { isBlbYjsDocument } from './blbYjsValidation.js';

let io: Server | undefined;
let presenceManager: EditorPresenceManager | undefined;

// Per-blip seed authority lock. When a client calls blip:join on a
// fresh Y.Doc (no state in memory, no snapshot in CouchDB), the FIRST
// joiner is granted shouldSeed=true in the blip:sync response and is
// responsible for running setContent(blip.content) to populate the
// Y.Doc. Every subsequent joiner — or any joiner once the doc has
// non-empty state — receives shouldSeed=false. Without this, two tabs
// joining simultaneously both seed their local Y.Doc from HTML, which
// creates divergent CRDT histories that y.applyUpdate cannot merge
// cleanly (the symptom is "typing in tab A shows in tab B's awareness
// cursor but not in its editor text"). The lock is cleared when the
// last client disconnects from the blip so a subsequent revisit can
// re-seed from the current blip HTML if the in-memory doc was reaped
// or never persisted. Task #57 (2026-04-15).
// The seed lease belongs to one concrete socket, not merely to the blip. A
// non-seeding peer leaving an empty room must not release somebody else's
// authority: the original seeder can still act on its earlier shouldSeed=true
// response until it receives a retry event, and electing a second seeder in
// that window would create divergent CRDT histories.
const seedAuthorityOwnerByBlip = new Map<string, string>();

type AwarenessEntry = { clientId: number; clock: number; state: Record<string, unknown> | null };

// A Yjs awareness client id belongs to exactly one authenticated socket for a
// blip. This prevents one client from overwriting another cursor by replaying
// its numeric client id.
const awarenessOwnersByBlip = new Map<string, Map<number, string>>();
const SESSION_REVALIDATE_MS = process.env['NODE_ENV'] === 'test' ? 250 : 5_000;

const CURSOR_COLORS = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4'] as const;

function collaborationColor(userId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return CURSOR_COLORS[(hash >>> 0) % CURSOR_COLORS.length]!;
}

function authoritativeAwarenessUser(identity: { id?: string; name?: string; email?: string }) {
  if (!identity.id) return null;
  const name = String(identity.name || identity.email || 'Authenticated user').trim() || 'Authenticated user';
  return { id: identity.id, name, color: collaborationColor(identity.id) };
}

function decodeAwarenessEntries(update: Uint8Array): AwarenessEntry[] {
  const decoder = decoding.createDecoder(update);
  const length = decoding.readVarUint(decoder);
  if (length > 8) throw new Error('awareness_client_limit');
  const entries: AwarenessEntry[] = [];
  for (let index = 0; index < length; index += 1) {
    const clientId = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const state = JSON.parse(decoding.readVarString(decoder)) as Record<string, unknown> | null;
    entries.push({ clientId, clock, state });
  }
  return entries;
}

function encodeAwarenessEntries(entries: AwarenessEntry[]): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, entries.length);
  for (const entry of entries) {
    encoding.writeVarUint(encoder, entry.clientId);
    encoding.writeVarUint(encoder, entry.clock);
    encoding.writeVarString(encoder, JSON.stringify(entry.state));
  }
  return encoding.toUint8Array(encoder);
}

function roomForWave(waveId: string) { return `ed:wave:${waveId}`; }
function roomForBlip(waveId: string, blipId: string) { return `ed:blip:${waveId}:${blipId}`; }
function buildRooms(waveId: string, blipId?: string) {
  const rooms: Array<{ room: string; waveId: string; blipId?: string }> = [{ room: roomForWave(waveId), waveId }];
  if (blipId) rooms.push({ room: roomForBlip(waveId, blipId), waveId, blipId });
  return rooms;
}

function waveUnreadRoom(waveId: string, userId?: string) {
  return userId ? `ed:wave:${waveId}:unread:${userId}` : `ed:wave:${waveId}:unread`;
}

// Yjs bytes cross Socket.IO as a JSON number array, so their wire payload is
// substantially larger than the binary update. Keep this below Socket.IO's
// default 1 MB transport ceiling so the application can reject it cleanly
// (with an acknowledgement) before the transport terminates the connection.
const MAX_COLLAB_UPDATE_BYTES = 256 * 1024;
const revokedCollabBlips = new Set<string>();
// Policy mutations advance this epoch synchronously, before the live-socket
// sweep does any asynchronous access lookup. A pending collaboration join is
// not yet present in authorizedWaveIds/collabWaveByBlip, so the sweep cannot
// revoke it directly. Binding the join to the wave epoch after its first
// lookup and checking it around the final lookup prevents a stale captured
// participant role from being published as writable room authority.
const wavePolicyEpochById = new Map<string, number>();

function wavePolicyEpoch(waveId: string): number {
  return wavePolicyEpochById.get(waveId) || 0;
}

function advanceWavePolicyEpoch(waveId: string): number {
  const next = wavePolicyEpoch(waveId) + 1;
  wavePolicyEpochById.set(waveId, next);
  return next;
}

function yjsGenerationOf(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export function initSocket(server: HttpServer, allowedOrigins: string[], sharedSessionMiddleware?: RequestHandler) {
  io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
    },
  });

  if (sharedSessionMiddleware) {
    io.engine.use(sharedSessionMiddleware as any);
  }

  const manager = new EditorPresenceManager((payload: PresenceEmitPayload) => {
    io?.to(payload.room).emit('editor:presence', payload);
  });
  presenceManager = manager;
  manager.startCleanupTimer();
  yjsDocCache.start();

  io.on('connection', (socket) => {
    const identity = identityFromSocketRequest(socket.request);
    const accessSessionId = String((socket.request as any)?.sessionID || '');
    const authorizedWaveIds = new Set<string>();
    const collabBlips = new Set<string>();
    const writableCollabBlips = new Set<string>();
    const collabWaveByBlip = new Map<string, string>();
    // Joins capture the current leave epoch. Multiple duplicate joins may all
    // complete, but any leave/revoke/disconnect invalidates every queued join
    // without letting one request cancel another merely by starting later.
    const collabLeaveEpoch = new Map<string, number>();
    const collabGenerationByBlip = new Map<string, number>();
    const awarenessClientsByBlip = new Map<string, Map<number, number>>();
    (socket.data as any).accessIdentity = identity;
    (socket.data as any).accessSessionId = accessSessionId;
    (socket.data as any).authorizedWaveIds = authorizedWaveIds;
    (socket.data as any).collabBlips = collabBlips;
    (socket.data as any).writableCollabBlips = writableCollabBlips;
    (socket.data as any).collabWaveByBlip = collabWaveByBlip;
    (socket.data as any).collabGenerationByBlip = collabGenerationByBlip;

    const cancelPendingJoin = (blipId: string) => {
      collabLeaveEpoch.set(blipId, (collabLeaveEpoch.get(blipId) || 0) + 1);
    };

    const releaseSeedAuthority = (blipId: string) => {
      if (seedAuthorityOwnerByBlip.get(blipId) !== socket.id) return;
      if (!yjsDocCache.isEmpty(blipId)) {
        seedAuthorityOwnerByBlip.delete(blipId);
        return;
      }
      seedAuthorityOwnerByBlip.delete(blipId);
      if (revokedCollabBlips.has(blipId)) return;
      io?.to(`collab:blip:${blipId}`).emit(`blip:seed:retry:${blipId}`, {
        yjsGeneration: yjsDocCache.getGeneration(blipId) ?? 0,
      });
    };

    let sessionValidationInFlight = false;
    const validateSession = async (): Promise<boolean> => {
      if (!identity.id) return true;
      const session = (socket.request as any)?.session;
      if (!session || typeof session.reload !== 'function') {
        socket.emit('session:ended', { reason: 'invalidated' });
        socket.disconnect(true);
        return false;
      }
      return new Promise<boolean>((resolve) => {
        session.reload(async (error: unknown) => {
          let valid = !error && session.userId === identity.id;
          if (valid) {
            const credentialCheck = await checkSessionCredentialVersion(session);
            valid = credentialCheck.status === 'valid';
          }
          if (!valid) {
            socket.emit('session:ended', { reason: 'invalidated' });
            socket.disconnect(true);
          }
          resolve(valid);
        });
      });
    };
    const sessionValidationTimer = identity.id ? setInterval(() => {
      if (sessionValidationInFlight || !socket.connected) return;
      sessionValidationInFlight = true;
      void validateSession().finally(() => { sessionValidationInFlight = false; });
    }, SESSION_REVALIDATE_MS) : null;
    sessionValidationTimer?.unref?.();

    const removeSocketAwareness = (blipId: string) => {
      const clients = awarenessClientsByBlip.get(blipId);
      if (!clients || clients.size === 0) return;
      const removals = [...clients.entries()].map(([clientId, clock]) => ({
        clientId,
        clock: clock + 1,
        state: null,
      } satisfies AwarenessEntry));
      io?.to(`collab:blip:${blipId}`).except(socket.id).emit(
        `awareness:update:${blipId}`,
        { update: Array.from(encodeAwarenessEntries(removals)) },
      );
      const owners = awarenessOwnersByBlip.get(blipId);
      for (const clientId of clients.keys()) {
        if (owners?.get(clientId) === socket.id) owners.delete(clientId);
      }
      if (owners?.size === 0) awarenessOwnersByBlip.delete(blipId);
      awarenessClientsByBlip.delete(blipId);
    };
    (socket.data as any).removeSocketAwareness = removeSocketAwareness;

    const revokeWaveAccess = (waveId: string) => {
      authorizedWaveIds.delete(waveId);

      const waveRoom = roomForWave(waveId);
      const blipRoomPrefix = `ed:blip:${waveId}:`;
      const unreadRoomPrefix = `ed:wave:${waveId}:unread`;
      const presenceRooms: Array<{ room: string; waveId: string; blipId?: string }> = [];
      for (const room of [...socket.rooms]) {
        if (room === waveRoom) {
          presenceRooms.push({ room, waveId });
          socket.leave(room);
        } else if (room.startsWith(blipRoomPrefix)) {
          presenceRooms.push({ room, waveId, blipId: room.slice(blipRoomPrefix.length) });
          socket.leave(room);
        } else if (room.startsWith(unreadRoomPrefix)) {
          socket.leave(room);
        }
      }
      if (presenceRooms.length > 0) manager.leaveRooms(socket.id, presenceRooms);

      for (const [blipId, mappedWaveId] of [...collabWaveByBlip.entries()]) {
        if (mappedWaveId !== waveId) continue;
        cancelPendingJoin(blipId);
        removeSocketAwareness(blipId);
        socket.leave(`collab:blip:${blipId}`);
        const wasJoined = collabBlips.delete(blipId);
        writableCollabBlips.delete(blipId);
        collabWaveByBlip.delete(blipId);
        collabGenerationByBlip.delete(blipId);
        if (wasJoined) yjsDocCache.removeRef(blipId);
        releaseSeedAuthority(blipId);
      }
      // A permission revocation can arrive while resolveBlipAccess is still in
      // flight and before the pending join has populated collabWaveByBlip.
      for (const blipId of collabLeaveEpoch.keys()) cancelPendingJoin(blipId);
    };
    (socket.data as any).revokeWaveAccess = revokeWaveAccess;

    const revokeBlipAccess = (blipId: string) => {
      cancelPendingJoin(blipId);
      const waveId = collabWaveByBlip.get(blipId);
      removeSocketAwareness(blipId);
      socket.leave(`collab:blip:${blipId}`);
      const wasJoined = collabBlips.delete(blipId);
      writableCollabBlips.delete(blipId);
      collabWaveByBlip.delete(blipId);
      collabGenerationByBlip.delete(blipId);
      if (wasJoined) yjsDocCache.removeRef(blipId);
      releaseSeedAuthority(blipId);
      if (waveId) {
        const presenceRoom = roomForBlip(waveId, blipId);
        socket.leave(presenceRoom);
        manager.leaveRooms(socket.id, [{ room: presenceRoom, waveId, blipId }]);
      }
    };
    (socket.data as any).revokeBlipAccess = revokeBlipAccess;

    const reject = (event: string, waveId: string, permission: WavePermission) => {
      socket.emit('access:error', {
        event,
        waveId,
        permission,
        error: identity.id ? 'forbidden' : 'unauthenticated',
      });
    };

    const authorizeWave = async (event: string, waveId: string, permission: WavePermission) => {
      try {
        const policyEpoch = wavePolicyEpoch(waveId);
        if (!(await validateSession())) return null;
        const access = await resolveWaveAccess(waveId, identity);
        if (wavePolicyEpoch(waveId) !== policyEpoch) return null;
        if (!hasWavePermission(access, permission)) {
          reject(event, waveId, permission);
          return null;
        }
        authorizedWaveIds.add(waveId);
        return access;
      } catch {
        reject(event, waveId, permission);
        return null;
      }
    };

    socket.emit('hello', { ok: true });

    socket.on('editor:join', async (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        const blipId = String(p?.blipId || '').trim();
        if (!waveId) return;
        let access = null;
        if (blipId) {
          const policyEpoch = wavePolicyEpoch(waveId);
          const resolved = await resolveBlipAccess(blipId, identity);
          if (
            wavePolicyEpoch(waveId) !== policyEpoch
            || String(resolved.blip.waveId) !== waveId
            || !resolved.access.canRead
          ) {
            reject('editor:join', waveId, 'read');
            return;
          }
          access = resolved.access;
          authorizedWaveIds.add(waveId);
        } else {
          access = await authorizeWave('editor:join', waveId, 'read');
        }
        if (!access) return;
        const rooms = buildRooms(waveId, blipId);
        rooms.forEach(meta => socket.join(meta.room));
        manager.joinRooms(socket.id, rooms, {
          userId: identity.id,
          name: identity.name || identity.email,
        } satisfies PresenceIdentity);
      } catch {}
    });

    socket.on('editor:leave', (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        const blipId = String(p?.blipId || '').trim();
        if (!waveId) return;
        const rooms = buildRooms(waveId, blipId);
        rooms.forEach(meta => socket.leave(meta.room));
        manager.leaveRooms(socket.id, rooms);
      } catch {}
    });

    socket.on('wave:unread:join', async (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        if (!waveId) return;
        const access = await authorizeWave('wave:unread:join', waveId, 'read');
        if (!access || !identity.id) return;
        const rooms = [waveUnreadRoom(waveId), waveUnreadRoom(waveId, identity.id)];
        rooms.forEach((room) => socket.join(room));
      } catch {}
    });

    socket.on('wave:unread:leave', (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        if (!waveId) return;
        const rooms = [waveUnreadRoom(waveId), waveUnreadRoom(waveId, identity.id)];
        rooms.forEach((room) => socket.leave(room));
      } catch {}
    });

    socket.on('editor:presence:heartbeat', () => {
      manager.heartbeat(socket.id);
    });

    // --- Real-time collaboration rooms (awareness + document sync) ---
    socket.on('blip:join', async (p: any, acknowledge?: (result: Record<string, unknown>) => void) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId) return;
        const joinGeneration = collabLeaveEpoch.get(blipId) || 0;
        if (!collabLeaveEpoch.has(blipId)) collabLeaveEpoch.set(blipId, joinGeneration);
        const joinStillCurrent = () => socket.connected
          && collabLeaveEpoch.get(blipId) === joinGeneration;
        if (!(await validateSession())) {
          acknowledge?.({ ok: false, error: 'unauthenticated' });
          return;
        }
        if (!joinStillCurrent()) return;
        await yjsDocCache.runExclusive(blipId, async () => {
          if (!joinStillCurrent()) return;
          if (revokedCollabBlips.has(blipId)) {
            acknowledge?.({ ok: false, error: 'not_found' });
            return;
          }
          // Resolve inside the same lock as replacement, snapshot load, and
          // update. A queued join must never seed from content read before an
          // external replacement completed.
          const initial = await resolveBlipAccess(blipId, identity);
          if (!joinStillCurrent()) return;
          if (revokedCollabBlips.has(blipId)) {
            acknowledge?.({ ok: false, error: 'not_found' });
            return;
          }
          if (!initial.access.canRead) {
            reject('blip:join', String(initial.blip.waveId), 'read');
            acknowledge?.({ ok: false, error: identity.id ? 'forbidden' : 'unauthenticated' });
            return;
          }
          const joinedWaveId = String(initial.blip.waveId);
          const joinPolicyEpoch = wavePolicyEpoch(joinedWaveId);
          // Load before publishing membership/refcount. If leave/unmount wins
          // while CouchDB is pending, the generation check below cancels the
          // join instead of leaking a live ref with no client handlers.
          const loadGeneration = yjsGenerationOf((initial.blip as any).yjsGeneration);
          if (yjsGenerationOf(p?.yjsGeneration) !== loadGeneration) {
            acknowledge?.({
              ok: false,
              error: 'generation_mismatch',
              yjsGeneration: loadGeneration,
            });
            return;
          }
          try {
            await yjsDocCache.loadFromDb(blipId, loadGeneration);
            const loadedDoc = yjsDocCache.getOrCreate(blipId, loadGeneration);
            const topicRoot = blipId === String(initial.blip.waveId);
            if (!yjsDocCache.isEmpty(blipId) && !isBlbYjsDocument(loadedDoc, topicRoot)) {
              // Preserve the durable snapshot: it may contain acknowledged
              // edits whose HTML projection failed and therefore be newer than
              // Couch. Publishing it would poison a fresh editor, while
              // deleting it would silently lose the only durable copy. Drop
              // only this inactive in-memory decode and fail the join closed;
              // an explicit, evidence-backed external replacement can advance
              // the generation after the content has been recovered.
              yjsDocCache.discard(blipId);
              throw new Error('collaboration_snapshot_invalid');
            }
          } catch (error) {
            // A snapshot lookup failure must never be interpreted as an empty
            // collaborative history. Ask the client to retry without joining
            // the room or granting seed authority from potentially stale HTML.
            acknowledge?.({
              ok: false,
              error: 'collaboration_storage_unavailable',
              retryable: true,
            });
            console.error('[socket] blip:join snapshot load failed:', error);
            return;
          }
          if (!joinStillCurrent()) return;
          if (revokedCollabBlips.has(blipId)) {
            acknowledge?.({ ok: false, error: 'not_found' });
            return;
          }
          if (!(await validateSession())) {
            acknowledge?.({ ok: false, error: 'unauthenticated' });
            return;
          }
          if (!joinStillCurrent()) return;
          if (wavePolicyEpoch(joinedWaveId) !== joinPolicyEpoch) {
            acknowledge?.({ ok: false, error: 'access_changed' });
            return;
          }

          // Snapshot loading yields to CouchDB. Permissions or the durable
          // blip itself can change during that wait, while this socket is not
          // yet represented in collabBlips and therefore cannot be reached by
          // the normal live-room refresh/revoke sweep. Resolve again after the
          // load and make the final revoked/read/generation checks immediately
          // before publishing membership, refcounts, seed authority, or write
          // capability.
          const current = await resolveBlipAccess(blipId, identity);
          if (!joinStillCurrent()) return;
          if (
            String(current.blip.waveId) !== joinedWaveId
            || wavePolicyEpoch(joinedWaveId) !== joinPolicyEpoch
          ) {
            acknowledge?.({ ok: false, error: 'access_changed' });
            return;
          }
          if (revokedCollabBlips.has(blipId)) {
            acknowledge?.({ ok: false, error: 'not_found' });
            return;
          }
          if (!current.access.canRead) {
            reject('blip:join', String(current.blip.waveId), 'read');
            acknowledge?.({ ok: false, error: identity.id ? 'forbidden' : 'unauthenticated' });
            return;
          }
          const blip = current.blip;
          const access = current.access;
          const yjsGeneration = yjsGenerationOf((blip as any).yjsGeneration);
          if (yjsGeneration !== loadGeneration || yjsGenerationOf(p?.yjsGeneration) !== yjsGeneration) {
            acknowledge?.({
              ok: false,
              error: 'generation_mismatch',
              yjsGeneration,
            });
            return;
          }
          authorizedWaveIds.add(String(blip.waveId));
          socket.join(`collab:blip:${blipId}`);
          const alreadyJoined = collabBlips.has(blipId);
          collabBlips.add(blipId);
          collabWaveByBlip.set(blipId, String(blip.waveId));
          collabGenerationByBlip.set(blipId, yjsGeneration);
          if (access.canEdit) writableCollabBlips.add(blipId);
          else writableCollabBlips.delete(blipId);
          if (!alreadyJoined) yjsDocCache.addRef(blipId, yjsGeneration);
          const state = yjsDocCache.getState(blipId);
          const stateArr = (state && state.length > 2) ? Array.from(state) : [];
          if (stateArr.length > 0) seedAuthorityOwnerByBlip.delete(blipId);
          // Seed authority: if the server's Y.Doc has no prior state AND
          // no client has yet claimed seed authority for this blip in the
          // current process, the FIRST joiner gets shouldSeed=true and is
          // responsible for populating the Y.Doc from the blip's HTML.
          let shouldSeed = false;
          if (access.canEdit && stateArr.length === 0) {
            if (!seedAuthorityOwnerByBlip.has(blipId)) {
              seedAuthorityOwnerByBlip.set(blipId, socket.id);
              shouldSeed = true;
              console.log(`[socket] blip:join blipId=${blipId.slice(-8)} (seed authority granted)`);
            } else {
              console.log(`[socket] blip:join blipId=${blipId.slice(-8)} (empty state, no seed authority)`);
            }
          }
          const syncUser = authoritativeAwarenessUser(identity);
          // The acknowledgement is the protocol boundary: a compatible client
          // waits for this server-authorized result before publishing awareness
          // or requesting a reconnect diff. Emit it before the initial sync.
          acknowledge?.({
            ok: true,
            waveId: String(blip.waveId),
            canEdit: access.canEdit,
            yjsGeneration,
            user: syncUser,
          });
          socket.emit(`blip:sync:${blipId}`, {
            ok: true,
            waveId: String(blip.waveId),
            state: stateArr,
            shouldSeed,
            seedContent: shouldSeed ? String(blip.content || '') : undefined,
            canEdit: access.canEdit,
            yjsGeneration,
            user: syncUser,
          });
        });
      } catch (err) {
        acknowledge?.({ ok: false, error: 'not_found' });
        console.error('[socket] blip:join error:', err);
      }
    });

    socket.on('blip:leave', (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId) return;
        cancelPendingJoin(blipId);
        removeSocketAwareness(blipId);
        socket.leave(`collab:blip:${blipId}`);
        const wasJoined = collabBlips.delete(blipId);
        writableCollabBlips.delete(blipId);
        collabWaveByBlip.delete(blipId);
        collabGenerationByBlip.delete(blipId);
        if (wasJoined) yjsDocCache.removeRef(blipId);
        // If the seeder bailed before populating the Y.Doc, release
        // seed authority so the next joiner can seed. Task #57.
        releaseSeedAuthority(blipId);
      } catch {}
    });

    socket.on('blip:update', async (p: any, acknowledge?: (result: { ok: boolean; error?: string; blipId?: string }) => void) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId || !Array.isArray(p?.update)) {
          acknowledge?.({ ok: false, error: 'invalid_update' });
          return;
        }
        if (revokedCollabBlips.has(blipId) || !writableCollabBlips.has(blipId)) {
          reject('blip:update', collabWaveByBlip.get(blipId) || '', 'edit');
          acknowledge?.({ ok: false, error: 'forbidden', blipId });
          return;
        }
        const joinedGeneration = collabGenerationByBlip.get(blipId);
        if (
          joinedGeneration === undefined
          || yjsGenerationOf(p?.yjsGeneration) !== joinedGeneration
          || yjsDocCache.getGeneration(blipId) !== joinedGeneration
        ) {
          acknowledge?.({ ok: false, error: 'generation_mismatch', blipId });
          return;
        }
        if (
          p.update.length === 0
          || p.update.length > MAX_COLLAB_UPDATE_BYTES
          || p.update.some((value: unknown) => !Number.isInteger(value) || Number(value) < 0 || Number(value) > 255)
        ) {
          acknowledge?.({ ok: false, error: p.update.length > MAX_COLLAB_UPDATE_BYTES ? 'update_too_large' : 'invalid_update', blipId });
          return;
        }
        await yjsDocCache.runExclusive(blipId, () => {
          // Authorization can change while this update is queued behind a
          // snapshot/replacement operation. Revalidate at the mutation point,
          // not only before waiting for the per-blip lock.
          if (
            revokedCollabBlips.has(blipId)
            || !socket.connected
            || !collabBlips.has(blipId)
            || !writableCollabBlips.has(blipId)
          ) {
            reject('blip:update', collabWaveByBlip.get(blipId) || '', 'edit');
            acknowledge?.({ ok: false, error: 'forbidden', blipId });
            return;
          }
          const currentJoinedGeneration = collabGenerationByBlip.get(blipId);
          if (
            currentJoinedGeneration === undefined
            || currentJoinedGeneration !== joinedGeneration
            || yjsGenerationOf(p?.yjsGeneration) !== currentJoinedGeneration
            || yjsDocCache.getGeneration(blipId) !== currentJoinedGeneration
          ) {
            acknowledge?.({ ok: false, error: 'generation_mismatch', blipId });
            return;
          }
          const update = new Uint8Array(p.update);
          // Decode against a disposable document first. Malformed Yjs payloads
          // never reach the authoritative cache or another participant.
          const probe = new Y.Doc();
          const current = yjsDocCache.getState(blipId);
          if (current) Y.applyUpdate(probe, current, 'validation-base');
          Y.applyUpdate(probe, update, 'validation-candidate');
          const waveId = collabWaveByBlip.get(blipId);
          if (!isBlbYjsDocument(probe, Boolean(waveId && blipId === waveId))) {
            probe.destroy();
            acknowledge?.({ ok: false, error: 'invalid_blb_structure', blipId });
            return;
          }
          probe.destroy();
          yjsDocCache.applyUpdate(blipId, update, 'remote', currentJoinedGeneration);
          if (!yjsDocCache.isEmpty(blipId)) seedAuthorityOwnerByBlip.delete(blipId);
          const roomName = `collab:blip:${blipId}`;
          // Broadcast only after the server cache accepted the update.
          socket.to(roomName).emit(`blip:update:${blipId}`, {
            update: p.update,
            yjsGeneration: currentJoinedGeneration,
          });
          acknowledge?.({ ok: true, blipId });
        });
      } catch (err) {
        console.error('[socket] blip:update error:', err);
        acknowledge?.({ ok: false, error: 'invalid_update' });
      }
    });

    socket.on('blip:sync:request', (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId || !Array.isArray(p.stateVector)) return;
        if (!collabBlips.has(blipId)) return;
        const joinedGeneration = collabGenerationByBlip.get(blipId);
        if (joinedGeneration === undefined || yjsGenerationOf(p?.yjsGeneration) !== joinedGeneration) return;
        const sv = new Uint8Array(p.stateVector);
        const diff = yjsDocCache.encodeDiffUpdate(blipId, sv);
        if (diff && diff.length > 2) {
          socket.emit(`blip:sync:${blipId}`, {
            ok: true,
            waveId: collabWaveByBlip.get(blipId),
            state: Array.from(diff),
            canEdit: writableCollabBlips.has(blipId),
            yjsGeneration: joinedGeneration,
            user: authoritativeAwarenessUser(identity),
          });
        }
      } catch {}
    });

    socket.on('awareness:update', (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId) return;
        if (!writableCollabBlips.has(blipId)) {
          reject('awareness:update', collabWaveByBlip.get(blipId) || '', 'edit');
          return;
        }
        const authoritativeUser = authoritativeAwarenessUser(identity);
        if (!authoritativeUser) {
          reject('awareness:update', collabWaveByBlip.get(blipId) || '', 'edit');
          return;
        }
        let payload: { update?: number[]; states?: Record<string, unknown> };
        if (Array.isArray(p?.update)) {
          if (p.update.length > 65536) throw new Error('awareness_update_too_large');
          const raw = new Uint8Array(p.update);
          const entries = decodeAwarenessEntries(raw);
          const owners = awarenessOwnersByBlip.get(blipId) || new Map<number, string>();
          const socketClients = awarenessClientsByBlip.get(blipId) || new Map<number, number>();
          for (const entry of entries) {
            const owner = owners.get(entry.clientId);
            if (owner && owner !== socket.id) throw new Error('awareness_client_owned_by_other_socket');
            if (entry.state !== null) {
              if (!socketClients.has(entry.clientId) && socketClients.size >= 8) {
                throw new Error('awareness_client_limit');
              }
              owners.set(entry.clientId, socket.id);
              socketClients.set(entry.clientId, entry.clock);
            } else if (owner === socket.id) {
              owners.delete(entry.clientId);
              socketClients.delete(entry.clientId);
            }
          }
          awarenessOwnersByBlip.set(blipId, owners);
          awarenessClientsByBlip.set(blipId, socketClients);
          const sanitized = modifyAwarenessUpdate(raw, (state: Record<string, unknown> | null) => (
            state === null ? null : { ...state, user: authoritativeUser }
          ));
          payload = { update: Array.from(sanitized) };
        } else {
          // Rolling compatibility for stale raw-state clients. The values are
          // still rewritten to the authenticated session identity; no claimed
          // id/name/color crosses the server boundary.
          const states: Record<string, unknown> = {};
          const owners = awarenessOwnersByBlip.get(blipId) || new Map<number, string>();
          const socketClients = awarenessClientsByBlip.get(blipId) || new Map<number, number>();
          for (const [clientIdRaw, state] of Object.entries(p?.states || {}).slice(0, 8)) {
            const clientId = Number(clientIdRaw);
            if (!Number.isSafeInteger(clientId) || clientId < 0) continue;
            const owner = owners.get(clientId);
            if (owner && owner !== socket.id) throw new Error('awareness_client_owned_by_other_socket');
            if (!socketClients.has(clientId) && socketClients.size >= 8) {
              throw new Error('awareness_client_limit');
            }
            owners.set(clientId, socket.id);
            socketClients.set(clientId, 0);
            states[clientIdRaw] = {
              ...(state && typeof state === 'object' ? state as Record<string, unknown> : {}),
              user: authoritativeUser,
            };
          }
          awarenessOwnersByBlip.set(blipId, owners);
          awarenessClientsByBlip.set(blipId, socketClients);
          payload = { states };
        }
        socket.to(`collab:blip:${blipId}`).emit(`awareness:update:${blipId}`, payload);
      } catch (error) {
        console.warn('[socket] rejected awareness update', { socketId: socket.id, error });
        reject('awareness:update', '', 'edit');
      }
    });

    socket.on('disconnect', () => {
      if (sessionValidationTimer) clearInterval(sessionValidationTimer);
      for (const blipId of collabLeaveEpoch.keys()) cancelPendingJoin(blipId);
      manager.disconnect(socket.id);
      for (const blipId of collabBlips) {
        removeSocketAwareness(blipId);
        yjsDocCache.removeRef(blipId);
        // Release seed authority if the disconnecting client was the
        // seeder and never populated the Y.Doc. Task #57.
        releaseSeedAuthority(blipId);
      }
      collabBlips.clear();
      writableCollabBlips.clear();
      collabWaveByBlip.clear();
      collabGenerationByBlip.clear();
      collabLeaveEpoch.clear();
      awarenessClientsByBlip.clear();
      authorizedWaveIds.clear();
    });
  });
}

export async function closeSocket(): Promise<void> {
  presenceManager?.stopCleanupTimer();
  presenceManager = undefined;
  const current = io;
  io = undefined;
  if (!current) {
    awarenessOwnersByBlip.clear();
    wavePolicyEpochById.clear();
    return;
  }
  await new Promise<void>((resolve) => current.close(() => resolve()));
  awarenessOwnersByBlip.clear();
  wavePolicyEpochById.clear();
}

/** True only when this exact HTTP session owns a currently authorized writable
 * collaboration room for the blip. Routes use this to distinguish a normal
 * Yjs materialization save from an out-of-band full HTML replacement. */
export function hasWritableBlipSocket(
  blipId: string,
  sessionId: string,
  yjsGeneration?: number,
): boolean {
  if (!io || !sessionId) return false;
  for (const socket of io.sockets.sockets.values()) {
    if (String((socket.data as any)?.accessSessionId || '') !== sessionId) continue;
    const writable = (socket.data as any)?.writableCollabBlips;
    const generationByBlip = (socket.data as any)?.collabGenerationByBlip;
    if (!(writable instanceof Set) || !writable.has(blipId)) continue;
    if (
      yjsGeneration !== undefined
      && (!(generationByBlip instanceof Map) || generationByBlip.get(blipId) !== yjsGeneration)
    ) continue;
    return true;
  }
  return false;
}

/** A quiescent external replacement removes the old seed claim together with
 * its cache/snapshot. Otherwise an empty Y.Doc can strand every next joiner
 * with shouldSeed=false. */
export function clearBlipSeedAuthority(blipId: string): void {
  seedAuthorityOwnerByBlip.delete(blipId);
}

/**
 * A Socket.IO handshake keeps the session identity it authenticated with.
 * Destroying the HTTP session alone does not remove existing room/write
 * authority, so logout and account invalidation must disconnect every socket
 * bound to that user immediately.
 */
export function disconnectUserSockets(userId: string): number {
  if (!io || !userId) return 0;
  let disconnected = 0;
  for (const socket of io.sockets.sockets.values()) {
    const identity = (socket.data as any)?.accessIdentity;
    if (identity?.id !== userId) continue;
    socket.emit('session:ended', { reason: 'logout' });
    socket.disconnect(true);
    disconnected += 1;
  }
  return disconnected;
}

export function disconnectSessionSockets(sessionId: string): number {
  if (!io || !sessionId) return 0;
  let disconnected = 0;
  for (const socket of io.sockets.sockets.values()) {
    if ((socket.data as any)?.accessSessionId !== sessionId) continue;
    socket.emit('session:ended', { reason: 'logout' });
    socket.disconnect(true);
    disconnected += 1;
  }
  return disconnected;
}

export function emitEvent(event: string, payload: unknown) {
  try {
    // eslint-disable-next-line no-console
    console.log('[socket] emit', event, payload);
  } catch {}
  const data = (payload || {}) as any;
  const waveId = data.waveId
    || data.topicId
    || (event.startsWith('topic:') ? data.id : undefined);
  // Read/unread state is per-user private data. Never publish another
  // participant's user id or reading activity into the shared wave rooms.
  if ((event === 'blip:read' || event === 'wave:unread') && waveId && data.userId) {
    io?.to(waveUnreadRoom(String(waveId), String(data.userId))).emit(event, payload);
    return;
  }
  if (waveId) {
    // Content-bearing topic/blip/comment events must stay inside an
    // access-checked wave room. Unread subscribers use their own checked
    // room, so publish there as well for the Rizzoma layout hook.
    io?.to(roomForWave(String(waveId))).emit(event, payload);
    io?.to(waveUnreadRoom(String(waveId))).emit(event, payload);
  } else {
    io?.emit(event, payload);
  }
}

/**
 * Force-remove every subscription for a deleted wave. This is deliberately
 * separate from policy refresh because deleted metadata otherwise resembles a
 * legacy public-read-only wave to the compatibility layer.
 */
export function disconnectWaveSockets(waveId: string): number {
  // Topic deletion must invalidate not-yet-authorized joins too; those joins
  // cannot be found by the live-room sweep below.
  advanceWavePolicyEpoch(waveId);
  if (!io) return 0;
  let revoked = 0;
  for (const socket of io.sockets.sockets.values()) {
    const waveIds = (socket.data as any)?.authorizedWaveIds;
    if (waveIds instanceof Set && waveIds.has(waveId)) {
      socket.emit('access:changed', { waveId });
      const revoke = (socket.data as any)?.revokeWaveAccess;
      if (typeof revoke === 'function') revoke(waveId);
      revoked += 1;
    }
  }
  return revoked;
}

/** Revoke live CRDT/presence authority for tombstoned blips while leaving the
 * rest of the wave connected. Descendants are supplied by the delete route. */
export async function revokeBlipSockets(blipIds: string[]): Promise<number> {
  const unique = [...new Set(blipIds.filter(Boolean))];
  if (unique.length === 0) return 0;
  for (const blipId of unique) {
    revokedCollabBlips.add(blipId);
    seedAuthorityOwnerByBlip.delete(blipId);
  }
  let revoked = 0;
  if (io) {
    for (const socket of io.sockets.sockets.values()) {
      const collabBlips = (socket.data as any)?.collabBlips;
      const revoke = (socket.data as any)?.revokeBlipAccess;
      if (!(collabBlips instanceof Set) || typeof revoke !== 'function') continue;
      for (const blipId of unique) {
        if (!collabBlips.has(blipId)) continue;
        socket.emit('access:changed', { blipId, deleted: true, canRead: false, canEdit: false });
        revoke(blipId);
        revoked += 1;
      }
    }
  }
  // revokedCollabBlips is set synchronously above, before a queued update can
  // acquire this lock. The in-lock update recheck rejects it; discard therefore
  // runs after every earlier mutation and cannot be followed by a stale cache
  // recreation from an already-authorized handler.
  await Promise.all(unique.map((blipId) => yjsDocCache.runExclusive(blipId, () => {
    yjsDocCache.discard(blipId);
  })));
  return revoked;
}

/**
 * Re-evaluate live sockets after a policy or participant-role change. Readers
 * keep their rooms, demoted editors immediately lose Yjs/awareness write
 * authority, and users who lost read access are removed from every wave room.
 */
export async function refreshWaveSocketAccess(waveId: string): Promise<number> {
  // Invalidate pending joins before yielding. They are deliberately absent
  // from authorizedWaveIds until their final access result is safe to publish.
  const refreshPolicyEpoch = advanceWavePolicyEpoch(waveId);
  if (!io) return 0;
  let refreshed = 0;
  for (const socket of io.sockets.sockets.values()) {
    const waveIds = (socket.data as any)?.authorizedWaveIds;
    if (!(waveIds instanceof Set) || !waveIds.has(waveId)) continue;
    const identity = (socket.data as any)?.accessIdentity || {};
    let access = null;
    try {
      access = await resolveWaveAccess(waveId, identity);
    } catch {}
    // A newer policy mutation owns the final authority decision. Never let an
    // older, slower refresh re-grant rooms or write access from stale data.
    if (wavePolicyEpoch(waveId) !== refreshPolicyEpoch) continue;
    const writable = (socket.data as any)?.writableCollabBlips;
    const waveByBlip = (socket.data as any)?.collabWaveByBlip;
    if (access?.canRead) {
      if (writable instanceof Set && waveByBlip instanceof Map) {
        for (const [blipId, mappedWaveId] of waveByBlip.entries()) {
          if (mappedWaveId !== waveId) continue;
          if (access.canEdit) writable.add(blipId);
          else {
            writable.delete(blipId);
            const removeAwareness = (socket.data as any)?.removeSocketAwareness;
            if (typeof removeAwareness === 'function') removeAwareness(blipId);
          }
        }
      }
      socket.emit('access:changed', {
        waveId,
        role: access.role,
        canRead: access.canRead,
        canComment: access.canComment,
        canEdit: access.canEdit,
        canManage: access.canManage,
      });
    } else {
      socket.emit('access:changed', { waveId, role: 'outsider', canRead: false, canComment: false, canEdit: false, canManage: false });
      const revoke = (socket.data as any)?.revokeWaveAccess;
      if (typeof revoke === 'function') revoke(waveId);
    }
    refreshed += 1;
  }
  return refreshed;
}

export function emitEditorUpdate(waveId: string, blipId: string | undefined, payload: any) {
  const toRooms = [roomForWave(waveId)];
  if (blipId) toRooms.push(roomForBlip(waveId, blipId));
  toRooms.forEach(r => io?.to(r).emit('editor:update', payload));
}
