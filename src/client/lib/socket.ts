import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;
let scheduledAuthReconnect: ReturnType<typeof setTimeout> | null = null;
let socketAuthGeneration = 0;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10000;

type SocketWithBuffers = Socket & {
  sendBuffer?: unknown[];
  receiveBuffer?: unknown[];
};

function clearSocketBuffers(target: Socket): void {
  const buffered = target as SocketWithBuffers;
  if (Array.isArray(buffered.sendBuffer)) buffered.sendBuffer.splice(0);
  if (Array.isArray(buffered.receiveBuffer)) buffered.receiveBuffer.splice(0);
}

/**
 * Sever the transport before an auth mutation or cross-tab rebootstrap.
 * Socket.IO otherwise keeps the handshake's old server session and can retain
 * packets emitted while disconnected for delivery under the next account.
 */
export function disconnectSocketForAuthTransition(): void {
  socketAuthGeneration += 1;
  if (scheduledAuthReconnect !== null) {
    clearTimeout(scheduledAuthReconnect);
    scheduledAuthReconnect = null;
  }
  if (!socket) return;
  socket.disconnect();
  clearSocketBuffers(socket);
}

/** Reconnect the same listener-bearing Socket after React applies new auth. */
export function reconnectSocketAfterAuthTransition(): void {
  const target = socket;
  if (!target) return;
  if (scheduledAuthReconnect !== null) clearTimeout(scheduledAuthReconnect);
  scheduledAuthReconnect = setTimeout(() => {
    scheduledAuthReconnect = null;
    if (socket !== target) return;
    // Cleanup effects may have emitted leave packets while disconnected. None
    // of those account-bound packets may cross the auth boundary.
    clearSocketBuffers(target);
    if (!target.connected) target.connect();
  }, 0);
}

export function resetSocketForAuthTransition(): void {
  disconnectSocketForAuthTransition();
  reconnectSocketAfterAuthTransition();
}

function getSocket(): Socket {
  if (!socket) {
    const resolveSocketUrl = () => {
      if (typeof window === 'undefined') return '/';
      const override = (window as any).__RIZZOMA_SOCKET_URL;
      if (override) return override;
      try {
        const current = new URL(window.location.href);
        if (current.port === '3000') current.port = '8788';
        return current.origin;
      } catch {
        return window.location.origin || '/';
      }
    };
    const url = resolveSocketUrl();
    socket = io(url, {
      withCredentials: true,
      autoConnect: true,
      path: '/socket.io',
      transports: ['websocket'],
    });
    socket.on('connect', () => console.log('[socket] connected', socket?.id));
    socket.on('connect_error', (err) => console.error('[socket] connect_error', err));
    // Expose for debugging
    if (typeof window !== 'undefined') (window as any).__socket = socket;
  }
  return socket;
}

export function subscribeTopicsRefresh(onRefresh: () => void): () => void {
  const s = getSocket();
  const handler = () => onRefresh();
  s.on('topic:created', handler);
  s.on('topic:updated', handler);
  s.on('topic:deleted', handler);
  return () => {
    s.off('topic:created', handler);
    s.off('topic:updated', handler);
    s.off('topic:deleted', handler);
  };
}

export function subscribeTopicDetail(topicId: string, onChange: (ev: string, payload: any) => void): () => void {
  const s = getSocket();
  const handler = (payload: any) => { if (!payload) return; if (payload.id === topicId || payload.topicId === topicId) onChange('change', payload); };
  s.on('topic:updated', handler);
  s.on('comment:created', handler);
  s.on('comment:updated', handler);
  s.on('comment:deleted', handler);
  return () => {
    s.off('topic:updated', handler);
    s.off('comment:created', handler);
    s.off('comment:updated', handler);
    s.off('comment:deleted', handler);
  };
}

export function subscribeLinks(onChange: () => void): () => void {
  const s = getSocket();
  const handler = () => onChange();
  s.on('link:created', handler);
  s.on('link:deleted', handler);
  return () => {
    s.off('link:created', handler);
    s.off('link:deleted', handler);
  };
}
export function subscribeEditor(waveId: string, onChange: (payload: any) => void): () => void {
  const s = getSocket();
  // Rejoin after an auth-bound transport reset; Socket.IO rooms belong to a
  // connection and are discarded server-side on disconnect.
  const join = () => s.emit('editor:join', { waveId });
  s.on('connect', join);
  if (s.connected) join();
  const handler = (p: any) => { if (!p || p.waveId !== waveId) return; onChange(p); };
  s.on('editor:snapshot', handler);
  s.on('editor:update', handler);
  return () => {
    try { if (s.connected) s.emit('editor:leave', { waveId }); } catch {}
    s.off('connect', join);
    s.off('editor:snapshot', handler);
    s.off('editor:update', handler);
  };
}

