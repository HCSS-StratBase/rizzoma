import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';

// Mock couch module before importing yjsDocCache
vi.mock('../server/lib/couch.js', () => ({
  findOne: vi.fn().mockResolvedValue(null),
  find: vi.fn().mockResolvedValue({ docs: [] }),
  insertDoc: vi.fn().mockResolvedValue({ ok: true, id: 'mock', rev: '1' }),
  updateDoc: vi.fn().mockResolvedValue({ ok: true, id: 'mock', rev: '2' }),
}));

// Import after mock setup
import { yjsDocCache } from '../server/lib/yjsDocCache';
import { findOne, insertDoc, updateDoc } from '../server/lib/couch';

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
});
