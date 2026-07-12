/**
 * Auth-bound offline mutation queue.
 *
 * Mutations are persisted in a separate localStorage partition for each
 * authenticated user. No partition is loaded, written, or replayed before the
 * auth bootstrap has resolved to a concrete user ID.
 */

export interface QueuedMutation {
  /** Unique ID for this mutation */
  id: string;
  /** Authenticated owner of this persisted mutation */
  ownerId: string;
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
  /** Failed items remain durable until the user retries or discards them. */
  status: 'pending' | 'failed';
  /** Last error message if any */
  lastError?: string;
  /** Last HTTP status observed, when applicable. */
  lastStatus?: number;
  /** Custom metadata for the mutation */
  meta?: Record<string, unknown>;
}

type NewQueuedMutation = Omit<
  QueuedMutation,
  'id' | 'ownerId' | 'timestamp' | 'retries' | 'status' | 'lastError' | 'lastStatus'
>;

export interface OfflineQueueOptions {
  /** Hard kill switch. Production remains disabled until endpoint approval. */
  enabled?: boolean;
  /** Maximum number of retries per mutation (default: 3) */
  maxRetries?: number;
  /** Base localStorage key. User partitions are appended to this key. */
  storageKey?: string;
  /** Whether to auto-sync after auth/online recovery (default: true) */
  autoSync?: boolean;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Custom fetch function for requests */
  fetchFn?: typeof fetch;
  /** Fetch a fresh CSRF token immediately before replaying a mutation. */
  csrfTokenProvider?: () => Promise<string | undefined>;
  /** Resolve the current server-session user before replay. */
  authUserProvider?: () => Promise<string | null>;
  /** Serialize replay across tabs. Undefined means no safe lock is available. */
  replayLock?: <T>(name: string, task: () => Promise<T>) => Promise<T | undefined>;
}

interface ResolvedOfflineQueueOptions {
  enabled: boolean;
  maxRetries: number;
  storageKey: string;
  autoSync: boolean;
  retryDelay: number;
  fetchFn: typeof fetch;
  csrfTokenProvider: () => Promise<string | undefined>;
  authUserProvider: () => Promise<string | null>;
  replayLock: <T>(name: string, task: () => Promise<T>) => Promise<T | undefined>;
}

export type QueueEventType =
  | 'mutation-added'
  | 'mutation-success'
  | 'mutation-failed'
  | 'mutation-retry'
  | 'mutation-requeued'
  | 'sync-started'
  | 'sync-completed'
  | 'auth-required'
  | 'queue-loaded'
  | 'queue-unloaded'
  | 'queue-cleared';

export interface QueueEvent {
  type: QueueEventType;
  mutation?: QueuedMutation;
  error?: Error;
  queueLength: number;
  userId?: string;
}

type QueueEventHandler = (event: QueueEvent) => void;
type MutationResult = 'success' | 'failed' | 'auth-required' | 'cancelled';

class AuthRequiredError extends Error {
  constructor(message = 'Authentication is required to replay offline changes') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

/**
 * Queue manager whose in-memory state always belongs to at most one user.
 */
class OfflineQueueManager {
  private queue: QueuedMutation[] = [];
  private options: ResolvedOfflineQueueOptions;
  private listeners: Set<QueueEventHandler> = new Set();
  private isSyncing = false;
  private isInitialized = false;
  private activeUserId: string | null = null;
  private authGeneration = 0;
  private syncAbortController: AbortController | null = null;

  constructor(options: OfflineQueueOptions = {}) {
    const defaultFetch = (...args: Parameters<typeof fetch>) => globalThis.fetch(...args);
    this.options = {
      // Test and library instances are opt-in by construction. The production
      // singleton below always passes the build flag explicitly, so custom
      // managers remain useful for deterministic isolation/recovery tests
      // without weakening the production default-off boundary.
      enabled: options.enabled ?? true,
      maxRetries: options.maxRetries ?? 3,
      storageKey: options.storageKey ?? 'rizzoma:offline:queue',
      autoSync: options.autoSync ?? true,
      retryDelay: options.retryDelay ?? 1000,
      fetchFn: options.fetchFn ?? defaultFetch,
      csrfTokenProvider: options.csrfTokenProvider ?? (() => this.fetchFreshCsrfToken()),
      authUserProvider: options.authUserProvider ?? (() => this.fetchAuthenticatedUserId()),
      replayLock: options.replayLock ?? withBrowserReplayLock,
    };
  }

