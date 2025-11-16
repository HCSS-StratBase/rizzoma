import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let globalSocket: Socket | null = null;

export function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(globalSocket);
  
  useEffect(() => {
    if (!globalSocket) {
      globalSocket = io();
    }
    setSocket(globalSocket);
    
    return () => {
      // Don't disconnect on unmount as other components might be using it
    };
  }, []);
  
  return socket;
}