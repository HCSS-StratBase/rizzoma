/**
 * Offline Queue - Manages mutations that occurred while offline
 *
 * Features:
 * - Queues mutations when offline
 * - Auto-syncs when back online
 * - Max 3 retries per mutation
 * - localStorage persistence
 * - Event-based status updates
 */

export interface QueuedMutation {
  /** Unique ID for this mutation */
  id: string;
  /** Timestamp when mutation was queued */
  timestamp: number;
  /** HTTP method */
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** API endpoint URL */
  url: string;
  /** Request body (JSON serializable) */
  body?: unknown;
  /** Number of retry attempts made */
  retries: number;
  /** Last error message if any */
  lastError?: string;
  /** Custom metadata for the mutation */
  meta?: Record<string, unknown>;
}

export interface OfflineQueueOptions {
  /** Maximum number of retries per mutation (default: 3) */
  maxRetries?: number;
  /** Storage key for localStorage (default: 'rizzoma:offline:queue') */
  storageKey?: string;
  /** Whether to auto-sync when coming online (default: true) */
  autoSync?: boolean;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Custom fetch function for requests */
  fetchFn?: typeof fetch;
}

export type QueueEventType =
  | 'mutation-added'
  | 'mutation-success'
  | 'mutation-failed'
  | 'mutation-retry'
  | 'sync-started'
  | 'sync-completed'
  | 'queue-cleared';

export interface QueueEvent {
  type: QueueEventType;
  mutation?: QueuedMutation;
  error?: Error;
  queueLength: number;
}

type QueueEventHandler = (event: QueueEvent) => void;

/**
 * Singleton offline queue manager
 */
class OfflineQueueManager {
  private queue: QueuedMutation[] = [];
  private options: Required<OfflineQueueOptions>;
  private listeners: Set<QueueEventHandler> = new Set();
  private isSyncing: boolean = false;
  private isInitialized: boolean = false;