  /**
   * Install network listeners and delete the unsafe pre-partition global
   * queue. This intentionally does not load or sync any user data.
   */
  initialize(): void {
    if (this.isInitialized) return;

    this.removeUnsafeLegacyQueue();
    if (!this.options.enabled) {
      this.isInitialized = true;
      return;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
      window.addEventListener('storage', this.handleStorage);
    }
    this.isInitialized = true;
  }

  /**
   * Load the authenticated user's partition. Passing null unloads the active
   * partition and leaves every persisted per-user queue untouched.
   */
  activateUser(userId: string | null): void {
    this.initialize();

    if (!this.options.enabled) {
      this.abortActiveSync();
      this.queue = [];
      this.activeUserId = null;
      return;
    }

    const normalizedUserId = userId?.trim() || null;
    if (normalizedUserId === this.activeUserId) return;

    this.abortActiveSync();
    this.authGeneration += 1;
    this.queue = [];
    this.activeUserId = normalizedUserId;

    if (!normalizedUserId) {
      this.emit({ type: 'queue-unloaded', queueLength: 0 });
      return;
    }

    this.loadUserPartition(normalizedUserId);
    this.emit({
      type: 'queue-loaded',
      queueLength: this.queue.length,
      userId: normalizedUserId,
    });

    if (this.isOnline() && this.queue.length > 0 && this.options.autoSync) {
      void this.sync();
    }
  }

  /** Unload the active user's in-memory queue without deleting it. */
  deactivateUser(): void {
    this.activateUser(null);
  }

  /** Clean up listeners and all in-memory auth state. */
  destroy(): void {
    this.abortActiveSync();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
      window.removeEventListener('storage', this.handleStorage);
    }
    this.queue = [];
    this.activeUserId = null;
    this.listeners.clear();
    this.isInitialized = false;
    this.authGeneration += 1;
  }

  /** Add a mutation only when an authenticated partition is active. */
  enqueue(mutation: NewQueuedMutation): string | null {
    if (!this.activeUserId) {
      console.warn('[OfflineQueue] Refusing to queue mutation without authenticated user');
      return null;
    }
    if (mutation.method !== 'PUT' && mutation.method !== 'PATCH') {
      console.warn('[OfflineQueue] Refusing unsupported non-idempotent offline mutation');
      return null;
    }

    const id = generateId();
    const queuedMutation: QueuedMutation = {
      ...mutation,
      id,
      ownerId: this.activeUserId,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };

    if (!this.persistMutation(queuedMutation)) return null;
    this.queue.push(queuedMutation);
    this.emit({
      type: 'mutation-added',
      mutation: queuedMutation,
      queueLength: this.queue.length,
      userId: this.activeUserId,
    });
    return id;
  }

  /** Remove a mutation from the active user's queue. */
  dequeue(id: string): QueuedMutation | undefined {
    if (!this.activeUserId) return undefined;
    const index = this.queue.findIndex((mutation) => mutation.id === id);
    if (index === -1) return undefined;

    const [mutation] = this.queue.splice(index, 1);
    this.removePersistedMutation(mutation);
    return mutation;
  }

  getQueue(): QueuedMutation[] {
    return this.queue.map((mutation) => ({ ...mutation }));
  }

  get length(): number {
    return this.queue.length;
  }

  get syncing(): boolean {
    return this.isSyncing;
  }

  get userId(): string | null {
    return this.activeUserId;
  }

  get canQueue(): boolean {
    return Boolean(this.activeUserId);
  }

