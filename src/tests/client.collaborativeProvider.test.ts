import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { SocketIOProvider } from '../client/components/editor/CollaborativeProvider';

/** Create a minimal mock socket that mimics Socket.IO client behavior */
function createMockSocket(connected = true) {
  const handlers = new Map<string, Set<Function>>();
  const socket = {
    connected,
    on(event: string, handler: Function) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off(event: string, handler?: Function) {
      if (handler) {
        handlers.get(event)?.delete(handler);
      } else {
        handlers.delete(event);
      }
    },
    emit: vi.fn(),
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
    doc = new Y.Doc();
    socket = createMockSocket(true);
  });

  afterEach(() => {
    doc.destroy();
  });

  it('joins room on construction when socket is connected', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-1');
    expect(socket.emit).toHaveBeenCalledWith('blip:join', { blipId: 'blip-1' });
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

    provider.setUser({ id: 'u1', name: 'Alice', color: '#ff0000' });

    const localState = provider.awareness.getLocalState();
    expect(localState?.user).toEqual({ id: 'u1', name: 'Alice', color: '#ff0000' });

    provider.destroy();
  });

  it('destroy cleans up listeners and leaves room', () => {
    const provider = new SocketIOProvider(doc, socket as any, 'blip-9');
    provider.destroy();

    const leaveCalls = socket.emit.mock.calls.filter(([ev]: any) => ev === 'blip:leave');
    expect(leaveCalls).toHaveLength(1);
    expect(leaveCalls[0][1]).toEqual({ blipId: 'blip-9' });
  });
});
