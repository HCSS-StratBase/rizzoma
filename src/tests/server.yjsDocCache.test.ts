import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { createHash } from 'node:crypto';

// Mock couch module before importing yjsDocCache
vi.mock('../server/lib/couch.js', () => ({
  findOne: vi.fn().mockResolvedValue(null),
  find: vi.fn().mockResolvedValue({ docs: [] }),
  deleteDoc: vi.fn().mockResolvedValue({ ok: true, id: 'mock', rev: '3' }),
  insertDoc: vi.fn().mockResolvedValue({ ok: true, id: 'mock', rev: '1' }),
  updateDoc: vi.fn().mockResolvedValue({ ok: true, id: 'mock', rev: '2' }),
}));

// Import after mock setup
import { yjsDocCache } from '../server/lib/yjsDocCache';
import { deleteDoc, find, findOne, insertDoc, updateDoc } from '../server/lib/couch';

describe('server: YjsDocCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    yjsDocCache.destroy();
  });

  it('creates and caches Y.Doc per blipId', () => {
    const doc1 = yjsDocCache.getOrCreate('blip-1');
    const doc2 = yjsDocCache.getOrCreate('blip-1');
    const doc3 = yjsDocCache.getOrCreate('blip-2');

    expect(doc1).toBe(doc2); // same instance
    expect(doc1).not.toBe(doc3); // different blip = different doc
    expect(doc1).toBeInstanceOf(Y.Doc);
  });

  it('tracks ref counts via addRef / removeRef', () => {
    yjsDocCache.getOrCreate('blip-1');
    yjsDocCache.addRef('blip-1');
    yjsDocCache.addRef('blip-1');
    yjsDocCache.removeRef('blip-1');
    // Should still be cached (refCount = 1)
    const doc = yjsDocCache.getOrCreate('blip-1');
    expect(doc).toBeInstanceOf(Y.Doc);
  });

  it('creates the first cache entry when a live join adds its reference', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-12T10:00:00Z'));
      yjsDocCache.addRef('blip-first-join');
      const activeState = yjsDocCache.getState('blip-first-join');
      expect(activeState).not.toBeNull();

      vi.setSystemTime(new Date('2026-07-12T10:06:00Z'));
      (yjsDocCache as any).cleanup();

      // Active references are not evicted even after the idle TTL.
      expect(yjsDocCache.getState('blip-first-join')).not.toBeNull();

      yjsDocCache.removeRef('blip-first-join');
      (yjsDocCache as any).cleanup();
      expect(yjsDocCache.getState('blip-first-join')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('removeRef does not go below 0', () => {
    yjsDocCache.getOrCreate('blip-1');
    yjsDocCache.removeRef('blip-1');
    yjsDocCache.removeRef('blip-1');
    yjsDocCache.removeRef('blip-1');
    // Should not throw
    const doc = yjsDocCache.getOrCreate('blip-1');
    expect(doc).toBeInstanceOf(Y.Doc);
  });

  it('applies updates and marks dirty', () => {
    yjsDocCache.getOrCreate('blip-1');
    // Create an update by modifying a separate doc and extracting the update
    const sourceDoc = new Y.Doc();
    const text = sourceDoc.getText('test');
    let capturedUpdate: Uint8Array | null = null;
    sourceDoc.on('update', (update: Uint8Array) => { capturedUpdate = update; });
    text.insert(0, 'hello');

    expect(capturedUpdate).not.toBeNull();
    yjsDocCache.applyUpdate('blip-1', capturedUpdate!, 'test');

    const state = yjsDocCache.getState('blip-1');
    expect(state).not.toBeNull();
    expect(state!.length).toBeGreaterThan(2);

    sourceDoc.destroy();
  });

  it('getState returns null for unknown blipId', () => {
    expect(yjsDocCache.getState('nonexistent')).toBeNull();
  });

  it('encodeDiffUpdate returns null for unknown blipId', () => {
    expect(yjsDocCache.encodeDiffUpdate('nonexistent', new Uint8Array([0]))).toBeNull();
  });

  it('encodeDiffUpdate returns a diff based on state vector', () => {
    // Set up a doc with content
    const sourceDoc = new Y.Doc();
    const text = sourceDoc.getText('test');
    text.insert(0, 'hello world');
    const fullUpdate = Y.encodeStateAsUpdate(sourceDoc);
    yjsDocCache.applyUpdate('blip-diff', fullUpdate, 'test');

    // A fresh state vector (empty doc) should get the full state
    const emptySV = Y.encodeStateVector(new Y.Doc());
    const diff = yjsDocCache.encodeDiffUpdate('blip-diff', emptySV);
    expect(diff).not.toBeNull();
    expect(diff!.length).toBeGreaterThan(2);

    // The same doc's state vector should return a minimal diff
    const fullSV = Y.encodeStateVector(sourceDoc);
    const minDiff = yjsDocCache.encodeDiffUpdate('blip-diff', fullSV);
    expect(minDiff).not.toBeNull();
    // Minimal diff should be smaller than full diff
    expect(minDiff!.length).toBeLessThanOrEqual(diff!.length);

    sourceDoc.destroy();
  });

  it('loadFromDb applies snapshot from CouchDB', async () => {
    // Create a snapshot to "load"
    const sourceDoc = new Y.Doc();
    sourceDoc.getText('test').insert(0, 'persisted');
    const snapshotB64 = Buffer.from(Y.encodeStateAsUpdate(sourceDoc)).toString('base64');
    vi.mocked(findOne).mockResolvedValueOnce({ snapshotB64 });

    await yjsDocCache.loadFromDb('blip-load');

    const doc = yjsDocCache.getOrCreate('blip-load');
    const text = doc.getText('test');
    expect(text.toString()).toBe('persisted');

    sourceDoc.destroy();
  });

  it('fails closed when the snapshot lookup fails and only seeds after a successful empty lookup', async () => {
    vi.mocked(findOne).mockRejectedValueOnce(new Error('snapshot storage unavailable'));

    await expect(yjsDocCache.loadFromDb('blip-load-outage', 3))
      .rejects.toThrow('snapshot storage unavailable');

    // The failed lookup publishes no empty cache authority that callers could
    // mistake for a successfully absent snapshot.
    expect(yjsDocCache.getState('blip-load-outage')).toBeNull();
    expect(yjsDocCache.hasActiveRefs('blip-load-outage')).toBe(false);
    expect(yjsDocCache.isDirty('blip-load-outage')).toBe(false);

    vi.mocked(findOne).mockResolvedValueOnce(null);
    await expect(yjsDocCache.loadFromDb('blip-load-outage', 3)).resolves.toBeUndefined();
    expect(yjsDocCache.isEmpty('blip-load-outage')).toBe(true);
    expect(yjsDocCache.getGeneration('blip-load-outage')).toBe(3);
  });

  it('never admits a partially applied truncated snapshot into the authoritative cache', async () => {
    const sourceDoc = new Y.Doc();
    const expected = Array.from({ length: 256 }, (_, index) => `record-${index}`).join('|');
    sourceDoc.getText('default').insert(0, expected);
    const validUpdate = Y.encodeStateAsUpdate(sourceDoc);
    const truncatedUpdate = validUpdate.slice(0, -1);

    // Prove this exact fixture exercises the dangerous Yjs behavior: the
    // decoder mutates a disposable document before reporting truncation.
    const partiallyApplied = new Y.Doc();
    expect(() => Y.applyUpdate(partiallyApplied, truncatedUpdate)).toThrow();
    expect(partiallyApplied.store.clients.size).toBeGreaterThan(0);
    partiallyApplied.destroy();

    vi.mocked(findOne).mockResolvedValueOnce({
      snapshotB64: Buffer.from(truncatedUpdate).toString('base64'),
    });
    await expect(yjsDocCache.loadFromDb('blip-truncated-snapshot', 4)).rejects.toThrow();
    expect(yjsDocCache.getState('blip-truncated-snapshot')).toBeNull();
    expect(yjsDocCache.hasActiveRefs('blip-truncated-snapshot')).toBe(false);
    expect(yjsDocCache.isDirty('blip-truncated-snapshot')).toBe(false);

    vi.mocked(findOne).mockResolvedValueOnce({
      snapshotB64: Buffer.from(validUpdate).toString('base64'),
    });
    await expect(yjsDocCache.loadFromDb('blip-truncated-snapshot', 4)).resolves.toBeUndefined();
    expect(yjsDocCache.getOrCreate('blip-truncated-snapshot', 4).getText('default').toString())
      .toBe(expected);
    sourceDoc.destroy();
  });

  it('ignores a snapshot from a superseded durable content generation', async () => {
    const sourceDoc = new Y.Doc();
    sourceDoc.getText('test').insert(0, 'stale');
    const snapshotB64 = Buffer.from(Y.encodeStateAsUpdate(sourceDoc)).toString('base64');
    vi.mocked(findOne).mockImplementationOnce(async (selector: any) => (
      selector?.yjsGeneration === 1
        ? { snapshotB64, updatedAt: 999, yjsGeneration: 1 }
        : null
    ));

    await yjsDocCache.loadFromDb('blip-stale', 2);

    expect(yjsDocCache.isEmpty('blip-stale')).toBe(true);
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
      type: 'yjs_snapshot',
      blipId: 'blip-stale',
      yjsGeneration: 2,
    }));
    sourceDoc.destroy();
  });

  it('matches only the exact authoritative full-state digest', () => {
    const sourceDoc = new Y.Doc();
    sourceDoc.getText('default').insert(0, 'current');
    yjsDocCache.applyUpdate('blip-vector', Y.encodeStateAsUpdate(sourceDoc), 'test');
    const currentDigest = createHash('sha256')
      .update(Y.encodeStateAsUpdate(sourceDoc))
      .digest('hex');

    expect(yjsDocCache.matchesStateDigest('blip-vector', currentDigest)).toBe(true);
    expect(yjsDocCache.matchesStateDigest('blip-vector', '0'.repeat(64))).toBe(false);
    expect(yjsDocCache.matchesStateDigest('missing', currentDigest)).toBe(false);
    sourceDoc.destroy();
  });

  it('invalidates a projection digest after a deletion-only Yjs update', () => {
    const sourceDoc = new Y.Doc();
    const text = sourceDoc.getText('default');
    text.insert(0, 'task survives');
    yjsDocCache.applyUpdate('blip-delete-digest', Y.encodeStateAsUpdate(sourceDoc), 'insert');

    const beforeVector = Buffer.from(Y.encodeStateVector(sourceDoc)).toString('hex');
    const beforeDigest = createHash('sha256')
      .update(Y.encodeStateAsUpdate(sourceDoc))
      .digest('hex');
    const serverVectorBefore = Buffer.from(
      Y.encodeStateVector(yjsDocCache.getOrCreate('blip-delete-digest')),
    ).toString('hex');

    let deletionUpdate: Uint8Array | null = null;
    sourceDoc.once('update', (update: Uint8Array) => { deletionUpdate = update; });
    text.delete(0, 5);
    expect(deletionUpdate).not.toBeNull();
    yjsDocCache.applyUpdate('blip-delete-digest', deletionUpdate!, 'delete');

    const afterVector = Buffer.from(Y.encodeStateVector(sourceDoc)).toString('hex');
    const afterDigest = createHash('sha256')
      .update(Y.encodeStateAsUpdate(sourceDoc))
      .digest('hex');
    const serverVectorAfter = Buffer.from(
      Y.encodeStateVector(yjsDocCache.getOrCreate('blip-delete-digest')),
    ).toString('hex');

    // Yjs state vectors do not encode the delete set, so this is the exact
    // regression that a vector-only projection token cannot detect.
    expect(afterVector).toBe(beforeVector);
    expect(serverVectorAfter).toBe(serverVectorBefore);
    expect(afterDigest).not.toBe(beforeDigest);
    expect(yjsDocCache.matchesStateDigest('blip-delete-digest', beforeDigest)).toBe(false);
    expect(yjsDocCache.matchesStateDigest('blip-delete-digest', afterDigest)).toBe(true);
    sourceDoc.destroy();
  });

  it('isolates clean document generations and refuses to strand dirty old state', async () => {
    const oldDoc = new Y.Doc();
    oldDoc.getText('default').insert(0, 'generation one');
    yjsDocCache.applyUpdate(
      'blip-generation-cache',
      Y.encodeStateAsUpdate(oldDoc),
      'old-generation',
      1,
    );
    expect(yjsDocCache.getGeneration('blip-generation-cache')).toBe(1);
    expect(() => yjsDocCache.getOrCreate('blip-generation-cache', 2))
      .toThrow('collaboration_generation_conflict');

    await yjsDocCache.runExclusive('blip-generation-cache', () => (
      yjsDocCache.persistCurrentLocked('blip-generation-cache', 1)
    ));
    expect(yjsDocCache.isDirty('blip-generation-cache')).toBe(false);

    const newDoc = yjsDocCache.getOrCreate('blip-generation-cache', 2);
    expect(yjsDocCache.getGeneration('blip-generation-cache')).toBe(2);
    expect(newDoc.getText('default').toString()).toBe('');
    expect(yjsDocCache.isEmpty('blip-generation-cache')).toBe(true);
    oldDoc.destroy();
  });

  it('clears inactive cache, dirty state, and every persisted snapshot', async () => {
    const sourceDoc = new Y.Doc();
    sourceDoc.getText('default').insert(0, 'obsolete');
    yjsDocCache.applyUpdate('blip-replaced', Y.encodeStateAsUpdate(sourceDoc), 'test');
    await yjsDocCache.runExclusive('blip-replaced', () => (
      yjsDocCache.persistCurrentLocked('blip-replaced')
    ));
    vi.mocked(find).mockResolvedValueOnce({ docs: [
      { _id: 'snapshot-a', _rev: '1-a' },
      { _id: 'snapshot-b', _rev: '1-b' },
    ] } as any);

    await yjsDocCache.runExclusive('blip-replaced', () => (
      yjsDocCache.clearForExternalReplacement('blip-replaced')
    ));

    expect(yjsDocCache.getState('blip-replaced')).toBeNull();
    expect(yjsDocCache.getDirtyCount()).toBe(0);
    expect(vi.mocked(deleteDoc).mock.calls).toEqual([
      ['snapshot-a', '1-a'],
      ['snapshot-b', '1-b'],
    ]);
    sourceDoc.destroy();
  });

  it('refuses to clear a document with a live collaboration reference', async () => {
    yjsDocCache.addRef('blip-active');

    await expect(yjsDocCache.runExclusive('blip-active', () => (
      yjsDocCache.clearForExternalReplacement('blip-active')
    ))).rejects.toThrow('collaboration_active');

    expect(yjsDocCache.hasActiveRefs('blip-active')).toBe(true);
    expect(find).not.toHaveBeenCalled();
  });

  it('loadFromDb skips if doc already has data', async () => {
    // Pre-populate the doc
    const doc = yjsDocCache.getOrCreate('blip-skip');
    const text = doc.getText('test');
    text.insert(0, 'existing');

    await yjsDocCache.loadFromDb('blip-skip');

    // findOne should not have been called
    expect(findOne).not.toHaveBeenCalled();
    expect(text.toString()).toBe('existing');
  });

  it('persistDirty inserts new snapshot to CouchDB', async () => {
    vi.mocked(findOne).mockResolvedValue(null);

    const sourceDoc = new Y.Doc();
    sourceDoc.getText('test').insert(0, 'save-me');
    const update = Y.encodeStateAsUpdate(sourceDoc);
    yjsDocCache.applyUpdate('wave1:blip1', update, 'test');

    await yjsDocCache.persistDirty();

    expect(insertDoc).toHaveBeenCalledTimes(1);
    const insertCall = vi.mocked(insertDoc).mock.calls[0][0];
    expect(insertCall['type']).toBe('yjs_snapshot');
    expect(insertCall['blipId']).toBe('wave1:blip1');
    expect(insertCall['waveId']).toBe('wave1');
    expect(typeof insertCall['snapshotB64']).toBe('string');

    sourceDoc.destroy();
  });

  it('persistDirty updates existing snapshot', async () => {
    vi.mocked(findOne).mockResolvedValue({ _id: 'existing-id', _rev: '1-abc', type: 'yjs_snapshot', blipId: 'b1', snapshotB64: '' });

    const sourceDoc = new Y.Doc();
    sourceDoc.getText('test').insert(0, 'update-me');
    yjsDocCache.applyUpdate('b1', Y.encodeStateAsUpdate(sourceDoc), 'test');

    await yjsDocCache.persistDirty();

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(insertDoc).not.toHaveBeenCalled();

    sourceDoc.destroy();
  });

  // --- Reconnection / state vector sync tests ---

  it('simulates reconnection: client catches up via state vector diff', () => {
    // Client A edits
    const clientA = new Y.Doc();
    clientA.getText('default').insert(0, 'hello');
    const updateA = Y.encodeStateAsUpdate(clientA);
    yjsDocCache.applyUpdate('blip-recon', updateA, 'clientA');

    // Client B has stale state (empty doc)
    const clientB = new Y.Doc();
    const clientBSV = Y.encodeStateVector(clientB);

    // Server computes diff for client B
    const diff = yjsDocCache.encodeDiffUpdate('blip-recon', clientBSV);
    expect(diff).not.toBeNull();

    // Client B applies diff → catches up
    Y.applyUpdate(clientB, diff!);
    expect(clientB.getText('default').toString()).toBe('hello');

    clientA.destroy();
    clientB.destroy();
  });

  it('simulates two clients editing concurrently via server cache', () => {
    // Client A writes "Hello"
    const clientA = new Y.Doc();
    clientA.getText('default').insert(0, 'Hello');
    yjsDocCache.applyUpdate('blip-multi', Y.encodeStateAsUpdate(clientA), 'A');

    // Client B writes " World" at the end
    const clientB = new Y.Doc();
    // First sync B from server
    const stateForB = yjsDocCache.getState('blip-multi')!;
    Y.applyUpdate(clientB, stateForB);
    clientB.getText('default').insert(5, ' World');
    yjsDocCache.applyUpdate('blip-multi', Y.encodeStateAsUpdate(clientB), 'B');

    // Server doc should have merged content
    const serverDoc = yjsDocCache.getOrCreate('blip-multi');
    const merged = serverDoc.getText('default').toString();
    expect(merged).toContain('Hello');
    expect(merged).toContain('World');

    clientA.destroy();
    clientB.destroy();
  });

  it('dirty set is cleared after successful persist', async () => {
    vi.mocked(findOne).mockResolvedValue(null);
    vi.mocked(insertDoc).mockResolvedValue({ ok: true, id: 'x', rev: '1' } as any);

    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'data');
    yjsDocCache.applyUpdate('blip-dirty', Y.encodeStateAsUpdate(doc), 'test');

    // First persist should insert
    await yjsDocCache.persistDirty();
    expect(insertDoc).toHaveBeenCalledTimes(1);

    // Second persist should NOT insert again (dirty cleared)
    vi.mocked(insertDoc).mockClear();
    await yjsDocCache.persistDirty();
    expect(insertDoc).not.toHaveBeenCalled();

    doc.destroy();
  });

  it('keeps a document dirty when an update arrives during persistence', async () => {
    vi.mocked(findOne).mockResolvedValue(null);
    let releaseFirstWrite: (() => void) | undefined;
    let firstWriteStarted: (() => void) | undefined;
    const writeStarted = new Promise<void>(resolve => { firstWriteStarted = resolve; });
    vi.mocked(insertDoc)
      .mockImplementationOnce(() => new Promise(resolve => {
        firstWriteStarted?.();
        releaseFirstWrite = () => resolve({ ok: true, id: 'first', rev: '1' });
      }))
      .mockResolvedValueOnce({ ok: true, id: 'second', rev: '2' });

    const firstDoc = new Y.Doc();
    firstDoc.getText('t').insert(0, 'first');
    yjsDocCache.applyUpdate('wave:concurrent', Y.encodeStateAsUpdate(firstDoc), 'first');

    const firstPersist = yjsDocCache.persistDirty();
    await writeStarted;
    const secondDoc = new Y.Doc();
    secondDoc.getText('t').insert(0, 'second');
    yjsDocCache.applyUpdate('wave:concurrent', Y.encodeStateAsUpdate(secondDoc), 'second');
    releaseFirstWrite?.();
    await firstPersist;

    expect(yjsDocCache.getDirtyCount()).toBe(1);
    await yjsDocCache.persistDirty();
    expect(insertDoc).toHaveBeenCalledTimes(2);
    expect(yjsDocCache.getDirtyCount()).toBe(0);

    firstDoc.destroy();
    secondDoc.destroy();
  });

  it('shutdown flushes dirty collaborative state before destroying docs', async () => {
    vi.mocked(findOne).mockResolvedValue(null);
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'last edit before restart');
    yjsDocCache.applyUpdate('wave:shutdown-blip', Y.encodeStateAsUpdate(doc), 'test');

    expect(yjsDocCache.getDirtyCount()).toBe(1);
    await yjsDocCache.shutdown();

    expect(insertDoc).toHaveBeenCalledTimes(1);
    expect(yjsDocCache.getDirtyCount()).toBe(0);
    expect(yjsDocCache.getState('wave:shutdown-blip')).toBeNull();
    doc.destroy();
  });

  it('shutdown fails rather than silently discarding an unpersisted document', async () => {
    vi.mocked(findOne).mockRejectedValue(new Error('CouchDB unavailable'));
    const doc = new Y.Doc();
    doc.getText('t').insert(0, 'must survive');
    yjsDocCache.applyUpdate('wave:failed-shutdown', Y.encodeStateAsUpdate(doc), 'test');

    await expect(yjsDocCache.shutdown()).rejects.toThrow(/Failed to persist 1 dirty/);
    expect(yjsDocCache.getDirtyCount()).toBe(1);
    doc.destroy();
  });

  it('never evicts dirty collaborative state during a prolonged CouchDB outage', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-07-12T10:00:00Z'));
      const doc = new Y.Doc();
      doc.getText('t').insert(0, 'unsaved during outage');
      yjsDocCache.applyUpdate('wave:dirty-outage', Y.encodeStateAsUpdate(doc), 'test');

      vi.setSystemTime(new Date('2026-07-12T10:06:00Z'));
      (yjsDocCache as any).cleanup();

      expect(yjsDocCache.getState('wave:dirty-outage')).not.toBeNull();
      expect(yjsDocCache.getDirtyCount()).toBe(1);
      doc.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('destroy cleans up all docs and intervals', () => {
    yjsDocCache.getOrCreate('blip-a');
    yjsDocCache.getOrCreate('blip-b');
    yjsDocCache.addRef('blip-a');
    yjsDocCache.addRef('blip-b');

    yjsDocCache.destroy();

    // After destroy, getState returns null for all
    expect(yjsDocCache.getState('blip-a')).toBeNull();
    expect(yjsDocCache.getState('blip-b')).toBeNull();
  });
});
