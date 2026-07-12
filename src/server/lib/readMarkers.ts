import { findOne, getDoc, insertDoc, updateDoc } from './couch.js';
import type { BlipRead } from '../schemas/wave.js';

type StoredBlipRead = BlipRead & { _id: string; _rev?: string };

export type BlipReadUpsertResult = {
  ok: boolean;
  id: string;
  rev: string;
  readAt: number;
  created: boolean;
};

const MAX_READ_MARKER_ATTEMPTS = 4;

const isCouchStatus = (error: unknown, status: number): boolean => (
  error instanceof Error && new RegExp(`^${status}(?:\\s|$)`).test(error.message)
);

const deterministicReadMarkerId = (userId: string, waveId: string, blipId: string): string => (
  `read:user:${userId}:wave:${waveId}:blip:${blipId}`
);

async function getReadMarkerById(id: string): Promise<StoredBlipRead | null> {
  try {
    return await getDoc<StoredBlipRead>(id);
  } catch (error) {
    if (isCouchStatus(error, 404)) return null;
    throw error;
  }
}

/**
 * Idempotently advance a user's read marker for one blip.
 *
 * New markers use a deterministic CouchDB ID, so conflict retries can use a
 * strongly consistent direct GET rather than a potentially stale Mango read.
 * A single Mango lookup is retained before creation so older random-ID read
 * marker documents continue to be updated in place.
 */
export async function upsertBlipReadMarker(
  userId: string,
  waveId: string,
  blipId: string,
  requestedReadAt = Date.now(),
): Promise<BlipReadUpsertResult> {
  const deterministicId = deterministicReadMarkerId(userId, waveId, blipId);
  let current = await getReadMarkerById(deterministicId);

  if (!current) {
    current = await findOne<StoredBlipRead>({ type: 'read', userId, waveId, blipId });
  }

  for (let attempt = 0; attempt < MAX_READ_MARKER_ATTEMPTS; attempt += 1) {
    if (!current) {
      const doc: BlipRead = {
        _id: deterministicId,
        type: 'read',
        userId,
        waveId,
        blipId,
        readAt: requestedReadAt,
      };
      try {
        const result = await insertDoc(doc as StoredBlipRead);
        return { ...result, readAt: requestedReadAt, created: true };
      } catch (error) {
        if (!isCouchStatus(error, 409)) throw error;
        current = await getReadMarkerById(deterministicId);
        if (!current) throw error;
        continue;
      }
    }

    const readAt = Math.max(requestedReadAt, Number(current.readAt) || 0);
    try {
      const result = await updateDoc({ ...current, readAt });
      return { ...result, readAt, created: false };
    } catch (error) {
      if (!isCouchStatus(error, 409)) throw error;
      current = await getReadMarkerById(current._id);
      if (!current) throw error;
    }
  }

  throw new Error('409 read marker remained conflicted after bounded retry');
}
