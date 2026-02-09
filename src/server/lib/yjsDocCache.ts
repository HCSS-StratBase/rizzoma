import * as Y from 'yjs';
import { findOne, insertDoc, updateDoc } from './couch.js';

class YjsDocCache {
  private docs = new Map<string, { doc: Y.Doc; lastAccess: number; refCount: number }>();
  private dirty = new Set<string>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private persistInterval: ReturnType<typeof setInterval> | null = null;
  private readonly TTL_MS = 5 * 60 * 1000; // 5 min idle cleanup

  start() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    this.cleanupInterval.unref?.();
    this.persistInterval = setInterval(() => this.persistDirty(), 30_000);
    this.persistInterval.unref?.();
  }

  getOrCreate(blipId: string): Y.Doc {
    let entry = this.docs.get(blipId);
    if (!entry) {
      entry = { doc: new Y.Doc(), lastAccess: Date.now(), refCount: 0 };
      this.docs.set(blipId, entry);
    }
    entry.lastAccess = Date.now();
    return entry.doc;
  }

  addRef(blipId: string) {
    const entry = this.docs.get(blipId);
    if (entry) entry.refCount++;
  }

  removeRef(blipId: string) {
    const entry = this.docs.get(blipId);
    if (entry) entry.refCount = Math.max(0, entry.refCount - 1);
  }

  getState(blipId: string): Uint8Array | null {
    const entry = this.docs.get(blipId);
    if (!entry) return null;
    return Y.encodeStateAsUpdate(entry.doc);
  }

  applyUpdate(blipId: string, update: Uint8Array, origin?: any) {
    const doc = this.getOrCreate(blipId);
    Y.applyUpdate(doc, update, origin);
    this.dirty.add(blipId);
  }

  /**
   * Compute a diff update: given the client's state vector,
   * return only the updates the client is missing.
   */
  encodeDiffUpdate(blipId: string, stateVector: Uint8Array): Uint8Array | null {
    const entry = this.docs.get(blipId);
    if (!entry) return null;
    return Y.encodeStateAsUpdate(entry.doc, stateVector);
  }

  /**
   * Load a Y.Doc from CouchDB snapshot if it exists and the doc is empty.
   */
  async loadFromDb(blipId: string): Promise<void> {
    const doc = this.getOrCreate(blipId);
    if (doc.store.clients.size > 0) return; // already has data
    try {
      const snap = await findOne({ type: 'yjs_snapshot', blipId });
      if (snap?.snapshotB64) {
        const buf = Buffer.from(snap.snapshotB64, 'base64');
        Y.applyUpdate(doc, new Uint8Array(buf));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[yjsDocCache] loadFromDb(${blipId}):`, err);
    }
  }

  async persistDirty() {
    for (const blipId of this.dirty) {
      const entry = this.docs.get(blipId);
      if (!entry) { this.dirty.delete(blipId); continue; }
      try {
        const state = Y.encodeStateAsUpdate(entry.doc);
        const snapshotB64 = Buffer.from(state).toString('base64');
        const waveId = blipId.includes(':') ? blipId.split(':')[0] : blipId;
        // Try to find existing snapshot doc
        const existing = await findOne({ type: 'yjs_snapshot', blipId });
        if (existing) {
          await updateDoc({ ...existing, snapshotB64, updatedAt: Date.now() });
        } else {
          await insertDoc({ type: 'yjs_snapshot', waveId, blipId, snapshotB64, updatedAt: Date.now() });
        }
        this.dirty.delete(blipId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[yjsDocCache] persistDirty(${blipId}):`, err);
      }
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [blipId, entry] of this.docs) {
      if (entry.refCount <= 0 && now - entry.lastAccess > this.TTL_MS) {
        entry.doc.destroy();
        this.docs.delete(blipId);
        this.dirty.delete(blipId);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.persistInterval) clearInterval(this.persistInterval);
    this.docs.forEach(e => e.doc.destroy());
    this.docs.clear();
    this.dirty.clear();
  }
}

export const yjsDocCache = new YjsDocCache();