  constructor(options: OfflineQueueOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      storageKey: options.storageKey ?? 'rizzoma:offline:queue',
      autoSync: options.autoSync ?? true,
      retryDelay: options.retryDelay ?? 1000,
      fetchFn: options.fetchFn ?? fetch.bind(window),
    };
  }

  /**
   * Initialize the queue - load from storage and set up listeners
   */
  initialize(): void {
    if (this.isInitialized) return;

    this.loadFromStorage();

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    this.isInitialized = true;

    // Auto-sync if we're online and have queued mutations
    if (navigator.onLine && this.queue.length > 0 && this.options.autoSync) {
      this.sync();
    }
  }

  /**
   * Clean up listeners
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.listeners.clear();
    this.isInitialized = false;
  }

  /**
   * Add a mutation to the queue
   */
  enqueue(mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retries'>): string {
    const id = generateId();
    const queuedMutation: QueuedMutation = {
      ...mutation,
      id,
      timestamp: Date.now(),
      retries: 0,
    };

    this.queue.push(queuedMutation);
    this.saveToStorage();

    this.emit({
      type: 'mutation-added',
      mutation: queuedMutation,
      queueLength: this.queue.length,
    });

    console.log('[OfflineQueue] Mutation queued:', id, mutation.url);

    return id;
  }

  /**
   * Remove a mutation from the queue
   */
  dequeue(id: string): QueuedMutation | undefined {
    const index = this.queue.findIndex((m) => m.id === id);
    if (index === -1) return undefined;

    const [mutation] = this.queue.splice(index, 1);
    this.saveToStorage();

    return mutation;
  }

  /**
   * Get all queued mutations
   */
  getQueue(): QueuedMutation[] {
    return [...this.queue];
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Check if currently syncing
   */
  get syncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Clear all queued mutations
   */
  clear(): void {
    this.queue = [];
    this.saveToStorage();

    this.emit({
      type: 'queue-cleared',
      queueLength: 0,
    });

    console.log('[OfflineQueue] Queue cleared');
  }

  /**
   * Sync all queued mutations
   */
  async sync(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) {
      console.log('[OfflineQueue] Sync already in progress');
      return { success: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      console.log('[OfflineQueue] Cannot sync while offline');
      return { success: 0, failed: 0 };
    }

    if (this.queue.length === 0) {
      console.log('[OfflineQueue] Nothing to sync');
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    let success = 0;
    let failed = 0;

    this.emit({
      type: 'sync-started',
      queueLength: this.queue.length,
    });

    console.log('[OfflineQueue] Starting sync, mutations:', this.queue.length);

    // Process queue in order
    const toProcess = [...this.queue];

    for (const mutation of toProcess) {
      try {
        const result = await this.processMutation(mutation);
        if (result) {
          success++;
          this.dequeue(mutation.id);

          this.emit({
            type: 'mutation-success',
            mutation,
            queueLength: this.queue.length,
          });
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        console.error('[OfflineQueue] Mutation failed:', mutation.id, error);
      }

      // Small delay between mutations to avoid overwhelming the server
      await sleep(100);
    }

    this.isSyncing = false;

    this.emit({
      type: 'sync-completed',
      queueLength: this.queue.length,
    });

    console.log('[OfflineQueue] Sync complete. Success:', success, 'Failed:', failed);

    return { success, failed };
  }

  /**
   * Process a single mutation
   */
  private async processMutation(mutation: QueuedMutation): Promise<boolean> {
    try {
      const response = await this.options.fetchFn(mutation.url, {
        method: mutation.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
        credentials: 'include',
      });

      if (response.ok) {
        return true;
      }

      // Handle specific error codes
      if (response.status === 409) {
        // Conflict - data was already modified, consider it synced
        console.log('[OfflineQueue] Conflict for mutation:', mutation.id, '- treating as success');
        return true;
      }

      if (response.status >= 500) {
        // Server error - retry
        return this.retryMutation(mutation, new Error(`Server error: ${response.status}`));
      }

      // Client error - don't retry
      console.error('[OfflineQueue] Client error:', response.status, 'for mutation:', mutation.id);
      this.dequeue(mutation.id);
      this.emit({
        type: 'mutation-failed',
        mutation,
        error: new Error(`Client error: ${response.status}`),
        queueLength: this.queue.length,
      });
      return false;
    } catch (error) {
      // Network error - retry
      return this.retryMutation(
        mutation,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Handle retry logic for a failed mutation
   */
  private async retryMutation(mutation: QueuedMutation, error: Error): Promise<boolean> {
    mutation.retries++;
    mutation.lastError = error.message;

    if (mutation.retries >= this.options.maxRetries) {
      console.error(
        '[OfflineQueue] Max retries reached for mutation:',
        mutation.id,
        error.message
      );
      this.dequeue(mutation.id);
      this.emit({
        type: 'mutation-failed',
        mutation,
        error,
        queueLength: this.queue.length,
      });
      return false;
    }

    this.emit({
      type: 'mutation-retry',
      mutation,
      error,
      queueLength: this.queue.length,
    });

    console.log(
      '[OfflineQueue] Retrying mutation:',
      mutation.id,
      'attempt',
      mutation.retries + 1
    );

    // Wait before retry
    await sleep(this.options.retryDelay * mutation.retries);

    // Try again
    return this.processMutation(mutation);
  }

  /**
   * Subscribe to queue events
   */
  subscribe(handler: QueueEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: QueueEvent): void {
    this.listeners.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error('[OfflineQueue] Event handler error:', error);
      }
    });
  }

  /**
   * Handle coming online
   */
  private handleOnline = (): void => {
    console.log('[OfflineQueue] Back online');
    if (this.options.autoSync && this.queue.length > 0) {
      this.sync();
    }
  };

  /**
   * Handle going offline
   */
  private handleOffline = (): void => {
    console.log('[OfflineQueue] Gone offline');
  };

  /**
   * Save queue to localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[OfflineQueue] Failed to save to storage:', error);
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.options.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log('[OfflineQueue] Loaded', this.queue.length, 'mutations from storage');
      }
    } catch (error) {
      console.error('[OfflineQueue] Failed to load from storage:', error);
      this.queue = [];
    }
  }
}

// Utility functions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Export singleton instance
export const offlineQueue = new OfflineQueueManager();

// Export class for custom instances
export { OfflineQueueManager };

/**
 * Helper function to make an API call that falls back to queue when offline
 */
export async function fetchWithOfflineSupport(
  url: string,
  options: RequestInit & { offlineMeta?: Record<string, unknown> } = {}
): Promise<Response> {
  const method = (options.method?.toUpperCase() || 'GET') as QueuedMutation['method'];

  // GET requests don't need to be queued
  if (method === 'GET' || navigator.onLine) {
    return fetch(url, options);
  }

  // Queue mutation for later
  let body: unknown = undefined;
  if (options.body) {
    try {
      body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    } catch {
      body = options.body;
    }
  }

  offlineQueue.enqueue({
    method: method as QueuedMutation['method'],
    url,
    body,
    meta: options.offlineMeta,
  });

  // Return a fake successful response
  return new Response(JSON.stringify({ queued: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}
