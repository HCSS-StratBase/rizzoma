import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

let io: Server | undefined;

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
  });
}

export function emitEvent(event: string, payload: unknown) {
  io?.emit(event, payload);
}

