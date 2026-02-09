import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { EditorPresenceManager, type PresenceIdentity, type PresenceEmitPayload } from './editorPresence.js';
import { yjsDocCache } from './yjsDocCache.js';

let io: Server | undefined;

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
        // Always send sync response so client knows when it's safe to seed content.
        // Empty array signals "no prior state" — client should seed from blip HTML.
        const state = yjsDocCache.getState(blipId);
        const stateArr = (state && state.length > 2) ? Array.from(state) : [];
        // Minimal join trace for debugging room membership
        if (stateArr.length === 0) console.log(`[socket] blip:join blipId=${blipId.slice(-8)} (fresh Y.Doc)`);
        socket.emit(`blip:sync:${blipId}`, { state: stateArr });
      } catch (err) { console.error('[socket] blip:join error:', err); }
    });

    socket.on('blip:leave', (p: any) => {
      try {
        const blipId = String(p?.blipId || '').trim();
        if (!blipId) return;
        socket.leave(`collab:blip:${blipId}`);
        collabBlips.delete(blipId);
        yjsDocCache.removeRef(blipId);
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