export function subscribeEditorPresence(
  waveId: string,
  blipId: string | undefined,
  onPresence: (payload: { room: string; waveId: string; blipId?: string; count: number; users?: Array<{ userId?: string; name?: string }> }) => void,
): () => void {
  const s = getSocket();
  let disposed = false;
  // Join presence with the newly authenticated identity on every connection.
  const join = async () => {
    const authGeneration = socketAuthGeneration;
    try {
      const meResp = await fetch('/api/auth/me', { credentials: 'include' });
      let userId: string | undefined;
      let name: string | undefined;
      try {
        const body = await meResp.json();
        userId = body?.id ? String(body.id) : undefined;
        name = typeof body?.name === 'string' && body.name.trim()
          ? String(body.name).trim()
          : body?.email ? String(body.email) : undefined;
      } catch {}
      if (disposed || !s.connected || authGeneration !== socketAuthGeneration) return;
      s.emit('editor:join', { waveId, blipId, userId, name });
    } catch {
      if (disposed || !s.connected || authGeneration !== socketAuthGeneration) return;
      s.emit('editor:join', { waveId, blipId });
    }
  };
  s.on('connect', join);
  if (s.connected) void join();
  const handler = (p: any) => {
    if (!p || p.waveId !== waveId) return;
    if (p.blipId && blipId && p.blipId !== blipId) return;
    onPresence(p);
  };
  s.on('editor:presence', handler);
  const heartbeat = typeof window !== 'undefined'
    ? window.setInterval(() => {
      try { if (s.connected) s.emit('editor:presence:heartbeat'); } catch {}
    }, PRESENCE_HEARTBEAT_INTERVAL_MS)
    : null;
  return () => {
    disposed = true;
    try { if (s.connected) s.emit('editor:leave', { waveId, blipId }); } catch {}
    s.off('connect', join);
    s.off('editor:presence', handler);
    if (heartbeat && typeof window !== 'undefined') window.clearInterval(heartbeat);
  };
}

export type BlipSocketEvent =
  | { action: 'created' | 'updated' | 'deleted'; waveId: string; blipId: string; updatedAt?: number; userId?: string }
  | { action: 'read'; waveId: string; blipId: string; readAt?: number; userId?: string };
export type WaveUnreadEvent = { waveId: string; userId?: string };

export function subscribeBlipEvents(waveId: string, onEvent: (payload: BlipSocketEvent) => void): () => void {
  const s = getSocket();
  const handlerFor = (action: BlipSocketEvent['action']) => (p: any) => {
    if (!p || p.waveId !== waveId || !p.blipId) return;
    onEvent({ action, waveId: String(p.waveId), blipId: String(p.blipId), updatedAt: p.updatedAt ? Number(p.updatedAt) : undefined, readAt: p.readAt ? Number(p.readAt) : undefined, userId: p.userId ? String(p.userId) : undefined } as BlipSocketEvent);
  };
  const created = handlerFor('created');
  const updated = handlerFor('updated');
  const deleted = handlerFor('deleted');
  const read = handlerFor('read');
  s.on('blip:created', created);
  s.on('blip:updated', updated);
  s.on('blip:deleted', deleted);
  s.on('blip:read', read);
  return () => {
    s.off('blip:created', created);
    s.off('blip:updated', updated);
    s.off('blip:deleted', deleted);
    s.off('blip:read', read);
  };
}

export function subscribeWaveUnread(waveId: string, onEvent: (payload: WaveUnreadEvent) => void, userId?: string | null): () => void {
  const s = getSocket();
  const join = () => s.emit('wave:unread:join', { waveId, userId: userId || undefined });
  s.on('connect', join);
  if (s.connected) join();
  const handler = (p: any) => {
    if (!p || p.waveId !== waveId) return;
    onEvent({ waveId: String(p.waveId), userId: p.userId ? String(p.userId) : undefined });
  };
  s.on('wave:unread', handler);
  return () => {
    try { if (s.connected) s.emit('wave:unread:leave', { waveId, userId: userId || undefined }); } catch {}
    s.off('connect', join);
    s.off('wave:unread', handler);
  };
}

export function ensureWaveUnreadJoin(waveId: string, userId?: string | null) {
  const s = getSocket();
  if (s.connected) s.emit('wave:unread:join', { waveId, userId: userId || undefined });
}

export function emitWaveUnread(waveId: string, userId?: string | null) {
  const s = getSocket();
  try {
    if (s.connected) s.emit('wave:unread', { waveId, userId: userId || undefined });
  } catch {}
}

export { getSocket };
