import { createIndex, find } from './couch.js';
import type { Blip, BlipRead } from '../schemas/wave.js';

export type WaveUnreadCounts = { total: number; unread: number; read: number };

/**
 * Compute unread/read totals for a batch of waves for a single user.
 * Limits to the first 200 unique ids to avoid expensive fan-out requests.
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
  await createIndex(['type', 'userId', 'waveId'], 'idx_read_user_wave').catch(() => undefined);
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
  for (const waveId of ids) {
    try {
      const blipResp = await find<Blip>({ type: 'blip', waveId }, { limit: 10000 });
      const blipDocs = (blipResp.docs || []).map((doc) => ({
        id: String((doc as any)._id || ''),
        updatedAt: Number((doc as any).updatedAt ?? (doc as any).createdAt ?? Date.now()),
      }));
      const readResp = await find<BlipRead>({ type: 'read', userId, waveId }, { limit: 10000 });
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
  }
  return results;
}
