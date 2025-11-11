import { io, Socket } from 'socket.io-client';

let socket: Socket | undefined;

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
      try { const body = await meResp.json(); userId = body?.id ? String(body.id) : undefined; } catch {}
      s.emit('editor:join', { waveId, blipId, userId });
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
  return () => {
    try { s.emit('editor:leave', { waveId, blipId }); } catch {}
    s.off('editor:presence', handler);
  };
}
