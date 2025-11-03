export type ApiResponse<T = any> = { ok: boolean; data: T | string | null; status: number; requestId?: string };

export function readCookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export async function ensureCsrf(): Promise<string | undefined> {
  try {
    await api('/api/auth/csrf');
  } catch {}
  return readCookie('XSRF-TOKEN');
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const method = (init?.method || 'GET').toUpperCase();
  const base: Record<string, string> = { 'content-type': 'application/json' };
  const given = (init?.headers || {}) as Record<string, string>;
  const headers: Record<string, string> = { ...base, ...given };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!headers['x-csrf-token']) {
      const token = readCookie('XSRF-TOKEN');
      if (token) headers['x-csrf-token'] = token;
    }
  }
  const res = await fetch(path, { credentials: 'include', ...init, headers });
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : null; } catch {}
  const requestId = res.headers.get('x-request-id') || (typeof data === 'object' && data?.requestId) || undefined;
  if (!res.ok && requestId) (window as any).lastRequestId = requestId; else (window as any).lastRequestId = undefined;
  return { ok: res.ok, data, status: res.status, requestId };
}
