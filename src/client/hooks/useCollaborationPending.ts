import { useEffect, useState } from 'react';
import {
  COLLABORATION_PENDING_EVENT,
  getPendingCollaborationCount,
  hasPendingCollaborationChanges,
} from '../lib/collaborationPending';

/** Live count used by the offline shell warning. */
export function useCollaborationPendingCount(): number {
  const [count, setCount] = useState(getPendingCollaborationCount);

  useEffect(() => {
    const update = () => setCount(getPendingCollaborationCount());
    window.addEventListener(COLLABORATION_PENDING_EVENT, update);
    update();
    return () => window.removeEventListener(COLLABORATION_PENDING_EVENT, update);
  }, []);

  return count;
}

/**
 * Browser-native guard for the only offline edits we retain: unacknowledged
 * Yjs state in this tab's memory. Modern browsers choose the dialog text.
 */
export function useCollaborationUnloadGuard(): void {
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!hasPendingCollaborationChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
}