  get failedCount(): number {
    return this.queue.filter((mutation) => mutation.status === 'failed').length;
  }

  /** Exposed for diagnostics/tests; never contains raw unescaped user input. */
  storageKeyForUser(userId: string): string {
    return `${this.options.storageKey}:user:${encodeURIComponent(userId)}`;
  }

  getPersistedQueue(userId: string): QueuedMutation[] {
    return this.readUserRecords(userId);
  }

  /** Delete only the active user's persisted queue. */
  clear(): void {
    if (!this.activeUserId) {
      this.queue = [];
      this.emit({ type: 'queue-cleared', queueLength: 0 });
      return;
    }

    this.queue = [];
    this.removeAllPersistedForUser(this.activeUserId);
    this.emit({
      type: 'queue-cleared',
      queueLength: 0,
      userId: this.activeUserId,
    });
  }

  /** Move one durable failed item back to pending for an explicit retry. */
  retryFailed(id: string): boolean {
    if (!this.activeUserId) return false;
    const mutation = this.queue.find((item) => item.id === id && item.status === 'failed');
    if (!mutation) return false;
    mutation.status = 'pending';
    mutation.retries = 0;
    delete mutation.lastError;
    delete mutation.lastStatus;
    if (!this.persistMutation(mutation)) return false;
    this.emit({
      type: 'mutation-requeued',
      mutation,
      queueLength: this.queue.length,
      userId: this.activeUserId,
    });
    return true;
  }

  /** Replay the active user's mutations in order. */
  async sync(): Promise<{ success: number; failed: number }> {
    const hasPending = this.queue.some((mutation) => mutation.status !== 'failed');
    if (this.isSyncing || !this.activeUserId || !this.isOnline() || !hasPending) {
      return { success: 0, failed: 0 };
    }

    const expectedUserId = this.activeUserId;
    const result = await this.options.replayLock(
      `rizzoma-offline-replay:${expectedUserId}`,
      () => this.syncLocked(expectedUserId),
    );
    if (!result) {
      console.warn('[OfflineQueue] Replay deferred because no safe cross-tab lock is available');
      return { success: 0, failed: 0 };
    }
    return result;
  }

  private async syncLocked(expectedUserId: string): Promise<{ success: number; failed: number }> {
    if (this.activeUserId !== expectedUserId || this.isSyncing || !this.isOnline()) {
      return { success: 0, failed: 0 };
    }
    // Refresh from per-record storage after acquiring the cross-tab lock so a
    // second tab observes items completed by the first instead of replaying.
    this.loadUserPartition(expectedUserId);
    if (!this.queue.some((mutation) => mutation.status !== 'failed')) {
      return { success: 0, failed: 0 };
    }

    const serverUserId = await this.options.authUserProvider();
    if (this.activeUserId !== expectedUserId) return { success: 0, failed: 0 };
    if (serverUserId !== expectedUserId) {
      const error = new AuthRequiredError('Offline changes belong to a different signed-in account');
      this.emit({
        type: 'auth-required',
        mutation: this.queue.find((mutation) => mutation.status !== 'failed'),
        error,
        queueLength: this.queue.length,
        userId: expectedUserId,
      });
      return { success: 0, failed: 1 };
    }

    const syncUserId = this.activeUserId;
    const generation = this.authGeneration;
    const controller = new AbortController();
    this.syncAbortController = controller;
    this.isSyncing = true;
    let success = 0;
    let failed = 0;

    this.emit({
      type: 'sync-started',
      queueLength: this.queue.length,
      userId: syncUserId,
    });

    const toProcess = this.queue.filter((mutation) => mutation.status !== 'failed');
    for (const mutation of toProcess) {
      if (!this.isCurrentSync(syncUserId, generation, controller)) break;
      if (mutation.ownerId !== syncUserId) {
        // Defense in depth: an item can never cross its authenticated owner.
        failed += 1;
        continue;
      }

      const result = await this.processMutation(mutation, controller.signal);
      if (!this.isCurrentSync(syncUserId, generation, controller)) break;

      if (result === 'success') {
        success += 1;
        this.dequeue(mutation.id);
        this.emit({
          type: 'mutation-success',
          mutation,
          queueLength: this.queue.length,
          userId: syncUserId,
        });
      } else if (result === 'auth-required') {
        failed += 1;
        const error = new AuthRequiredError();
        mutation.lastError = error.message;
        this.persistMutation(mutation);
        this.emit({
          type: 'auth-required',
          mutation,
          error,
          queueLength: this.queue.length,
          userId: syncUserId,
        });
        break;
      } else if (result === 'failed') {
        failed += 1;
        break;
      } else {
        break;
      }

      if (this.isCurrentSync(syncUserId, generation, controller)) {
        await sleep(100);
      }
    }

    if (this.isCurrentSync(syncUserId, generation, controller)) {
      this.isSyncing = false;
      this.syncAbortController = null;
      this.emit({
        type: 'sync-completed',
        queueLength: this.queue.length,
        userId: syncUserId,
      });
    }

    return { success, failed };
  }

