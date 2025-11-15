import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { useSocket } from '../../hooks/useSocket';
import { SocketIOProvider } from './CollaborativeProvider';

export function useCollaboration(doc: Y.Doc, blipId: string, enabled: boolean): SocketIOProvider | null {
  const socket = useSocket();
  const providerRef = useRef<SocketIOProvider | null>(null);
  
  useEffect(() => {
    if (enabled && socket) {
      providerRef.current = new SocketIOProvider(doc, socket, blipId);
      
      return () => {
        providerRef.current?.destroy();
        providerRef.current = null;
      };
    }
    return undefined;
  }, [doc, blipId, enabled, socket]);
  
  return providerRef.current;
}