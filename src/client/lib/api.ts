export type ApiResponse<T = any> = { ok: boolean; data: T | string | null; status: number; requestId?: string };

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

export async function api<T = any>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const start = Date.now();
  const method = (init?.method || 'GET').toUpperCase();
  const base: Record<string, string> = { 'content-type': 'application/json' };
  const given = (init?.headers || {}) as Record<string, string>;
  const headers: Record<string, string> = { ...base, ...given };

  // Perf harness bypass: skip sidebar topics fetch to avoid blocking landing render during perf runs
  const perfSkip =
    typeof localStorage !== 'undefined' && localStorage.getItem('rizzoma:perf:skipSidebarTopics') === '1';
  const perfHash = typeof window !== 'undefined' && (window.location.hash || '').includes('perf=1');
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
    return { ok: true, data: { topics: [], hasMore: false }, status: 200 };
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!headers['x-csrf-token']) {
      const token = readCookie('XSRF-TOKEN');
      if (token) headers['x-csrf-token'] = token;
    }
  }
  const res = await fetch(path, { credentials: 'include', ...init, headers });
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
