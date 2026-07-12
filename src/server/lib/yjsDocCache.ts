import * as Y from 'yjs';
import { findOne, insertDoc, updateDoc } from './couch.js';

class YjsDocCache {
  private docs = new Map<string, { doc: Y.Doc; lastAccess: number; refCount: number; version: number }>();
  private dirty = new Set<string>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private persistInterval: ReturnType<typeof setInterval> | null = null;
  private persistPromise: Promise<PersistResult> | null = null;
  private readonly TTL_MS = 5 * 60 * 1000; // 5 min idle cleanup
  private readonly PERSIST_REQUEST_TIMEOUT_MS = 3_000;

  start() {
    if (this.cleanupInterval || this.persistInterval) return;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    this.cleanupInterval.unref?.();
    this.persistInterval = setInterval(() => { void this.persistDirty(); }, 30_000);
    this.persistInterval.unref?.();
  }

  getOrCreate(blipId: string): Y.Doc {
    let entry = this.docs.get(blipId);
    if (!entry) {
      entry = { doc: new Y.Doc(), lastAccess: Date.now(), refCount: 0, version: 0 };
      this.docs.set(blipId, entry);
    }
    entry.lastAccess = Date.now();
    return entry.doc;
  }

  addRef(blipId: string) {
    // Joining is the operation that establishes the first live reference.
    // Create the cache entry here so addRef-before-loadFromDb cannot silently
    // leave refCount at zero and allow cleanup to evict a still-joined doc.
    this.getOrCreate(blipId);
    const entry = this.docs.get(blipId)!;
    entry.refCount++;
  }

  removeRef(blipId: string) {
    const entry = this.docs.get(blipId);
    if (entry) entry.refCount = Math.max(0, entry.refCount - 1);
  }

  /** Permanently discard collaborative state for a tombstoned blip. Deleted
   * content must never be flushed later by the periodic snapshot writer. */
  discard(blipId: string): void {
    const entry = this.docs.get(blipId);
    entry?.doc.destroy();
    this.docs.delete(blipId);
    this.dirty.delete(blipId);
  }

  getState(blipId: string): Uint8Array | null {
    const entry = this.docs.get(blipId);
    if (!entry) return null;
    return Y.encodeStateAsUpdate(entry.doc);
  }

  /** True when the Y.Doc exists but has no CRDT content — used by the
   *  seed-authority logic in socket.ts to decide whether a fresh
   *  joiner should seed from blip HTML. Task #57. */
  isEmpty(blipId: string): boolean {
    const entry = this.docs.get(blipId);
    if (!entry) return true;
    return entry.doc.store.clients.size === 0;
  }

  applyUpdate(blipId: string, update: Uint8Array, origin?: any) {
    const doc = this.getOrCreate(blipId);
    Y.applyUpdate(doc, update, origin);
    const entry = this.docs.get(blipId);
    if (entry) entry.version += 1;
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

  persistDirty(): Promise<PersistResult> {
    if (this.persistPromise) return this.persistPromise;
    this.persistPromise = this.persistDirtyPass().finally(() => {
      this.persistPromise = null;
    });
    return this.persistPromise;
  }

  private async persistDirtyPass(): Promise<PersistResult> {
    const result: PersistResult = { persisted: 0, failed: [] };
    // Persist independent blips concurrently. With a dedicated three-second
    // timeout per Couch request, one pass is bounded to roughly one find plus
    // one write instead of N serial request pairs during shutdown.
    await Promise.all(Array.from(this.dirty).map(async blipId => {
      const entry = this.docs.get(blipId);
      if (!entry) { this.dirty.delete(blipId); return; }
      const versionAtStart = entry.version;
      try {
        const state = Y.encodeStateAsUpdate(entry.doc);
        const snapshotB64 = Buffer.from(state).toString('base64');
        const waveId = blipId.includes(':') ? blipId.split(':')[0] : blipId;
        // Try to find existing snapshot doc
        const existing = await findOne(
          { type: 'yjs_snapshot', blipId },
          this.PERSIST_REQUEST_TIMEOUT_MS,
        );
        if (existing) {
          await updateDoc(
            { ...existing, snapshotB64, updatedAt: Date.now() },
            this.PERSIST_REQUEST_TIMEOUT_MS,
          );
        } else {
          await insertDoc(
            { type: 'yjs_snapshot', waveId, blipId, snapshotB64, updatedAt: Date.now() },
            this.PERSIST_REQUEST_TIMEOUT_MS,
          );
        }
        // An update may arrive while the CouchDB write is in flight. Clear the
        // dirty bit only when the exact version we serialized is still current.
        if (entry.version === versionAtStart) this.dirty.delete(blipId);
        result.persisted += 1;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[yjsDocCache] persistDirty(${blipId}):`, err);
        result.failed.push(blipId);
      }
    }));
    return result;
  }

  getDirtyCount(): number {
    return this.dirty.size;
  }

  async shutdown(): Promise<void> {
    this.stopIntervals();

    // Socket.IO is closed before this method is called, so the dirty set is
    // stable. Retry transient CouchDB failures while systemd's stop timeout is
    // still available; never silently report a clean shutdown with dirty docs.
    for (let attempt = 1; this.dirty.size > 0 && attempt <= 3; attempt += 1) {
      await this.persistDirty();
      if (this.dirty.size > 0 && attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }

    if (this.dirty.size > 0) {
      throw new Error(`Failed to persist ${this.dirty.size} dirty collaborative document(s)`);
    }

    this.destroyDocs();
  }

  private cleanup() {
    const now = Date.now();
    for (const [blipId, entry] of this.docs) {
      // Never evict a document whose last successful CouchDB snapshot lags
      // behind its in-memory state. During a prolonged Couch outage the cache
      // may grow, but discarding unsaved collaboration would be irreversible.
      if (entry.refCount <= 0
        && !this.dirty.has(blipId)
        && now - entry.lastAccess > this.TTL_MS) {
        entry.doc.destroy();
        this.docs.delete(blipId);
      }
    }
  }

  destroy() {
    this.stopIntervals();
    this.destroyDocs();
  }

  private stopIntervals() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    if (this.persistInterval) clearInterval(this.persistInterval);
    this.cleanupInterval = null;
    this.persistInterval = null;
  }

  private destroyDocs() {
    this.docs.forEach(e => e.doc.destroy());
    this.docs.clear();
    this.dirty.clear();
  }
}

export type PersistResult = { persisted: number; failed: string[] };

export const yjsDocCache = new YjsDocCache();
