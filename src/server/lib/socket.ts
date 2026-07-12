import type { Server as HttpServer } from 'http';
import type { RequestHandler } from 'express';
import { Server } from 'socket.io';
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
    const authorizedWaveIds = new Set<string>();
    const collabBlips = new Set<string>();
    const writableCollabBlips = new Set<string>();
    const collabWaveByBlip = new Map<string, string>();
    (socket.data as any).accessIdentity = identity;
    (socket.data as any).authorizedWaveIds = authorizedWaveIds;
    (socket.data as any).collabBlips = collabBlips;
    (socket.data as any).writableCollabBlips = writableCollabBlips;
    (socket.data as any).collabWaveByBlip = collabWaveByBlip;

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
        socket.leave(`collab:blip:${blipId}`);
        collabBlips.delete(blipId);
        writableCollabBlips.delete(blipId);
        collabWaveByBlip.delete(blipId);
        yjsDocCache.removeRef(blipId);
        if (yjsDocCache.isEmpty(blipId)) seedAuthorityClaimed.delete(blipId);
      }
    };
    (socket.data as any).revokeWaveAccess = revokeWaveAccess;

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
    socket.on('blip:join', async (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId) return;
        const { blip, access } = await resolveBlipAccess(blipId, identity);
        if (!access.canRead) {
          reject('blip:join', String(blip.waveId), 'read');
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
        socket.emit(`blip:sync:${blipId}`, { state: stateArr, shouldSeed });
      } catch (err) { console.error('[socket] blip:join error:', err); }
    });

    socket.on('blip:leave', (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId) return;
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

    socket.on('blip:update', (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId || !Array.isArray(p.update)) return;
        if (!writableCollabBlips.has(blipId)) {
          reject('blip:update', collabWaveByBlip.get(blipId) || '', 'edit');
          return;
        }
        const roomName = `collab:blip:${blipId}`;
        // Relay to other clients FIRST, then apply to cache
        socket.to(roomName).emit(`blip:update:${blipId}`, { update: p.update });
        try {
          const update = new Uint8Array(p.update);
          yjsDocCache.applyUpdate(blipId, update, 'remote');
        } catch (cacheErr) { console.warn('[socket] blip:update cache error (relay already sent):', cacheErr); }
      } catch (err) { console.error('[socket] blip:update error:', err); }
    });

    socket.on('blip:sync:request', (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId || !Array.isArray(p.stateVector)) return;
        if (!collabBlips.has(blipId)) return;
        const sv = new Uint8Array(p.stateVector);
        const diff = yjsDocCache.encodeDiffUpdate(blipId, sv);
        if (diff && diff.length > 2) {
          socket.emit(`blip:sync:${blipId}`, { state: Array.from(diff) });
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
        const payload = Array.isArray(p?.update)
          ? { update: p.update }
          : { states: p?.states || {} }; // rolling compatibility with stale clients
        socket.to(`collab:blip:${blipId}`).emit(`awareness:update:${blipId}`, payload);
      } catch {}
    });

    socket.on('disconnect', () => {
      manager.disconnect(socket.id);
      for (const blipId of collabBlips) {
        yjsDocCache.removeRef(blipId);
        // Release seed authority if the disconnecting client was the
        // seeder and never populated the Y.Doc. Task #57.
        if (yjsDocCache.isEmpty(blipId)) seedAuthorityClaimed.delete(blipId);
      }
      collabBlips.clear();
      writableCollabBlips.clear();
      collabWaveByBlip.clear();
      authorizedWaveIds.clear();
    });
  });
}

export async function closeSocket(): Promise<void> {
  presenceManager?.stopCleanupTimer();
  presenceManager = undefined;
  const current = io;
  io = undefined;
  if (!current) return;
  await new Promise<void>((resolve) => current.close(() => resolve()));
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
  if (waveId) {
    // Content-bearing topic/blip/comment events must stay inside an
    // access-checked wave room. Unread subscribers use their own checked
    // room, so publish there as well for the Rizzoma layout hook.
    io?.to(roomForWave(String(waveId))).emit(event, payload);
    io?.to(waveUnreadRoom(String(waveId))).emit(event, payload);
  } else {
    io?.emit(event, payload);
  }
  if (event === 'wave:unread') {
    const waveId = data.waveId;
    const userId = (payload as any)?.userId;
    try {
      // Lightweight server-side trace to confirm unread emits fire
      // eslint-disable-next-line no-console
      console.log('[socket] emit wave:unread', { waveId, userId });
    } catch {}
    if (waveId) {
      if (userId) {
        io?.to(waveUnreadRoom(waveId, userId)).emit('wave:unread', payload);
      }
    }
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
          else writable.delete(blipId);
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
