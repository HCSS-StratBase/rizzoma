import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { EditorPresenceManager, type PresenceIdentity, type PresenceEmitPayload } from './editorPresence.js';
import { yjsDocCache } from './yjsDocCache.js';

let io: Server | undefined;

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

export function initSocket(server: HttpServer, allowedOrigins: string[]) {
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

  const presenceManager = new EditorPresenceManager((payload: PresenceEmitPayload) => {
    io?.to(payload.room).emit('editor:presence', payload);
  });
  presenceManager.startCleanupTimer();
  yjsDocCache.start();

  io.on('connection', (socket) => {
    socket.emit('hello', { ok: true });

    socket.on('editor:join', (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        const blipId = String(p?.blipId || '').trim();
        const userId = p?.userId ? String(p.userId) : undefined;
        const name = p?.name ? String(p.name) : undefined;
        if (!waveId) return;
        const rooms = buildRooms(waveId, blipId);
        rooms.forEach(meta => socket.join(meta.room));
        presenceManager.joinRooms(socket.id, rooms, { userId, name } satisfies PresenceIdentity);
      } catch {}
    });

    socket.on('editor:leave', (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        const blipId = String(p?.blipId || '').trim();
        if (!waveId) return;
        const rooms = buildRooms(waveId, blipId);
        rooms.forEach(meta => socket.leave(meta.room));
        presenceManager.leaveRooms(socket.id, rooms);
      } catch {}
    });

    socket.on('wave:unread:join', (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        const userId = p?.userId ? String(p.userId) : undefined;
        if (!waveId) return;
        const rooms = [waveUnreadRoom(waveId), waveUnreadRoom(waveId, userId)];
        rooms.forEach((room) => socket.join(room));
      } catch {}
    });

    socket.on('wave:unread:leave', (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        const userId = p?.userId ? String(p.userId) : undefined;
        if (!waveId) return;
        const rooms = [waveUnreadRoom(waveId), waveUnreadRoom(waveId, userId)];
        rooms.forEach((room) => socket.leave(room));
      } catch {}
    });

    socket.on('editor:presence:heartbeat', () => {
      presenceManager.heartbeat(socket.id);
    });

    // --- Real-time collaboration rooms (awareness + document sync) ---
    const collabBlips = new Set<string>();

    socket.on('blip:join', async (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId) return;
        socket.join(`collab:blip:${blipId}`);
        collabBlips.add(blipId);
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
        if (stateArr.length === 0) {
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
        socket.to(`collab:blip:${blipId}`).emit(`awareness:update:${blipId}`, {
          states: p.states || {}
        });
      } catch {}
    });

    socket.on('disconnect', () => {
      presenceManager.disconnect(socket.id);
      for (const blipId of collabBlips) {
        yjsDocCache.removeRef(blipId);
        // Release seed authority if the disconnecting client was the
        // seeder and never populated the Y.Doc. Task #57.
        if (yjsDocCache.isEmpty(blipId)) seedAuthorityClaimed.delete(blipId);
      }
      collabBlips.clear();
    });
  });
}

export function emitEvent(event: string, payload: unknown) {
  try {
    // eslint-disable-next-line no-console
    console.log('[socket] emit', event, payload);
  } catch {}
  io?.emit(event, payload);
  if (event === 'wave:unread') {
    const waveId = (payload as any)?.waveId;
    const userId = (payload as any)?.userId;
    try {
      // Lightweight server-side trace to confirm unread emits fire
      // eslint-disable-next-line no-console
      console.log('[socket] emit wave:unread', { waveId, userId });
    } catch {}
    if (waveId) {
      io?.to(waveUnreadRoom(waveId)).emit('wave:unread', payload);
      if (userId) {
        io?.to(waveUnreadRoom(waveId, userId)).emit('wave:unread', payload);
      }
      // Temporary global broadcast to ensure clients receive unread events while room delivery is investigated.
      io?.emit('wave:unread', payload);
    }
  }
}

export function emitEditorUpdate(waveId: string, blipId: string | undefined, payload: any) {
  const toRooms = [roomForWave(waveId)];
  if (blipId) toRooms.push(roomForBlip(waveId, blipId));
  toRooms.forEach(r => io?.to(r).emit('editor:update', payload));
}
