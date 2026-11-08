import { offlineQueue, type QueuedMutation } from './offlineQueue';

export type ApiResponse<T = any> = { ok: boolean; data: T | string | null; status: number; requestId?: string; queued?: boolean };
export type ApiRequestInit = RequestInit & {
  /** Persist this mutation for offline replay. Secret redemptions must set false. */
  queueable?: boolean;
};

const ONLINE_ONLY_MUTATION_PATTERNS = [
  /^\/api\/auth(?:\/|$)/,
  /\/invitations\/accept(?:\/|$)/,
  /\/(?:recovery|recover|password-reset|reset-password)(?:\/|$)/,
];

// Safety-first release boundary: no production endpoint is approved for
// durable offline replay yet. Enabling the build flag is insufficient on its
// own; a route must also be added here after its caller handles queued 202,
// server idempotency, authorization revalidation, and conflict recovery.
const APPROVED_OFFLINE_MUTATION_PATTERNS: readonly RegExp[] = [];

function isOnlineOnlyMutation(path: string): boolean {
  return ONLINE_ONLY_MUTATION_PATTERNS.some((pattern) => pattern.test(path));
}

function requiresFreshCsrf(path: string): boolean {
  return /\/invitations\/accept(?:\/|$)/.test(path)
    || /\/(?:recovery|recover|password-reset|reset-password)(?:\/|$)/.test(path);
}

function isApprovedOfflineMutation(path: string): boolean {
  const enabled = import.meta.env['VITE_OFFLINE_MUTATION_QUEUE'] === '1';
  return enabled && APPROVED_OFFLINE_MUTATION_PATTERNS.some((pattern) => pattern.test(path));
}

export function readCookie(name: string): string | undefined {
  const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  if (!m) return undefined;
  const captured = m[1];
  return captured ? decodeURIComponent(captured) : undefined;
}

export async function ensureCsrf(): Promise<string | undefined> {
  try {
    await api('/api/auth/csrf');
  } catch {}
  return readCookie('XSRF-TOKEN');
}

export async function api<T = any>(path: string, init?: ApiRequestInit): Promise<ApiResponse<T>> {
  const start = Date.now();
  const { queueable: queueableOverride, ...requestInit } = init || {};
  const method = (requestInit.method || 'GET').toUpperCase();
  const base: Record<string, string> = { 'content-type': 'application/json' };
  const given = (requestInit.headers || {}) as Record<string, string>;
  const headers: Record<string, string> = { ...base, ...given };

  // Perf harness bypass: skip sidebar topics fetch to avoid blocking landing render during perf runs
  const perfSkip =
    typeof localStorage !== 'undefined' && localStorage.getItem('rizzoma:perf:skipSidebarTopics') === '1';
  const perfHash = (() => {
    try {
      if (typeof window === 'undefined') return false;
      const hash = window.location.hash || '';
      const query = hash.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const perfValue = params.get('perf');
      if (perfValue === null) return false;
      return perfValue !== '0' && perfValue !== 'false';
    } catch {
      return false;
    }
  })();
  const normalizedPath = (() => {
    try {
      const url = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      return url.pathname;
    } catch {
      return path;
    }
  })();
  const isTopicsList = normalizedPath === '/api/topics';
  if ((perfSkip || perfHash) && method === 'GET' && isTopicsList) {
    return { ok: true, data: { topics: [], hasMore: false } as T, status: 200 };
  }

  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const onlineOnlyMutation = isOnlineOnlyMutation(normalizedPath);
  const supportedOfflineMethod = method === 'PUT' || method === 'PATCH';
  const queueable = !onlineOnlyMutation
    && supportedOfflineMethod
    && isApprovedOfflineMutation(normalizedPath)
    && queueableOverride !== false;
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (isMutation && isOffline && !queueable) {
    return {
      ok: false,
      data: {
        error: onlineOnlyMutation || queueableOverride === false
          ? 'online_required'
          : 'offline_mutation_not_supported',
      } as T,
      status: 503,
    };
  }

  if (isMutation && isOffline) {
    let body: unknown;
    if (requestInit.body) {
      try {
        body = typeof requestInit.body === 'string' ? JSON.parse(requestInit.body) : requestInit.body;
      } catch {
        body = requestInit.body;
      }
    }
    const queuedId = offlineQueue.enqueue({
      method: method as QueuedMutation['method'],
      url: path,
      body,
    });
    if (!queuedId) {
      const authenticatedPartitionActive = offlineQueue.canQueue;
      return {
        ok: false,
        data: {
          error: authenticatedPartitionActive
            ? 'offline_persistence_failed'
            : 'authentication_required_offline',
        } as T,
        status: authenticatedPartitionActive ? 507 : 401,
      };
    }
    console.log('[api] Offline — mutation queued:', path, method);
    return { ok: true, data: { queued: true } as T, status: 202, queued: true };
  }

  if (isMutation && !headers['x-csrf-token']) {
    if (requiresFreshCsrf(normalizedPath)) {
      try {
        const csrfResponse = await fetch('/api/auth/csrf', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });
        if (!csrfResponse.ok) {
          return {
            ok: false,
            data: { error: 'csrf_refresh_failed' } as T,
            status: csrfResponse.status,
          };
        }
      } catch {
        return {
          ok: false,
          data: { error: 'online_required' } as T,
          status: 503,
        };
      }
    }
    const token = readCookie('XSRF-TOKEN');
    if (token) headers['x-csrf-token'] = token;
  }

  const res = await fetch(path, { ...requestInit, credentials: 'include', headers });
  const duration = Date.now() - start;
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  const requestId = res.headers.get('x-request-id') || (typeof data === 'object' && data?.requestId) || undefined;
  if (!res.ok && requestId) (window as any).lastRequestId = requestId; else (window as any).lastRequestId = undefined;
  try {
    if (typeof console !== 'undefined') {
      console.log('[api]', path, method, res.status, `${duration}ms`);
    }
  } catch {}
  return { ok: res.ok, data, status: res.status, requestId };
}
