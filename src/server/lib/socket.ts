import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { EditorPresenceManager, type PresenceIdentity, type PresenceEmitPayload } from './editorPresence.js';

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

    socket.on('disconnect', () => {
      presenceManager.disconnect(socket.id);
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
