import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { useSocket } from '../../hooks/useSocket';
import { SocketIOProvider } from './CollaborativeProvider';

/**
 * Hook to create a SocketIOProvider for real-time collaboration.
 *
 * The provider is created SYNCHRONOUSLY during render (using refs) so it's
 * available on the first render. This is critical because TipTap's useEditor
 * creates the editor during the initial render — if the provider isn't ready,
 * the Collaboration extension won't be included and the editor must be
 * recreated (which TipTap's useEditor doesn't handle well via setOptions).
 */
export function useCollaboration(doc: Y.Doc | undefined, blipId: string, enabled: boolean): SocketIOProvider | null {
  const socket = useSocket();
  const providerRef = useRef<SocketIOProvider | null>(null);
  // Track deps to detect changes and recreate the provider
  const depsKeyRef = useRef('');

  const currentDepsKey = `${enabled}|${blipId}|${!!doc}|${!!socket}`;

  if (currentDepsKey !== depsKeyRef.current) {
    // Deps changed — destroy old provider, potentially create new one
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    depsKeyRef.current = currentDepsKey;
    if (enabled && socket && doc) {
      providerRef.current = new SocketIOProvider(doc, socket, blipId);
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      // Reset deps key so a remount (e.g. React Strict Mode) creates a fresh provider
      depsKeyRef.current = '';
    };
  }, []);

  return providerRef.current;
}
