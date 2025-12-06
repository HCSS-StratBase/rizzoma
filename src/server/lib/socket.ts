import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { EditorPresenceManager, type PresenceIdentity } from './editorPresence';

let io: Server | undefined;

function roomForWave(waveId: string) { return `ed:wave:${waveId}`; }
function roomForBlip(waveId: string, blipId: string) { return `ed:blip:${waveId}:${blipId}`; }
function buildRooms(waveId: string, blipId?: string) {
  const rooms = [{ room: roomForWave(waveId), waveId }];
  if (blipId) rooms.push({ room: roomForBlip(waveId, blipId), waveId, blipId });
  return rooms;
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

  const presenceManager = new EditorPresenceManager((payload) => {
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

    socket.on('editor:presence:heartbeat', () => {
      presenceManager.heartbeat(socket.id);
    });

    socket.on('disconnect', () => {
      presenceManager.disconnect(socket.id);
    });
  });
}

export function emitEvent(event: string, payload: unknown) {
  io?.emit(event, payload);
}

export function emitEditorUpdate(waveId: string, blipId: string | undefined, payload: any) {
  const toRooms = [roomForWave(waveId)];
  if (blipId) toRooms.push(roomForBlip(waveId, blipId));
  toRooms.forEach(r => io?.to(r).emit('editor:update', payload));
}
