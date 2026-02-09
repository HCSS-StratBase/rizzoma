import { useState, useEffect } from 'react';
import { getSocket } from '../lib/socket';
import type { Socket } from 'socket.io-client';

export function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(() => {
    try { return getSocket(); } catch { return null; }
  });
  useEffect(() => {
    if (!socket) {
      try { setSocket(getSocket()); } catch {}
    }
  }, []);
  return socket;
}
