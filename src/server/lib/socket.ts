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
const seedAuthorityClaimed = new Set<string>();

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
    const awarenessClientsByBlip = new Map<string, Map<number, number>>();
    (socket.data as any).accessIdentity = identity;
    (socket.data as any).accessSessionId = accessSessionId;
    (socket.data as any).authorizedWaveIds = authorizedWaveIds;
    (socket.data as any).collabBlips = collabBlips;
    (socket.data as any).writableCollabBlips = writableCollabBlips;
    (socket.data as any).collabWaveByBlip = collabWaveByBlip;

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
        session.reload((error: unknown) => {
          const valid = !error && session.userId === identity.id;
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
        removeSocketAwareness(blipId);
        socket.leave(`collab:blip:${blipId}`);
        collabBlips.delete(blipId);
        writableCollabBlips.delete(blipId);
        collabWaveByBlip.delete(blipId);
        yjsDocCache.removeRef(blipId);
        if (yjsDocCache.isEmpty(blipId)) seedAuthorityClaimed.delete(blipId);
      }
    };
    (socket.data as any).revokeWaveAccess = revokeWaveAccess;

    const revokeBlipAccess = (blipId: string) => {
      const waveId = collabWaveByBlip.get(blipId);
      removeSocketAwareness(blipId);
      socket.leave(`collab:blip:${blipId}`);
      collabBlips.delete(blipId);
      writableCollabBlips.delete(blipId);
      collabWaveByBlip.delete(blipId);
      yjsDocCache.removeRef(blipId);
      seedAuthorityClaimed.delete(blipId);
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
        if (!(await validateSession())) return null;
        const access = await resolveWaveAccess(waveId, identity);
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
          const resolved = await resolveBlipAccess(blipId, identity);
          if (String(resolved.blip.waveId) !== waveId || !resolved.access.canRead) {
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
        if (!(await validateSession())) {
          acknowledge?.({ ok: false, error: 'unauthenticated' });
          return;
        }
        const { blip, access } = await resolveBlipAccess(blipId, identity);
        if (!access.canRead) {
          reject('blip:join', String(blip.waveId), 'read');
          acknowledge?.({ ok: false, error: identity.id ? 'forbidden' : 'unauthenticated' });
          return;
        }
        authorizedWaveIds.add(String(blip.waveId));
        socket.join(`collab:blip:${blipId}`);
        collabBlips.add(blipId);
        collabWaveByBlip.set(blipId, String(blip.waveId));
        if (access.canEdit) writableCollabBlips.add(blipId);
        yjsDocCache.addRef(blipId);
        // Load from CouchDB if this is a fresh Y.Doc
        await yjsDocCache.loadFromDb(blipId);
        const state = yjsDocCache.getState(blipId);
        const stateArr = (state && state.length > 2) ? Array.from(state) : [];
        // Seed authority: if the server's Y.Doc has no prior state AND
        // no client has yet claimed seed authority for this blip in the
        // current process, the FIRST joiner gets shouldSeed=true and is
        // responsible for populating the Y.Doc from the blip's HTML.
        // Every subsequent joiner (or any joiner once state exists) gets
        // shouldSeed=false and must wait for Y.js updates to arrive.
        // This avoids the race where both tabs join simultaneously, both
        // receive an empty state, and both seed their local Y.Doc from
        // HTML — producing divergent CRDTs that can't merge cleanly.
        // Task #57 (2026-04-15).
        let shouldSeed = false;
        if (access.canEdit && stateArr.length === 0) {
          if (!seedAuthorityClaimed.has(blipId)) {
            seedAuthorityClaimed.add(blipId);
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
          user: syncUser,
        });
        socket.emit(`blip:sync:${blipId}`, {
          ok: true,
          waveId: String(blip.waveId),
          state: stateArr,
          shouldSeed,
          canEdit: access.canEdit,
          user: syncUser,
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
        removeSocketAwareness(blipId);
        socket.leave(`collab:blip:${blipId}`);
        collabBlips.delete(blipId);
        writableCollabBlips.delete(blipId);
        collabWaveByBlip.delete(blipId);
        yjsDocCache.removeRef(blipId);
        // If the seeder bailed before populating the Y.Doc, release
        // seed authority so the next joiner can seed. Task #57.
        if (yjsDocCache.isEmpty(blipId)) seedAuthorityClaimed.delete(blipId);
      } catch {}
    });

    socket.on('blip:update', (p: any, acknowledge?: (result: { ok: boolean; error?: string; blipId?: string }) => void) => {
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
        if (
          p.update.length === 0
          || p.update.length > MAX_COLLAB_UPDATE_BYTES
          || p.update.some((value: unknown) => !Number.isInteger(value) || Number(value) < 0 || Number(value) > 255)
        ) {
          acknowledge?.({ ok: false, error: p.update.length > MAX_COLLAB_UPDATE_BYTES ? 'update_too_large' : 'invalid_update', blipId });
          return;
        }
        const update = new Uint8Array(p.update);
        // Decode against a disposable document first. Malformed Yjs payloads
        // never reach the authoritative cache or another participant.
        const probe = new Y.Doc();
        const current = yjsDocCache.getState(blipId);
        if (current) Y.applyUpdate(probe, current, 'validation-base');
        Y.applyUpdate(probe, update, 'validation-candidate');
        probe.destroy();
        yjsDocCache.applyUpdate(blipId, update, 'remote');
        const roomName = `collab:blip:${blipId}`;
        // Broadcast only after the server cache accepted the update.
        socket.to(roomName).emit(`blip:update:${blipId}`, { update: p.update });
        acknowledge?.({ ok: true, blipId });
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
        const sv = new Uint8Array(p.stateVector);
        const diff = yjsDocCache.encodeDiffUpdate(blipId, sv);
        if (diff && diff.length > 2) {
          socket.emit(`blip:sync:${blipId}`, {
            ok: true,
            waveId: collabWaveByBlip.get(blipId),
            state: Array.from(diff),
            canEdit: writableCollabBlips.has(blipId),
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
      manager.disconnect(socket.id);
      for (const blipId of collabBlips) {
        removeSocketAwareness(blipId);
        yjsDocCache.removeRef(blipId);
        // Release seed authority if the disconnecting client was the
        // seeder and never populated the Y.Doc. Task #57.
        if (yjsDocCache.isEmpty(blipId)) seedAuthorityClaimed.delete(blipId);
      }
      collabBlips.clear();
      writableCollabBlips.clear();
      collabWaveByBlip.clear();
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
    return;
  }
  await new Promise<void>((resolve) => current.close(() => resolve()));
  awarenessOwnersByBlip.clear();
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
export function revokeBlipSockets(blipIds: string[]): number {
  const unique = [...new Set(blipIds.filter(Boolean))];
  if (unique.length === 0) return 0;
  for (const blipId of unique) {
    revokedCollabBlips.add(blipId);
    yjsDocCache.discard(blipId);
  }
  if (!io) return 0;
  let revoked = 0;
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
  return revoked;
}

/**
 * Re-evaluate live sockets after a policy or participant-role change. Readers
 * keep their rooms, demoted editors immediately lose Yjs/awareness write
 * authority, and users who lost read access are removed from every wave room.
 */
export async function refreshWaveSocketAccess(waveId: string): Promise<number> {
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
