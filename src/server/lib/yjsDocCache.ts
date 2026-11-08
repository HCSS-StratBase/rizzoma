import * as Y from 'yjs';
import { createHash } from 'node:crypto';
import { deleteDoc, find, findOne, insertDoc, updateDoc } from './couch.js';

type CachedYjsDocument = {
  doc: Y.Doc;
  generation: number;
  lastAccess: number;
  refCount: number;
  version: number;
};

function normalizeGeneration(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

class YjsDocCache {
  private docs = new Map<string, CachedYjsDocument>();
  private dirty = new Set<string>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private persistInterval: ReturnType<typeof setInterval> | null = null;
  private persistPromise: Promise<PersistResult> | null = null;
  private mutationTails = new Map<string, Promise<void>>();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 min idle cleanup
  private readonly PERSIST_REQUEST_TIMEOUT_MS = 3_000;

  start() {
    if (this.cleanupInterval || this.persistInterval) return;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    this.cleanupInterval.unref?.();
    this.persistInterval = setInterval(() => { void this.persistDirty(); }, 30_000);
    this.persistInterval.unref?.();
  }

  getOrCreate(blipId: string, generation?: number): Y.Doc {
    let entry = this.docs.get(blipId);
    if (!entry) {
      entry = {
        doc: new Y.Doc(),
        generation: normalizeGeneration(generation),
        lastAccess: Date.now(),
        refCount: 0,
        version: 0,
      };
      this.docs.set(blipId, entry);
    } else if (generation !== undefined && entry.generation !== normalizeGeneration(generation)) {
      if (entry.refCount > 0 || this.dirty.has(blipId)) {
        throw new Error('collaboration_generation_conflict');
      }
      entry.doc.destroy();
      entry = {
        doc: new Y.Doc(),
        generation: normalizeGeneration(generation),
        lastAccess: Date.now(),
        refCount: 0,
        version: 0,
      };
      this.docs.set(blipId, entry);
    }
    entry.lastAccess = Date.now();
    return entry.doc;
  }

  addRef(blipId: string, generation?: number) {
    // Joining is the operation that establishes the first live reference.
    // Create the cache entry here so addRef-before-loadFromDb cannot silently
    // leave refCount at zero and allow cleanup to evict a still-joined doc.
    this.getOrCreate(blipId, generation);
    const entry = this.docs.get(blipId)!;
    entry.refCount++;
  }

  removeRef(blipId: string) {
    const entry = this.docs.get(blipId);
    if (entry) entry.refCount = Math.max(0, entry.refCount - 1);
  }

  hasActiveRefs(blipId: string): boolean {
    return (this.docs.get(blipId)?.refCount || 0) > 0;
  }

  isDirty(blipId: string): boolean {
    return this.dirty.has(blipId);
  }

  getGeneration(blipId: string): number | null {
    return this.docs.get(blipId)?.generation ?? null;
  }

  /** Serialize every operation that can establish, mutate, persist, or reset
   * one collaborative document. Couch writes yield back to the event loop, so
   * a normal in-process "check then write" is otherwise racy with socket joins
   * and updates for the same blip. */
  async runExclusive<T>(blipId: string, operation: () => Promise<T> | T): Promise<T> {
    const previous = this.mutationTails.get(blipId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => current);
    this.mutationTails.set(blipId, tail);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.mutationTails.get(blipId) === tail) this.mutationTails.delete(blipId);
    }
  }

  matchesStateDigest(blipId: string, candidate: string, generation?: number): boolean {
    const entry = this.docs.get(blipId);
    if (!entry) return false;
    if (generation !== undefined && entry.generation !== normalizeGeneration(generation)) return false;
    const current = Y.encodeStateAsUpdate(entry.doc);
    const digest = createHash('sha256').update(current).digest('hex');
    return digest === candidate;
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

  applyUpdate(blipId: string, update: Uint8Array, origin?: any, generation?: number) {
    const doc = this.getOrCreate(blipId, generation);
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
  async loadFromDb(blipId: string, generation = 0): Promise<void> {
    const normalizedGeneration = normalizeGeneration(generation);
    const entryBeforeLoad = this.docs.get(blipId);
    const doc = this.getOrCreate(blipId, normalizedGeneration);
    if (doc.store.clients.size > 0) return; // already has data
    try {
      // Never accept a snapshot merely because it was written recently. Only
      // the durable content generation identifies the CRDT history that is
      // allowed to materialize this topic/blip. Untagged legacy snapshots are
      // intentionally ignored and will be recreated from authoritative HTML.
      const snap = await findOne({
        type: 'yjs_snapshot',
        blipId,
        yjsGeneration: normalizedGeneration,
      });
      if (snap?.snapshotB64) {
        const buf = Buffer.from(snap.snapshotB64, 'base64');
        // Y.applyUpdate is not transactional: malformed/truncated bytes can
        // mutate part of a document before throwing. Validate into a
        // disposable document first, then merge only its successfully decoded
        // full state into the authoritative cache document.
        const candidate = new Y.Doc();
        try {
          Y.applyUpdate(candidate, new Uint8Array(buf));
          Y.applyUpdate(doc, Y.encodeStateAsUpdate(candidate));
        } finally {
          candidate.destroy();
        }
      }
    } catch (err) {
      // A failed lookup is not evidence that no snapshot exists. In
      // particular, seeding durable HTML after a transient Couch failure can
      // replace a newer, already-acknowledged CRDT snapshot with stale HTML.
      // Remove only the clean entry this load created, then fail closed so the
      // socket join publishes no membership, reference, or seed authority.
      const current = this.docs.get(blipId);
      if (
        !entryBeforeLoad
        && current?.doc === doc
        && current.refCount === 0
        && !this.dirty.has(blipId)
        && doc.store.clients.size === 0
      ) {
        doc.destroy();
        this.docs.delete(blipId);
      }
      throw err;
    }
  }

  /** Clear every CRDT authority for an out-of-band full-content replacement.
   * Call only from runExclusive() after confirming there are no live refs. */
  async clearForExternalReplacement(blipId: string): Promise<void> {
    if (this.hasActiveRefs(blipId)) throw new Error('collaboration_active');
    // A socket update is acknowledged before the debounced HTML projection.
    // Once every socket leaves, that update can therefore be dirty but have no
    // live ref. Reject the first external replacement so it cannot silently
    // erase the acknowledged edit; persistence will retain it for an explicit
    // later override/retry.
    if (this.isDirty(blipId)) throw new Error('collaboration_pending_projection');
    this.discard(blipId);
    const snapshots = await find<any>({ type: 'yjs_snapshot', blipId }, { limit: 1000 });
    await Promise.all((snapshots.docs || []).map(async (snapshot) => {
      if (snapshot?._id && snapshot?._rev) await deleteDoc(snapshot._id, snapshot._rev);
    }));
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
      await this.runExclusive(blipId, async () => {
        const entry = this.docs.get(blipId);
        if (!entry) { this.dirty.delete(blipId); return; }
        try {
          await this.persistCurrentLocked(blipId, entry.generation);
          result.persisted += 1;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[yjsDocCache] persistDirty(${blipId}):`, err);
          result.failed.push(blipId);
        }
      });
    }));
    return result;
  }

  /** Persist the exact in-memory CRDT state while the caller owns this blip's
   * runExclusive boundary. Projection routes call this before updating HTML,
   * so a process restart cannot rebuild the same generation from fresh CRDT
   * identities and later duplicate a retained offline client's history. */
  async persistCurrentLocked(blipId: string, generation?: number): Promise<void> {
    const entry = this.docs.get(blipId);
    if (!entry) throw new Error('collaboration_state_missing');
    if (generation !== undefined && entry.generation !== normalizeGeneration(generation)) {
      throw new Error('collaboration_generation_conflict');
    }
    const versionAtStart = entry.version;
    const state = Y.encodeStateAsUpdate(entry.doc);
    const snapshotB64 = Buffer.from(state).toString('base64');
    const waveId = blipId.includes(':') ? blipId.split(':')[0] : blipId;
    const selector = {
      type: 'yjs_snapshot',
      blipId,
      yjsGeneration: entry.generation,
    };
    const existing = await findOne(selector, this.PERSIST_REQUEST_TIMEOUT_MS);
    if (existing) {
      await updateDoc(
        { ...existing, snapshotB64, updatedAt: Date.now(), yjsGeneration: entry.generation },
        this.PERSIST_REQUEST_TIMEOUT_MS,
      );
    } else {
      await insertDoc(
        {
          type: 'yjs_snapshot',
          waveId,
          blipId,
          snapshotB64,
          updatedAt: Date.now(),
          yjsGeneration: entry.generation,
        },
        this.PERSIST_REQUEST_TIMEOUT_MS,
      );
    }
    // A future call may mutate the entry while a raw Couch request is pending
    // only if the method was misused outside runExclusive. Preserve dirty in
    // that case rather than claiming durability for a newer state.
    if (entry.version === versionAtStart) this.dirty.delete(blipId);
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
    this.mutationTails.clear();
  }
}

export type PersistResult = { persisted: number; failed: string[] };

export const yjsDocCache = new YjsDocCache();
