import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { SocketIOProvider } from '../client/components/editor/CollaborativeProvider';
import { collaborationUserFromAuth } from '../client/components/editor/collaborationIdentity';
import {
  getPendingCollaborationCount,
  resetPendingCollaborationChanges,
} from '../client/lib/collaborationPending';

/** Create a minimal mock socket that mimics Socket.IO client behavior */
function createMockSocket(connected = true, autoAcknowledge = true) {
  type SocketHandler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<SocketHandler>>();
  const socket = {
    connected,
    on(event: string, handler: SocketHandler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler?: SocketHandler) {
      if (handler) {
        handlers.get(event)?.delete(handler);
      } else {
        handlers.delete(event);
      }
    },
    emit: vi.fn((...args: any[]) => {
      const [event, , acknowledge] = args as [string, unknown, ((result: { ok: boolean }) => void) | undefined];
      if (event === 'blip:update' && autoAcknowledge) acknowledge?.({ ok: true });
    }),
    // Test helper: simulate server sending an event to this client
    _receive(event: string, data: any) {
      handlers.get(event)?.forEach(fn => fn(data));
    },
  };
  return socket;
}

describe('client: CollaborativeProvider', () => {
  let doc: Y.Doc;
  let socket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    resetPendingCollaborationChanges();
    doc = new Y.Doc();
    socket = createMockSocket(true);
  });

  afterEach(() => {
    resetPendingCollaborationChanges();
    doc.destroy();
  });

  it('joins room on construction when socket is connected', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-1');
    expect(socket.emit).toHaveBeenCalledWith('blip:join', { blipId: 'blip-1' });
    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update')).toHaveLength(0);
    provider.destroy();
  });

  it('does not join room if socket is disconnected on construction', () => {
    socket.connected = false;
    const provider = new SocketIOProvider(doc, socket as any, 'blip-2');
    // Neither room join nor awareness may be emitted while disconnected.
    const joinCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:join');
    const awarenessCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'awareness:update');
    expect(joinCalls).toHaveLength(0);
    expect(awarenessCalls).toHaveLength(0);
    provider.destroy();
  });

  it('sends local Y.Doc updates to server', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-3');
    socket._receive('blip:sync:blip-3', { state: [] });
    socket.emit.mockClear();

    doc.getText('default').insert(0, 'Hello');

    const updateCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:update');
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0][1].blipId).toBe('blip-3');
    expect(Array.isArray(updateCalls[0][1].update)).toBe(true);

    provider.destroy();
  });

  it('applies remote updates from server', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-4');

    // Create a remote update
    const remoteDoc = new Y.Doc();
    remoteDoc.getText('default').insert(0, 'Remote text');
    const update = Y.encodeStateAsUpdate(remoteDoc);

    // Simulate server sending this update
    socket._receive(`blip:update:blip-4`, { update: Array.from(update) });

    expect(doc.getText('default').toString()).toBe('Remote text');

    remoteDoc.destroy();
    provider.destroy();
  });

  it('does not echo remote updates back to server (origin guard)', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-5');
    socket.emit.mockClear();

    // Simulate a remote update
    const remoteDoc = new Y.Doc();
    remoteDoc.getText('default').insert(0, 'from server');
    const update = Y.encodeStateAsUpdate(remoteDoc);
    socket._receive(`blip:update:blip-5`, { update: Array.from(update) });

    // Should NOT have emitted blip:update (origin check prevents echo)
    const updateCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:update');
    expect(updateCalls).toHaveLength(0);

    remoteDoc.destroy();
    provider.destroy();
  });

  it('fires onSynced callback after server sync response', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-6');
    const syncCb = vi.fn();
    provider.onSynced(syncCb);

    expect(syncCb).not.toHaveBeenCalled();
    expect(provider.synced).toBe(false);

    // Simulate server sync response (empty state = no prior data)
    socket._receive(`blip:sync:blip-6`, { state: [] });

    expect(syncCb).toHaveBeenCalledTimes(1);
    expect(provider.synced).toBe(true);

    // Calling onSynced after already synced fires immediately
    const lateCb = vi.fn();
    provider.onSynced(lateCb);
    expect(lateCb).toHaveBeenCalledTimes(1);

    provider.destroy();
  });

  it('tracks whether the server granted seed authority', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-seed');

    socket._receive('blip:sync:blip-seed', { state: [], shouldSeed: true });
    expect(provider.synced).toBe(true);
    expect(provider.shouldSeed).toBe(true);

    socket._receive('blip:sync:blip-seed', { state: [], shouldSeed: false });
    expect(provider.shouldSeed).toBe(false);

    provider.destroy();
  });

  it('reconnects by waiting for authorized sync before document or awareness writes', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-7');

    // Complete the initial authorized join, then start from a clean call log.
    socket._receive('blip:sync:blip-7', { state: [], shouldSeed: true });

    // Disconnect closes the room gate before local/offline edits occur.
    socket._receive('disconnect', 'transport close');
    socket.emit.mockClear();
    doc.getText('default').insert(0, 'local data');
    expect(socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:update')).toHaveLength(0);
    socket.emit.mockClear();

    // Simulate reconnection
    socket._receive('connect', undefined);

    const joinCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:join');
    const syncCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:sync:request');
    const awarenessCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'awareness:update');
    expect(joinCalls).toHaveLength(1);
    expect(syncCalls).toHaveLength(0);
    expect(awarenessCalls).toHaveLength(0);

    // The server emits sync only after its async authorization and room join.
    // That event is the admission acknowledgement which releases buffered
    // local state and the named awareness announcement in this order.
    socket._receive('blip:sync:blip-7', { state: [], shouldSeed: false });
    const postSyncUpdates = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:update');
    const postSyncAwareness = socket.emit.mock.calls.filter(([ev]: any) => ev === 'awareness:update');
    expect(postSyncUpdates).toHaveLength(1);
    expect(postSyncUpdates[0][1].blipId).toBe('blip-7');
    expect(postSyncAwareness).toHaveLength(1);
    expect(postSyncAwareness[0][1].blipId).toBe('blip-7');
    expect(Array.isArray(postSyncAwareness[0][1].update)).toBe(true);
    expect(socket.emit.mock.calls.findIndex(([ev]: any) => ev === 'blip:join'))
      .toBeLessThan(socket.emit.mock.calls.findIndex(([ev]: any) => ev === 'blip:update'));
    expect(socket.emit.mock.calls.findIndex(([ev]: any) => ev === 'blip:update'))
      .toBeLessThan(socket.emit.mock.calls.findIndex(([ev]: any) => ev === 'awareness:update'));

    provider.destroy();
  });

  it('retains an offline Yjs edit until the reconnect diff is acknowledged', () => {
    socket = createMockSocket(true, false);
    const provider = new SocketIOProvider(doc, socket as any, 'blip-offline-pending');
    socket._receive('blip:sync:blip-offline-pending', { state: [], shouldSeed: true });
    socket._receive('disconnect', 'transport close');

    doc.getText('default').insert(0, 'held in memory');
    expect(getPendingCollaborationCount()).toBe(1);

    socket._receive('connect', undefined);
    socket._receive('blip:sync:blip-offline-pending', { state: [], shouldSeed: false });
    const updateCall = socket.emit.mock.calls.find(([event]: any) => event === 'blip:update');
    expect(updateCall).toBeTruthy();
    expect(getPendingCollaborationCount()).toBe(1);

    const acknowledge = updateCall?.[2] as ((result: { ok: boolean }) => void) | undefined;
    acknowledge?.({ ok: true });
    expect(getPendingCollaborationCount()).toBe(0);
    provider.destroy();
  });

  it('refuses to release an A-owned document when the server session is B', () => {
    const alice = collaborationUserFromAuth({ id: 'alice', name: 'Alice' });
    const provider = new SocketIOProvider(doc, socket as any, 'cross-tab-blip', alice);
    const mismatch = vi.fn();
    window.addEventListener('rizzoma:auth-session-mismatch', mismatch);
    doc.getText('default').insert(0, 'A pending');
    expect(getPendingCollaborationCount()).toBe(1);

    socket._receive('blip:sync:cross-tab-blip', {
      state: [],
      shouldSeed: false,
      user: { id: 'bob' },
    });

    expect(provider.synced).toBe(false);
    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'blip:update')).toHaveLength(0);
    expect(socket.emit).toHaveBeenCalledWith('blip:leave', { blipId: 'cross-tab-blip' });
    expect(mismatch).toHaveBeenCalledTimes(1);
    expect(getPendingCollaborationCount()).toBe(1);
    window.removeEventListener('rizzoma:auth-session-mismatch', mismatch);
    provider.destroy();
  });

  it('setUser updates awareness state', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-8');
    socket._receive('blip:sync:blip-8', { state: [] });
    socket.emit.mockClear();

    provider.setUser({ id: 'u1', name: 'Alice', color: '#ff0000' });

    const localState = provider.awareness.getLocalState();
    expect(localState?.['user']).toEqual({ id: 'u1', name: 'Alice', color: '#ff0000' });
    const awarenessCalls = socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update');
    expect(awarenessCalls).toHaveLength(1);
    expect(Array.isArray(awarenessCalls[0][1].update)).toBe(true);

    provider.destroy();
  });

  it('uses Anonymous rather than a numbered-user identity without auth', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-anonymous');
    expect(provider.getUser().name).toBe('Anonymous');
    expect(provider.getUser().name).not.toMatch(/^User \d+$/);
    provider.destroy();
  });

  it('does not re-emit an unchanged authenticated identity', () => {
    const alice = collaborationUserFromAuth({
      id: 'alice-id',
      email: 'alice@example.com',
      name: 'Alice',
    });
    const provider = new SocketIOProvider(doc, socket as any, 'blip-idempotent', alice);
    socket.emit.mockClear();

    provider.setUser({ ...alice });

    const awarenessCalls = socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update');
    expect(awarenessCalls).toHaveLength(0);
    provider.destroy();
  });

  it('shares two authenticated names without a numbered-user fallback', () => {
    const aliceDoc = new Y.Doc();
    const bobDoc = new Y.Doc();
    const aliceSocket = createMockSocket(true);
    const bobSocket = createMockSocket(true);
    const alice = collaborationUserFromAuth({
      id: 'alice-id',
      email: 'alice@example.com',
      name: 'Alice Example',
    });
    const bob = collaborationUserFromAuth({
      id: 'bob-id',
      email: 'bob@example.com',
      name: 'Bob Example',
    });
    const aliceProvider = new SocketIOProvider(aliceDoc, aliceSocket as any, 'shared-names', alice);
    const bobProvider = new SocketIOProvider(bobDoc, bobSocket as any, 'shared-names', bob);

    const aliceUpdate = encodeAwarenessUpdate(
      aliceProvider.awareness,
      [aliceProvider.awareness.clientID],
    );
    const bobUpdate = encodeAwarenessUpdate(
      bobProvider.awareness,
      [bobProvider.awareness.clientID],
    );
    bobSocket._receive('awareness:update:shared-names', { update: Array.from(aliceUpdate) });
    aliceSocket._receive('awareness:update:shared-names', { update: Array.from(bobUpdate) });

    const aliceView = Array.from(aliceProvider.awareness.getStates().values())
      .map((state: any) => state.user?.name)
      .filter(Boolean)
      .sort();
    const bobView = Array.from(bobProvider.awareness.getStates().values())
      .map((state: any) => state.user?.name)
      .filter(Boolean)
      .sort();

    expect(aliceView).toEqual(['Alice Example', 'Bob Example']);
    expect(bobView).toEqual(['Alice Example', 'Bob Example']);
    expect([...aliceView, ...bobView].every(name => !/^User \d+$/.test(name))).toBe(true);

    aliceProvider.destroy();
    bobProvider.destroy();
    aliceDoc.destroy();
    bobDoc.destroy();
  });

  it('applies clocked remote awareness without echoing it', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-awareness');
    socket.emit.mockClear();

    const remoteDoc = new Y.Doc();
    const remoteAwareness = new Awareness(remoteDoc);
    remoteAwareness.setLocalStateField('user', { id: 'remote', name: 'Remote', color: '#123456' });
    const update = encodeAwarenessUpdate(remoteAwareness, [remoteAwareness.clientID]);

    socket._receive('awareness:update:blip-awareness', { update: Array.from(update) });

    expect(provider.awareness.getStates().get(remoteAwareness.clientID)?.['user']).toEqual({
      id: 'remote', name: 'Remote', color: '#123456'
    });
    const echoed = socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update');
    expect(echoed).toHaveLength(0);

    remoteAwareness.destroy();
    remoteDoc.destroy();
    provider.destroy();
  });

  it('keeps legacy raw awareness removable during a rolling deploy', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-legacy-awareness');
    socket.emit.mockClear();
    const remoteClientId = (doc.clientID + 1) >>> 0;

    socket._receive('awareness:update:blip-legacy-awareness', {
      states: { [remoteClientId]: { user: { id: 'legacy', name: 'Legacy', color: '#abcdef' } } },
    });

    expect(provider.awareness.getStates().get(remoteClientId)?.['user']).toEqual({
      id: 'legacy', name: 'Legacy', color: '#abcdef'
    });
    expect(provider.awareness.meta.get(remoteClientId)?.clock).toBe(0);
    expect(Number.isFinite(provider.awareness.meta.get(remoteClientId)?.lastUpdated)).toBe(true);
    const echoed = socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update');
    expect(echoed).toHaveLength(0);

    provider.destroy();
  });

  it('destroy broadcasts awareness removal, cleans up listeners, and leaves room', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-9');
    const remoteDoc = new Y.Doc();
    const remoteAwareness = new Awareness(remoteDoc);
    socket._receive('blip:sync:blip-9', { state: [] });
    const initialCall = socket.emit.mock.calls
      .filter(([event]: any) => event === 'awareness:update')
      .at(-1);
    applyAwarenessUpdate(
      remoteAwareness,
      new Uint8Array(initialCall![1].update),
      'test-initial',
    );
    expect(remoteAwareness.getStates().has(provider.awareness.clientID)).toBe(true);
    socket.emit.mockClear();

    provider.destroy();

    const leaveCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:leave');
    const awarenessCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'awareness:update');
    expect(leaveCalls).toHaveLength(1);
    expect(leaveCalls[0][1]).toEqual({ blipId: 'blip-9' });
    expect(awarenessCalls).toHaveLength(1);
    applyAwarenessUpdate(
      remoteAwareness,
      new Uint8Array(awarenessCalls[0][1].update),
      'test-removal',
    );
    expect(remoteAwareness.getStates().has(provider.awareness.clientID)).toBe(false);

    socket.emit.mockClear();
    socket._receive('connect', undefined);
    expect(socket.emit).not.toHaveBeenCalled();
    remoteAwareness.destroy();
    remoteDoc.destroy();
  });

  it('destroy removes the Y.Doc update listener', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-cleanup');
    provider.destroy();
    socket.emit.mockClear();

    doc.getText('default').insert(0, 'after destroy');

    const updateCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:update');
    expect(updateCalls).toHaveLength(0);
  });

  it('destroy removes only its own socket listeners', () => {
    const secondDoc = new Y.Doc();
    const first = new SocketIOProvider(doc, socket as any, 'shared-blip');
    const second = new SocketIOProvider(secondDoc, socket as any, 'shared-blip');
    first.destroy();

    const remoteDoc = new Y.Doc();
    remoteDoc.getText('default').insert(0, 'still subscribed');
    const update = Y.encodeStateAsUpdate(remoteDoc);
    socket._receive('blip:update:shared-blip', { update: Array.from(update) });

    expect(secondDoc.getText('default').toString()).toBe('still subscribed');

    remoteDoc.destroy();
    second.destroy();
    secondDoc.destroy();
  });
});
