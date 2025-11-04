import { config } from '../config.js';

function buildAuth(urlString: string): { base: string; header?: string } {
  const u = new URL(urlString);
  if (u.username || u.password) {
    const token = Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64');
    u.username = '';
    u.password = '';
    return { base: u.toString().replace(/\/$/, ''), header: `Basic ${token}` };
  }
  return { base: urlString.replace(/\/$/, ''), header: undefined };
}

async function httpJson<T>(method: string, url: string, body?: unknown, authHeader?: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) {
    const msg = json?.reason || json?.error || text || res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return json as T;
}

export async function couchDbInfo() {
  const { base, header } = buildAuth(config.couchDbUrl);
  return httpJson<any>('GET', base, undefined, header);
}

export async function view<T = any>(design: string, viewName: string, params?: Record<string, string | number | boolean>) {
  const { base, header } = buildAuth(config.couchDbUrl);
  const qp = params
    ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)] as [string, string])).toString()
    : '';
  const url = `${base}/${encodeURIComponent(config.couchDbName)}/_design/${encodeURIComponent(design)}/_view/${encodeURIComponent(viewName)}${qp}`;
  return httpJson<{ rows: Array<{ id: string; key: any; value: any; doc?: T }> }>('GET', url, undefined, header);
}

export async function insertDoc<T extends Record<string, any>>(doc: T) {
  const { base, header } = buildAuth(config.couchDbUrl);
  const url = `${base}/${encodeURIComponent(config.couchDbName)}`;
  return httpJson<{ ok: boolean; id: string; rev: string }>('POST', url, doc, header);
}

export async function find<T = any>(
  selector: Record<string, any>,
  options?: { limit?: number; skip?: number; sort?: Array<Record<string, 'asc' | 'desc'>>; bookmark?: string }
) {
  const { base, header } = buildAuth(config.couchDbUrl);
  const url = `${base}/${encodeURIComponent(config.couchDbName)}/_find`;
  const body: any = { selector };
  if (options?.limit) body.limit = options.limit;
  if (typeof options?.skip === 'number') body.skip = options.skip;
  if (options?.sort) body.sort = options.sort;
  if (options?.bookmark) body.bookmark = options.bookmark;
  return httpJson<{ docs: T[]; bookmark?: string }>('POST', url, body, header);
}

export async function createIndex(fields: string[], name?: string) {
  const { base, header } = buildAuth(config.couchDbUrl);
  const url = `${base}/${encodeURIComponent(config.couchDbName)}/_index`;
  const body: any = { index: { fields } };
  if (name) body.name = name;
  return httpJson<any>('POST', url, body, header);
}

export async function getDoc<T = any>(id: string) {
  const { base, header } = buildAuth(config.couchDbUrl);
  const url = `${base}/${encodeURIComponent(config.couchDbName)}/${encodeURIComponent(id)}`;
  return httpJson<T>('GET', url, undefined, header);
}

export async function findOne<T = any>(selector: Record<string, any>) {
  const r = await find<T>(selector, { limit: 1 });
  return r.docs[0] || null;
}

export async function updateDoc<T extends { _id?: string; _rev?: string }>(doc: T) {
  if (!doc._id) throw new Error('missing _id');
  const { base, header } = buildAuth(config.couchDbUrl);
  const url = `${base}/${encodeURIComponent(config.couchDbName)}/${encodeURIComponent(doc._id)}`;
  return httpJson<{ ok: boolean; id: string; rev: string }>('PUT', url, doc, header);
}

export async function deleteDoc(id: string, rev: string) {
  const { base, header } = buildAuth(config.couchDbUrl);
  const u = new URL(`${base}/${encodeURIComponent(config.couchDbName)}/${encodeURIComponent(id)}`);
  u.searchParams.set('rev', rev);
  return httpJson<{ ok: boolean; id: string; rev: string }>('DELETE', u.toString(), undefined, header);
}
