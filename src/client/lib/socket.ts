import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;
const PRESENCE_HEARTBEAT_INTERVAL_MS = 10000;

function getSocket(): Socket {
  if (!socket) {
    socket = io('/', { withCredentials: true, autoConnect: true });
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
  // Join wave-level room for targeted updates
  s.emit('editor:join', { waveId });
  const handler = (p: any) => { if (!p || p.waveId !== waveId) return; onChange(p); };
  s.on('editor:snapshot', handler);
  s.on('editor:update', handler);
  return () => {
    try { s.emit('editor:leave', { waveId }); } catch {}
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
  // Join presence with optional identity by best-effort fetching /api/auth/me
  (async () => {
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
      s.emit('editor:join', { waveId, blipId, userId, name });
    } catch {
      s.emit('editor:join', { waveId, blipId });
    }
  })();
  const handler = (p: any) => {
    if (!p || p.waveId !== waveId) return;
    if (p.blipId && blipId && p.blipId !== blipId) return;
    onPresence(p);
  };
  s.on('editor:presence', handler);
  const heartbeat = typeof window !== 'undefined'
    ? window.setInterval(() => {
      try { s.emit('editor:presence:heartbeat'); } catch {}
    }, PRESENCE_HEARTBEAT_INTERVAL_MS)
    : null;
  return () => {
    try { s.emit('editor:leave', { waveId, blipId }); } catch {}
    s.off('editor:presence', handler);
    if (heartbeat && typeof window !== 'undefined') window.clearInterval(heartbeat);
  };
}

export type BlipSocketEvent =
  | { action: 'created' | 'updated' | 'deleted'; waveId: string; blipId: string; updatedAt?: number; userId?: string }
  | { action: 'read'; waveId: string; blipId: string; readAt?: number; userId?: string };

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
