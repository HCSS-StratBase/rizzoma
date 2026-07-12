import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { SocketIOProvider } from '../client/components/editor/CollaborativeProvider';

/** Create a minimal mock socket that mimics Socket.IO client behavior */
function createMockSocket(connected = true, autoJoinAck = true) {
  type SocketHandler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<SocketHandler>>();
  const pendingJoinAcks: Array<(result: any) => void> = [];
  const emit = vi.fn((event: string, ...args: any[]) => {
    const callback = args.at(-1);
    if (event === 'blip:join' && typeof callback === 'function') {
      if (autoJoinAck) {
        callback({
          ok: true,
          waveId: 'wave-1',
          canEdit: true,
          user: { id: 'user-1', name: 'User One', color: '#123456' },
        });
      } else {
        pendingJoinAcks.push(callback);
      }
    }
    if (event === 'blip:update' && typeof callback === 'function') callback({ ok: true });
  });
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
    emit,
    // Test helper: simulate server sending an event to this client
    _receive(event: string, data: any) {
      handlers.get(event)?.forEach(fn => fn(data));
    },
    _ackNextJoin(result: any) {
      const ack = pendingJoinAcks.shift();
      if (!ack) throw new Error('No pending blip:join acknowledgement');
      ack(result);
    },
  };
  return socket;
}

describe('client: CollaborativeProvider', () => {
  let doc: Y.Doc;
  let socket: ReturnType<typeof createMockSocket>;

  beforeEach(() => {
    doc = new Y.Doc();
    socket = createMockSocket(true);
  });

  afterEach(() => {
    doc.destroy();
  });

  it('joins room on construction when socket is connected', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-1');
    expect(socket.emit.mock.calls.some(([event, payload]) => (
      event === 'blip:join' && payload.blipId === 'blip-1'
    ))).toBe(true);
    provider.destroy();
  });

  it('does not join room if socket is disconnected on construction', () => {
    socket.connected = false;
    const provider = new SocketIOProvider(doc, socket as any, 'blip-2');
    // Only the awareness setup emits, not blip:join
    const joinCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:join');
    expect(joinCalls).toHaveLength(0);
    provider.destroy();
  });

  it('sends local Y.Doc updates to server', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-3');
    socket.emit.mockClear();

    doc.getText('default').insert(0, 'Hello');

    const updateCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:update');
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    expect(updateCalls[0][1].blipId).toBe('blip-3');
    expect(Array.isArray(updateCalls[0][1].update)).toBe(true);

    provider.destroy();
  });

  it('holds document, awareness, and diff traffic until join authorization succeeds', () => {
    socket = createMockSocket(true, false);
    const provider = new SocketIOProvider(doc, socket as any, 'blip-delayed');
    socket.emit.mockClear();

    doc.getText('default').insert(0, 'edited while authorization is pending');
    provider.setUser({ id: 'local-user', name: 'Local User', color: '#abcdef' });

    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'blip:update')).toHaveLength(0);
    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update')).toHaveLength(0);
    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'blip:sync:request')).toHaveLength(0);

    socket._ackNextJoin({
      ok: true,
      waveId: 'wave-1',
      canEdit: true,
      user: { id: 'server-user', name: 'Server User', color: '#123456' },
    });

    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'blip:update')).toHaveLength(1);
    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update')).toHaveLength(1);
    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'blip:sync:request')).toHaveLength(1);
    expect(provider.awareness.getLocalState()?.['user']).toEqual({
      id: 'server-user', name: 'Server User', color: '#123456',
    });

    provider.destroy();
  });

  it('keeps collaboration paused and reports a denied join', () => {
    socket = createMockSocket(true, false);
    const toast = vi.fn();
    window.addEventListener('toast', toast);
    const provider = new SocketIOProvider(doc, socket as any, 'blip-denied');
    socket.emit.mockClear();
    doc.getText('default').insert(0, 'must not leave this client');

    socket._ackNextJoin({ ok: false, error: 'unauthenticated' });

    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'blip:update')).toHaveLength(0);
    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update')).toHaveLength(0);
    expect(socket.emit.mock.calls.filter(([event]: any) => event === 'blip:sync:request')).toHaveLength(0);
    expect(toast).toHaveBeenCalledTimes(1);

    window.removeEventListener('toast', toast);
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

  it('reconnects by re-joining and sending state vector', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-7');

    // Insert local data so state vector is non-trivial
    doc.getText('default').insert(0, 'local data');
    socket.emit.mockClear();

    // Simulate reconnection
    socket._receive('connect', undefined);

    const joinCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:join');
    const syncCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:sync:request');
    expect(joinCalls).toHaveLength(1);
    expect(syncCalls).toHaveLength(1);
    expect(syncCalls[0][1].blipId).toBe('blip-7');
    expect(Array.isArray(syncCalls[0][1].stateVector)).toBe(true);

    provider.destroy();
  });

  it('setUser updates awareness state', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-8');
    socket.emit.mockClear();

    provider.setUser({ id: 'u1', name: 'Alice', color: '#ff0000' });

    const localState = provider.awareness.getLocalState();
    expect(localState?.['user']).toEqual({ id: 'u1', name: 'Alice', color: '#ff0000' });
    const awarenessCalls = socket.emit.mock.calls.filter(([event]: any) => event === 'awareness:update');
    expect(awarenessCalls).toHaveLength(1);
    expect(Array.isArray(awarenessCalls[0][1].update)).toBe(true);

    provider.destroy();
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

  it('destroy cleans up listeners and leaves room', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-9');
    provider.destroy();

    const leaveCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:leave');
    expect(leaveCalls).toHaveLength(1);
    expect(leaveCalls[0][1]).toEqual({ blipId: 'blip-9' });
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