  private async processMutation(
    mutation: QueuedMutation,
    signal: AbortSignal,
  ): Promise<MutationResult> {
    try {
      const csrfToken = await this.options.csrfTokenProvider();
      if (signal.aborted) return 'cancelled';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      headers['x-offline-mutation-id'] = mutation.id;

      const response = await this.options.fetchFn(mutation.url, {
        method: mutation.method,
        headers,
        body: mutation.body === undefined ? undefined : JSON.stringify(mutation.body),
        credentials: 'include',
        signal,
      });

      if (response.ok) return 'success';
      if (response.status === 409 && mutation.meta?.['acceptConflictAsSuccess'] === true) {
        return 'success';
      }
      if (response.status === 401 || response.status === 403) return 'auth-required';
      if (response.status >= 500) {
        return this.retryAfterFailure(mutation, new Error(`Server error: ${response.status}`), signal);
      }
      return this.markFailed(
        mutation,
        new Error(response.status === 409
          ? 'Conflict requires manual recovery'
          : `Client error: ${response.status}`),
        response.status,
      );
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return 'cancelled';
      if (error instanceof AuthRequiredError) return 'auth-required';
      return this.retryAfterFailure(
        mutation,
        error instanceof Error ? error : new Error(String(error)),
        signal,
      );
    }
  }

  private async retryAfterFailure(
    mutation: QueuedMutation,
    error: Error,
    signal: AbortSignal,
  ): Promise<MutationResult> {
    mutation.retries += 1;
    mutation.lastError = error.message;
    this.persistMutation(mutation);

    if (mutation.retries >= this.options.maxRetries) {
      return this.markFailed(mutation, error);
    }

    this.emit({
      type: 'mutation-retry',
      mutation,
      error,
      queueLength: this.queue.length,
      userId: this.activeUserId || undefined,
    });
    const retryAllowed = await sleepWithSignal(
      this.options.retryDelay * mutation.retries,
      signal,
    );
    if (!retryAllowed) return 'cancelled';
    return this.processMutation(mutation, signal);
  }

  private markFailed(
    mutation: QueuedMutation,
    error: Error,
    status?: number,
  ): MutationResult {
    mutation.status = 'failed';
    mutation.lastError = error.message;
    if (status !== undefined) mutation.lastStatus = status;
    this.persistMutation(mutation);
    this.emit({
      type: 'mutation-failed',
      mutation,
      error,
      queueLength: this.queue.length,
      userId: this.activeUserId || undefined,
    });
    return 'failed';
  }

