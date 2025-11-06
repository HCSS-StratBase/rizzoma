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
