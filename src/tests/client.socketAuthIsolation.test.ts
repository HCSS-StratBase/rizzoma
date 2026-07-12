import * as Y from 'yjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const socketHarness = vi.hoisted(() => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitted: Array<[string, ...unknown[]]> = [];
  const sendBuffer: unknown[] = [];
  const receiveBuffer: unknown[] = [];

  const trigger = (event: string, ...args: unknown[]) => {
    for (const handler of handlers.get(event) ?? []) handler(...args);
  };

  const fake = {
    connected: true,
    id: 'socket-a',
    sendBuffer,
    receiveBuffer,
    connectCalls: 0,
    disconnectCalls: 0,
    on(event: string, handler: (...args: unknown[]) => void) {
      const eventHandlers = handlers.get(event) ?? new Set();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
      return fake;
    },
    off(event: string, handler?: (...args: unknown[]) => void) {
      if (handler) handlers.get(event)?.delete(handler);
      else handlers.delete(event);
      return fake;
    },
    emit(event: string, ...args: unknown[]) {
      if (!fake.connected) {
        sendBuffer.push([event, ...args]);
        return fake;
      }
      emitted.push([event, ...args]);
      return fake;
    },
    disconnect() {
      fake.disconnectCalls += 1;
      if (fake.connected) {
        fake.connected = false;
        trigger('disconnect', 'io client disconnect');
      }
      return fake;
    },
    connect() {
      fake.connectCalls += 1;
      if (!fake.connected) {
        fake.connected = true;
        fake.id = 'socket-b';
        trigger('connect');
        for (const packet of sendBuffer.splice(0)) {
          if (Array.isArray(packet)) emitted.push(packet as [string, ...unknown[]]);
        }
      }
      return fake;
    },
  };

  return {
    fake,
    emitted,
    trigger,
    io: vi.fn(() => fake),
  };
});

vi.mock('socket.io-client', () => ({ io: socketHarness.io }));

import { SocketIOProvider } from '../client/components/editor/CollaborativeProvider';
import {
  disconnectSocketForAuthTransition,
  getSocket,
  reconnectSocketAfterAuthTransition,
  subscribeEditorPresence,
} from '../client/lib/socket';

describe('client: Socket.IO auth isolation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('disconnects A, drops A packets/subscriptions, and reconnects only B after logout or account switch', async () => {
    const socket = getSocket();
    const aliceDoc = new Y.Doc();
    const alice = new SocketIOProvider(
      aliceDoc,
      socket,
      'shared-blip',
      { id: 'alice', name: 'Alice', color: '#111111' },
    );
    const aliceJoin = socketHarness.emitted.find(([event]) => event === 'blip:join');
    const acknowledgeAlice = aliceJoin?.[2] as ((result: Record<string, unknown>) => void) | undefined;
    acknowledgeAlice?.({
      ok: true,
      waveId: 'wave-1',
      canEdit: true,
      yjsGeneration: 0,
      user: { id: 'alice', name: 'Alice', color: '#111111' },
    });
    socketHarness.trigger('blip:sync:shared-blip', {
      state: [],
      shouldSeed: false,
      yjsGeneration: 0,
      user: { id: 'alice' },
    });
    aliceDoc.getText('default').insert(0, 'A live');
    expect(socketHarness.emitted.some(([event]) => event === 'blip:update')).toBe(true);

    socketHarness.emitted.splice(0);
    socketHarness.fake.sendBuffer.push(['blip:update', { blipId: 'shared-blip', owner: 'alice' }]);
    socketHarness.fake.receiveBuffer.push(['blip:update:shared-blip', { owner: 'alice' }]);

    disconnectSocketForAuthTransition();
    expect(socketHarness.fake.connected).toBe(false);
    expect(socketHarness.fake.sendBuffer).toHaveLength(0);
    expect(socketHarness.fake.receiveBuffer).toHaveLength(0);

    // The disconnected A provider holds the edit in A's document and cannot
    // enqueue a write for delivery under the next account.
    aliceDoc.getText('default').insert(aliceDoc.getText('default').length, ' unresolved');
    alice.destroy();
    expect(socketHarness.fake.sendBuffer).toHaveLength(0);

    const bobDoc = new Y.Doc();
    const bob = new SocketIOProvider(
      bobDoc,
      socket,
      'shared-blip',
      { id: 'bob', name: 'Bob', color: '#222222' },
    );
    reconnectSocketAfterAuthTransition();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(socketHarness.fake.disconnectCalls).toBe(1);
    expect(socketHarness.fake.connectCalls).toBe(1);
    expect(socketHarness.emitted.map(([event]) => event)).toEqual(['blip:join']);
    expect(socketHarness.fake.sendBuffer).toHaveLength(0);

    const bobJoin = socketHarness.emitted.find(([event]) => event === 'blip:join');
    const acknowledgeBob = bobJoin?.[2] as ((result: Record<string, unknown>) => void) | undefined;
    acknowledgeBob?.({
      ok: true,
      waveId: 'wave-1',
      canEdit: true,
      yjsGeneration: 0,
      user: { id: 'bob', name: 'Bob', color: '#222222' },
    });

    socketHarness.trigger('blip:sync:shared-blip', {
      state: [],
      shouldSeed: false,
      yjsGeneration: 0,
      user: { id: 'bob' },
    });
    bobDoc.getText('default').insert(0, 'B live');
    expect(socketHarness.emitted.filter(([event]) => event === 'blip:update')).toHaveLength(1);

    bob.destroy();
    aliceDoc.destroy();
    bobDoc.destroy();
  });

  it('drops an in-flight A presence lookup instead of emitting it after B reconnects', async () => {
    socketHarness.emitted.splice(0);
    socketHarness.fake.sendBuffer.splice(0);
    socketHarness.fake.receiveBuffer.splice(0);
    let resolveAlice!: (response: Response) => void;
    const aliceResponse = new Promise<Response>((resolve) => {
      resolveAlice = resolve;
    });
    const fetchMock = vi.fn()
      .mockReturnValueOnce(aliceResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'bob', name: 'Bob' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const unsubscribe = subscribeEditorPresence('wave-1', 'blip-1', () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    disconnectSocketForAuthTransition();
    reconnectSocketAfterAuthTransition();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveAlice(new Response(JSON.stringify({ id: 'alice', name: 'Alice' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    await Promise.resolve();
    await Promise.resolve();

    const presenceJoins = socketHarness.emitted
      .filter(([event]) => event === 'editor:join')
      .map(([, payload]) => payload as { userId?: string; name?: string });
    expect(presenceJoins).toEqual([expect.objectContaining({ userId: 'bob', name: 'Bob' })]);

    unsubscribe();
  });
});
