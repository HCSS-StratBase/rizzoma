type PresenceIdentity = { userId?: string; name?: string };

type PresenceEntry = { identity: PresenceIdentity; lastSeen: number };

type PresenceRoomMeta = { room: string; waveId: string; blipId?: string };

type PresenceEmitPayload = { room: string; waveId: string; blipId?: string; count: number; users: PresenceIdentity[] };

type PresenceManagerOptions = {
  ttlMs?: number;
  debounceMs?: number;
  cleanupIntervalMs?: number;
  now?: () => number;
};

export class EditorPresenceManager {
  private rooms = new Map<string, { meta: PresenceRoomMeta; entries: Map<string, PresenceEntry> }>();
  private pendingEmits = new Map<string, NodeJS.Timeout>();
  private cleanupTimer?: NodeJS.Timeout;
  private readonly ttlMs: number;
  private readonly debounceMs: number;
  private readonly cleanupIntervalMs: number;
  private readonly now: () => number;

  constructor(private readonly emit: (payload: PresenceEmitPayload) => void, options?: PresenceManagerOptions) {
    this.ttlMs = options?.ttlMs ?? 20000;
    this.debounceMs = options?.debounceMs ?? 75;
    this.cleanupIntervalMs = options?.cleanupIntervalMs
      ?? Math.min(5000, Math.max(1000, Math.floor(this.ttlMs / 2)));
    this.now = options?.now ?? (() => Date.now());
  }

  startCleanupTimer() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.pruneExpired(), this.cleanupIntervalMs);
    if (typeof this.cleanupTimer.unref === 'function') this.cleanupTimer.unref();
  }

  stopCleanupTimer() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
  }

  joinRooms(socketId: string, rooms: PresenceRoomMeta[], identity: PresenceIdentity = {}) {
    const now = this.now();
    rooms.forEach((meta) => {
      const state = this.ensureRoom(meta);
      state.entries.set(socketId, { identity, lastSeen: now });
      this.scheduleEmit(meta.room);
    });
  }

  leaveRooms(socketId: string, rooms: PresenceRoomMeta[]) {
    rooms.forEach((meta) => {
      const state = this.rooms.get(meta.room);
      if (!state) return;
      const removed = state.entries.delete(socketId);
      if (removed) {
        this.scheduleEmit(meta.room);
        if (state.entries.size === 0) {
          // Keep meta until emit runs so consumers are notified of zero count.
          // Removal happens in emitPresence when size stays zero.
        }
      }
    });
  }

  disconnect(socketId: string) {
    for (const [room, state] of this.rooms.entries()) {
      if (state.entries.delete(socketId)) this.scheduleEmit(room);
    }
  }

  heartbeat(socketId: string) {
    const now = this.now();
    for (const state of this.rooms.values()) {
      const entry = state.entries.get(socketId);
      if (entry) entry.lastSeen = now;
    }
  }

  pruneExpired(now = this.now()) {
    for (const [room, state] of this.rooms.entries()) {
      let changed = false;
      for (const [socketId, entry] of state.entries.entries()) {
        if (now - entry.lastSeen > this.ttlMs) {
          state.entries.delete(socketId);
          changed = true;
        }
      }
      if (changed) this.scheduleEmit(room);
    }
  }

  private ensureRoom(meta: PresenceRoomMeta) {
    let state = this.rooms.get(meta.room);
    if (!state) {
      state = { meta, entries: new Map() };
      this.rooms.set(meta.room, state);
    } else {
      state.meta = meta;
    }
    return state;
  }

  private scheduleEmit(room: string) {
    if (this.pendingEmits.has(room)) return;
    const timeout = setTimeout(() => {
      this.pendingEmits.delete(room);
      this.emitPresence(room);
    }, this.debounceMs);
    this.pendingEmits.set(room, timeout);
  }

  private emitPresence(room: string) {
    const state = this.rooms.get(room);
    if (!state) return;
    const users = Array.from(state.entries.values()).map(entry => entry.identity).filter(Boolean);
    const payload: PresenceEmitPayload = {
      room,
      waveId: state.meta.waveId,
      blipId: state.meta.blipId,
      count: users.length,
      users,
    };
    this.emit(payload);
    if (state.entries.size === 0) this.rooms.delete(room);
  }
}

export type { PresenceIdentity, PresenceRoomMeta, PresenceEmitPayload, PresenceManagerOptions };