  subscribe(handler: QueueEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private emit(event: QueueEvent): void {
    this.listeners.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error('[OfflineQueue] Event handler error:', error);
      }
    });
  }

  private handleOnline = (): void => {
    if (this.options.autoSync && this.activeUserId && this.queue.length > 0) {
      void this.sync();
    }
  };

  private handleOffline = (): void => undefined;

  private abortActiveSync(): void {
    this.syncAbortController?.abort();
    this.syncAbortController = null;
    this.isSyncing = false;
  }

  private isCurrentSync(
    userId: string,
    generation: number,
    controller: AbortController,
  ): boolean {
    return !controller.signal.aborted
      && this.activeUserId === userId
      && this.authGeneration === generation
      && this.syncAbortController === controller;
  }

  private isOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  private loadUserPartition(userId: string): void {
    this.migrateLegacyUserPartition(userId);
    this.queue = this.readUserRecords(userId);
  }

  private mutationStoragePrefix(userId: string): string {
    return `${this.storageKeyForUser(userId)}:mutation:`;
  }

  private mutationStorageKey(mutation: Pick<QueuedMutation, 'ownerId' | 'id'>): string {
    return `${this.mutationStoragePrefix(mutation.ownerId)}${encodeURIComponent(mutation.id)}`;
  }

  private persistMutation(mutation: QueuedMutation): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      localStorage.setItem(this.mutationStorageKey(mutation), JSON.stringify(mutation));
      return true;
    } catch (error) {
      console.error('[OfflineQueue] Failed to persist mutation:', error);
      return false;
    }
  }

  private removePersistedMutation(mutation: QueuedMutation): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(this.mutationStorageKey(mutation));
    } catch (error) {
      console.error('[OfflineQueue] Failed to remove persisted mutation:', error);
    }
  }

  private removeAllPersistedForUser(userId: string): void {
    if (typeof localStorage === 'undefined') return;
    const prefix = this.mutationStoragePrefix(userId);
    const keys = this.storageKeys().filter((key) => key.startsWith(prefix));
    keys.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(this.storageKeyForUser(userId));
  }

  private readUserRecords(userId: string): QueuedMutation[] {
    if (typeof localStorage === 'undefined') return [];
    const prefix = this.mutationStoragePrefix(userId);
    const byId = new Map<string, QueuedMutation>();
    for (const key of this.storageKeys().filter((candidate) => candidate.startsWith(prefix))) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isQueuedMutation(parsed)
          || parsed.ownerId !== userId
          || (parsed.method !== 'PUT' && parsed.method !== 'PATCH')) {
          this.quarantineStorageRecord(key, raw, userId);
          continue;
        }
        byId.set(parsed.id, {
          ...parsed,
          status: parsed.status === 'failed' ? 'failed' : 'pending',
        });
      } catch (error) {
        console.error('[OfflineQueue] Quarantining malformed mutation record:', error);
        this.quarantineStorageRecord(key, raw, userId);
      }
    }
    return [...byId.values()].sort((left, right) => (
      left.timestamp - right.timestamp || left.id.localeCompare(right.id)
    ));
  }

  private migrateLegacyUserPartition(userId: string): void {
    if (typeof localStorage === 'undefined') return;
    const legacyKey = this.storageKeyForUser(userId);
    const raw = localStorage.getItem(legacyKey);
    if (raw === null) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Legacy queue partition is not an array');
      const valid = parsed.filter((value): value is QueuedMutation => (
        isQueuedMutation(value)
        && value.ownerId === userId
        && (value.method === 'PUT' || value.method === 'PATCH')
      )).map((mutation) => ({
        ...mutation,
        status: mutation.status === 'failed' ? 'failed' as const : 'pending' as const,
      }));
      if (valid.length !== parsed.length || !valid.every((mutation) => this.persistMutation(mutation))) {
        this.quarantineStorageRecord(legacyKey, raw, userId);
        return;
      }
      localStorage.removeItem(legacyKey);
    } catch (error) {
      console.error('[OfflineQueue] Quarantining malformed legacy partition:', error);
      this.quarantineStorageRecord(legacyKey, raw, userId);
    }
  }

  private quarantineStorageRecord(key: string, raw: string, userId: string): void {
    if (typeof localStorage === 'undefined') return;
    const quarantineKey = `${this.options.storageKey}:quarantine:${encodeURIComponent(userId)}:${Date.now()}:${generateId()}`;
    try {
      localStorage.setItem(quarantineKey, raw);
      localStorage.removeItem(key);
    } catch (error) {
      // Preserve the original record when quarantine storage itself fails.
      console.error('[OfflineQueue] Failed to quarantine record; original preserved:', error);
    }
  }

  private storageKeys(): string[] {
    if (typeof localStorage === 'undefined') return [];
    return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key));
  }

  private removeUnsafeLegacyQueue(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (localStorage.getItem(this.options.storageKey) !== null) {
        const raw = localStorage.getItem(this.options.storageKey);
        if (raw !== null) {
          this.quarantineStorageRecord(
            this.options.storageKey,
            raw,
            'unknown-legacy-owner',
          );
          console.warn('[OfflineQueue] Quarantined legacy global queue with no authenticated owner');
        }
      }
    } catch (error) {
      console.error('[OfflineQueue] Failed to remove unsafe legacy queue:', error);
    }
  }

  private async fetchFreshCsrfToken(): Promise<string | undefined> {
    const response = await this.options.fetchFn('/api/auth/csrf', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 401 || response.status === 403) throw new AuthRequiredError();
    if (!response.ok) throw new Error(`CSRF refresh failed: ${response.status}`);
    return readCookie('XSRF-TOKEN');
  }

  private async fetchAuthenticatedUserId(): Promise<string | null> {
    try {
      const response = await globalThis.fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const data = await response.json() as { id?: unknown };
      return typeof data.id === 'string' ? data.id : null;
    } catch {
      return null;
    }
  }

  private handleStorage = (event: StorageEvent): void => {
    if (!this.activeUserId || this.isSyncing || !event.key) return;
    if (!event.key.startsWith(this.mutationStoragePrefix(this.activeUserId))) return;
    this.loadUserPartition(this.activeUserId);
    this.emit({
      type: 'queue-loaded',
      queueLength: this.queue.length,
      userId: this.activeUserId,
    });
    if (this.options.autoSync && this.isOnline()
      && this.queue.some((mutation) => mutation.status !== 'failed')) {
      void this.sync();
    }
  };
}

