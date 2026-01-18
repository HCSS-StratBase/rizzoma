import { useState, useEffect, useCallback } from 'react';
import { offlineQueue, type QueueEvent, type QueuedMutation } from '../lib/offlineQueue';

export interface OfflineStatus {
  /** Whether the browser reports being online */
  isOnline: boolean;
  /** Whether there are pending mutations in the queue */
  hasPendingMutations: boolean;
  /** Number of pending mutations */
  pendingCount: number;
  /** Whether the queue is currently syncing */
  isSyncing: boolean;
  /** Last sync result */
  lastSyncResult: { success: number; failed: number } | null;
  /** The pending mutations */
  pendingMutations: QueuedMutation[];
}

export interface UseOfflineStatusOptions {
  /** Callback when going online */
  onOnline?: () => void;
  /** Callback when going offline */
  onOffline?: () => void;
  /** Callback when a mutation succeeds */
  onMutationSuccess?: (mutation: QueuedMutation) => void;
  /** Callback when a mutation fails */
  onMutationFailed?: (mutation: QueuedMutation, error: Error) => void;
  /** Callback when sync completes */
  onSyncComplete?: (result: { success: number; failed: number }) => void;
}

/**
 * Hook for monitoring offline status and pending mutations
 */
export function useOfflineStatus(options: UseOfflineStatusOptions = {}): OfflineStatus & {
  /** Manually trigger a sync */
  sync: () => Promise<{ success: number; failed: number }>;
  /** Clear all pending mutations */
  clearQueue: () => void;
  /** Remove a specific mutation from the queue */
  removeMutation: (id: string) => void;
} {
  const { onOnline, onOffline, onMutationSuccess, onMutationFailed, onSyncComplete } = options;

  const [status, setStatus] = useState<OfflineStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    hasPendingMutations: false,
    pendingCount: 0,
    isSyncing: false,
    lastSyncResult: null,
    pendingMutations: [],
  });

  // Initialize offline queue
  useEffect(() => {
    offlineQueue.initialize();

    // Update initial state
    const queue = offlineQueue.getQueue();
    setStatus((prev) => ({
      ...prev,
      hasPendingMutations: queue.length > 0,
      pendingCount: queue.length,
      pendingMutations: queue,
    }));

    return () => {
      // Don't destroy - queue should persist across component unmounts
    };
  }, []);

  // Subscribe to queue events
  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe((event: QueueEvent) => {
      const queue = offlineQueue.getQueue();

      switch (event.type) {
        case 'mutation-added':
        case 'mutation-retry':
          setStatus((prev) => ({
            ...prev,
            hasPendingMutations: queue.length > 0,
            pendingCount: queue.length,
            pendingMutations: queue,
          }));
          break;

        case 'mutation-success':
          if (event.mutation) {
            onMutationSuccess?.(event.mutation);
          }
          setStatus((prev) => ({
            ...prev,
            hasPendingMutations: queue.length > 0,
            pendingCount: queue.length,
            pendingMutations: queue,
          }));
          break;

        case 'mutation-failed':
          if (event.mutation && event.error) {
            onMutationFailed?.(event.mutation, event.error);
          }
          setStatus((prev) => ({
            ...prev,
            hasPendingMutations: queue.length > 0,
            pendingCount: queue.length,
            pendingMutations: queue,
          }));
          break;

        case 'sync-started':
          setStatus((prev) => ({
            ...prev,
            isSyncing: true,
          }));
          break;

        case 'sync-completed':
          setStatus((prev) => ({
            ...prev,
            isSyncing: false,
            hasPendingMutations: queue.length > 0,
            pendingCount: queue.length,
            pendingMutations: queue,
          }));
          break;

        case 'queue-cleared':
          setStatus((prev) => ({
            ...prev,
            hasPendingMutations: false,
            pendingCount: 0,
            pendingMutations: [],
          }));
          break;
      }
    });

    return unsubscribe;
  }, [onMutationSuccess, onMutationFailed]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true }));
      onOnline?.();
    };

    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isOnline: false }));
      onOffline?.();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onOnline, onOffline]);

  // Manual sync function
  const sync = useCallback(async () => {
    const result = await offlineQueue.sync();
    setStatus((prev) => ({
      ...prev,
      lastSyncResult: result,
    }));
    onSyncComplete?.(result);
    return result;
  }, [onSyncComplete]);

  // Clear queue function
  const clearQueue = useCallback(() => {
    offlineQueue.clear();
  }, []);

  // Remove specific mutation
  const removeMutation = useCallback((id: string) => {
    offlineQueue.dequeue(id);
    const queue = offlineQueue.getQueue();
    setStatus((prev) => ({
      ...prev,
      hasPendingMutations: queue.length > 0,
      pendingCount: queue.length,
      pendingMutations: queue,
    }));
  }, []);

  return {
    ...status,
    sync,
    clearQueue,
    removeMutation,
  };
}

/**
 * Simple hook that just returns online status
 */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook that shows a toast when going offline/online
 */
export function useOfflineToast(): void {
  useEffect(() => {
    const handleOnline = () => {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'Back online', type: 'success' },
        })
      );
    };

    const handleOffline = () => {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { message: 'You are offline. Changes will sync when reconnected.', type: 'warning' },
        })
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
}

/**
 * Component that shows offline indicator
 */
export function useOfflineIndicator(): {
  isOffline: boolean;
  hasPending: boolean;
  pendingCount: number;
} {
  const { isOnline, hasPendingMutations, pendingCount } = useOfflineStatus();

  return {
    isOffline: !isOnline,
    hasPending: hasPendingMutations,
    pendingCount,
  };
}
