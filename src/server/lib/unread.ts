import { find } from './couch.js';
import type { Blip, BlipRead } from '../schemas/wave.js';

export type WaveUnreadCounts = { total: number; unread: number; read: number };

// Simple in-memory cache for unread counts (TTL: 30 seconds)
const unreadCache = new Map<string, { data: Record<string, WaveUnreadCounts>; expires: number }>();
const CACHE_TTL_MS = 30000;
const MAX_CACHE_ENTRIES = 200;
const DEBUG_UNREAD = process.env['RIZZOMA_DEBUG_UNREAD'] === '1';

function logUnread(...args: any[]): void {
  if (DEBUG_UNREAD) {
    // eslint-disable-next-line no-console
    console.log('[unread]', ...args);
  }
}

function getCacheKey(userId: string, waveIds: string[]): string {
  return `${userId}:${waveIds.slice().sort().join(',')}`;
}

function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of unreadCache.entries()) {
    if (entry.expires < now) unreadCache.delete(key);
  }
}

function pruneCache(): void {
  if (unreadCache.size <= MAX_CACHE_ENTRIES) return;
  const overflow = unreadCache.size - MAX_CACHE_ENTRIES;
  let removed = 0;
  for (const key of unreadCache.keys()) {
    unreadCache.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
  logUnread('pruned cache entries', removed);
}

/**
 * Compute unread/read totals for a batch of waves for a single user.
 * Limits to the first 200 unique ids to avoid expensive fan-out requests.
 * Results are cached for 30 seconds to reduce load.
 */
export async function computeWaveUnreadCounts(
  userId: string,
  waveIds: string[],
): Promise<Record<string, WaveUnreadCounts>> {
  const results: Record<string, WaveUnreadCounts> = {};
  if (!userId) return results;
  if (!Array.isArray(waveIds) || waveIds.length === 0) return results;
  const ids = Array.from(new Set(waveIds.filter(Boolean))).slice(0, 200);
  if (ids.length === 0) return results;

  // Check cache first
  cleanExpiredCache();
  pruneCache();
  const cacheKey = getCacheKey(userId, ids);
  const cached = unreadCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    logUnread('cache hit for', userId, ids.length, 'waves');
    return cached.data;
  }

  logUnread('cache miss, computing for', userId, ids.length, 'waves');
  const startTime = Date.now();
  const normalizeId = (id: string | undefined | null): string[] => {
    const value = String(id || '').trim();
    if (!value) return [];
    const keys = new Set<string>([value]);
    const colonIdx = value.lastIndexOf(':');
    if (colonIdx >= 0 && colonIdx < value.length - 1) keys.add(value.slice(colonIdx + 1));
    const dashIdx = value.lastIndexOf('-');
    if (dashIdx >= 0 && dashIdx < value.length - 1) keys.add(value.slice(dashIdx + 1));
    return Array.from(keys).filter(Boolean);
  };
  // Process all waves in parallel (per-wave queries with indexes are faster than $in)
  await Promise.all(ids.map(async (waveId) => {
    try {
      const [blipResp, readResp] = await Promise.all([
        find<Blip>(
          { type: 'blip', waveId },
          {
            limit: 10000,
            sort: [{ type: 'asc' }, { waveId: 'asc' }, { createdAt: 'asc' }],
            use_index: '_design/9c57a84f24b9fb27e5c004c778922f39dc0309cf',
          }
        ),
        find<BlipRead>(
          { type: 'read', userId, waveId },
          {
            limit: 10000,
            sort: [{ type: 'asc' }, { userId: 'asc' }, { waveId: 'asc' }],
            use_index: '_design/b2c2420f21a1c7a3fdd2165260a586f6e9c8cfc9',
          }
        ),
      ]);
      const blipDocs = (blipResp.docs || []).map((doc) => ({
        id: String((doc as any)._id || ''),
        updatedAt: Number((doc as any).updatedAt ?? (doc as any).createdAt ?? Date.now()),
      }));
      const readMap = new Map<string, number>();
      (readResp.docs || []).forEach((doc) => {
        const readAt = Number((doc as any).readAt ?? Number.MAX_SAFE_INTEGER);
        normalizeId(String((doc as any).blipId || '')).forEach((key) => readMap.set(key, readAt));
        normalizeId(String((doc as any)._id || '')).forEach((key) => {
          if (!readMap.has(key)) readMap.set(key, readAt);
        });
      });
      let unread = 0;
      const readAtForBlip = (docId: string) => {
        for (const key of normalizeId(docId)) {
          if (readMap.has(key)) return readMap.get(key)!;
        }
        return 0;
      };
      blipDocs.forEach((doc) => {
        const readAt = readAtForBlip(doc.id);
        if (doc.updatedAt > readAt) unread += 1;
      });
      results[waveId] = { total: blipDocs.length, unread, read: blipDocs.length - unread };
    } catch {
      if (!results[waveId]) results[waveId] = { total: 0, unread: 0, read: 0 };
    }
  }));

  // Cache the results
  const elapsed = Date.now() - startTime;
  logUnread('computed in', elapsed, 'ms for', ids.length, 'waves');
  unreadCache.set(cacheKey, { data: results, expires: Date.now() + CACHE_TTL_MS });
  pruneCache();

  return results;
}

/**
 * Invalidate cached unread counts for a specific user (e.g., after marking blips as read).
 */
export function invalidateUnreadCache(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of unreadCache.keys()) {
    if (key.startsWith(prefix)) {
      unreadCache.delete(key);
    }
  }
  logUnread('invalidated cache for', userId);
}