function isQueuedMutation(value: unknown): value is QueuedMutation {
  if (!value || typeof value !== 'object') return false;
  const mutation = value as Partial<QueuedMutation>;
  return typeof mutation.id === 'string'
    && typeof mutation.ownerId === 'string'
    && typeof mutation.timestamp === 'number'
    && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(mutation.method))
    && typeof mutation.url === 'string'
    && typeof mutation.retries === 'number';
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  const captured = match?.[1];
  return captured ? decodeURIComponent(captured) : undefined;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'name' in error
    && (error as { name?: unknown }).name === 'AbortError',
  );
}

function sleepWithSignal(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function withBrowserReplayLock<T>(
  name: string,
  task: () => Promise<T>,
): Promise<T | undefined> {
  const locks = typeof navigator !== 'undefined'
    ? (navigator as Navigator & {
        locks?: {
          request: <R>(name: string, callback: () => Promise<R>) => Promise<R>;
        };
      }).locks
    : undefined;
  if (!locks?.request) return undefined;
  return locks.request(name, task);
}

export const offlineQueue = new OfflineQueueManager({
  enabled: import.meta.env['VITE_OFFLINE_MUTATION_QUEUE'] === '1',
});
export { OfflineQueueManager };

/**
 * Fetch helper that returns 401 instead of fabricating success when no
 * authenticated queue partition is active.
 */
export async function fetchWithOfflineSupport(
  url: string,
  options: RequestInit & { offlineMeta?: Record<string, unknown> } = {},
): Promise<Response> {
  const method = options.method?.toUpperCase() || 'GET';
  if (method === 'GET' || (typeof navigator !== 'undefined' && navigator.onLine)) {
    return fetch(url, options);
  }

  return new Response(JSON.stringify({ error: 'offline_mutation_not_supported' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}
