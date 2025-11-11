import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

let io: Server | undefined;

// Track lightweight presence per room
const presence = new Map<string, Set<string>>();

function roomForWave(waveId: string) { return `ed:wave:${waveId}`; }
function roomForBlip(waveId: string, blipId: string) { return `ed:blip:${waveId}:${blipId}`; }

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

  io.on('connection', (socket) => {
    socket.emit('hello', { ok: true });

    socket.on('editor:join', (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        const blipId = String(p?.blipId || '').trim();
        if (!waveId) return;
        const rooms: string[] = [roomForWave(waveId)];
        if (blipId) rooms.push(roomForBlip(waveId, blipId));
        rooms.forEach(r => {
          socket.join(r);
          const set = presence.get(r) || new Set<string>();
          set.add(socket.id);
          presence.set(r, set);
          io?.to(r).emit('editor:presence', { room: r, waveId, blipId: blipId || undefined, count: set.size });
        });
      } catch {}
    });

    socket.on('editor:leave', (p: any) => {
      try {
        const waveId = String(p?.waveId || '').trim();
        const blipId = String(p?.blipId || '').trim();
        if (!waveId) return;
        const rooms: string[] = [roomForWave(waveId)];
        if (blipId) rooms.push(roomForBlip(waveId, blipId));
        rooms.forEach(r => {
          socket.leave(r);
          const set = presence.get(r);
          if (set) { set.delete(socket.id); io?.to(r).emit('editor:presence', { room: r, waveId, blipId: blipId || undefined, count: set.size }); }
        });
      } catch {}
    });

    socket.on('disconnect', () => {
      // clear all rooms presence for this socket
      for (const [r, set] of presence.entries()) {
        if (set.delete(socket.id)) {
          const [_, scope, waveId, blipId] = r.split(':');
          io?.to(r).emit('editor:presence', { room: r, waveId, blipId: scope === 'blip' ? blipId : undefined, count: set.size });
        }
      }
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
