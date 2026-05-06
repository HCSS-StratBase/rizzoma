/**
 * Awareness tests — presence + cursor sharing across simulated clients.
 *
 * Phase 3 (#54). No jsdom needed — pure CRDT + Awareness.
 */
import { describe, expect, it, vi } from 'vitest';
import { applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { TopicAwareness, colorForUserId, type ParticipantState } from '../awareness';
import { TopicDoc } from '../yjs-binding';

/** Wire two awareness instances bidirectionally (simulates WebSocket relay). */
const wireAwareness = (a: TopicAwareness, b: TopicAwareness) => {
  const relay = (from: TopicAwareness, to: TopicAwareness) => (changes: any) => {
    const changed = [...(changes.added || []), ...(changes.updated || []), ...(changes.removed || [])];
    if (!changed.length) return;
    const update = encodeAwarenessUpdate(from.awareness, changed);
    applyAwarenessUpdate(to.awareness, update, 'remote');
  };
  a.awareness.on('update', relay(a, b));
  b.awareness.on('update', relay(b, a));
};

describe('colorForUserId', () => {
  it('returns same color for same id', () => {
    expect(colorForUserId('user-1')).toBe(colorForUserId('user-1'));
  });
  it('different ids generally yield different colors', () => {
    const colors = new Set();
    for (let i = 0; i < 20; i++) colors.add(colorForUserId('u' + i));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('TopicAwareness — single client', () => {
  it('setUser sets the local user identity', () => {
    const td = new TopicDoc();
    const aw = new TopicAwareness(td);
    aw.setUser({ id: 'u1', name: 'Alice', color: '#4caf50' });
    const me = aw.getParticipants().get(aw.clientId);
    expect(me?.user.name).toBe('Alice');
    aw.destroy();
  });

  it('setCursor / getParticipantsInBlip', () => {
    const td = new TopicDoc();
    const aw = new TopicAwareness(td);
    aw.setUser({ id: 'u1', name: 'A', color: '#000' });
    aw.setCursor({ blipId: 'blip-1', anchor: 5, head: 5 });
    const inBlip = aw.getParticipantsInBlip('blip-1');
    expect(inBlip.length).toBe(1);
    expect(inBlip[0].cursor?.anchor).toBe(5);
    expect(aw.getParticipantsInBlip('blip-2').length).toBe(0);
    aw.destroy();
  });

  it('setCursor(null) clears the cursor', () => {
    const td = new TopicDoc();
    const aw = new TopicAwareness(td);
    aw.setUser({ id: 'u1', name: 'A', color: '#000' });
    aw.setCursor({ blipId: 'b', anchor: 1, head: 1 });
    aw.setCursor(null);
    const me = aw.getParticipants().get(aw.clientId);
    expect(me?.cursor).toBeNull();
    aw.destroy();
  });

  it('on() listener fires immediately with current state and on update', () => {
    const td = new TopicDoc();
    const aw = new TopicAwareness(td);
    const seen: number[] = [];
    aw.on((states) => seen.push(states.size));
    aw.setUser({ id: 'u1', name: 'A', color: '#000' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
    aw.destroy();
  });
});

describe('TopicAwareness — two simulated clients (cross-tab)', () => {
  it('alice sees bob and vice versa', () => {
    const ta = new TopicAwareness(new TopicDoc());
    const tb = new TopicAwareness(new TopicDoc());
    wireAwareness(ta, tb);
    ta.setUser({ id: 'alice', name: 'Alice', color: '#0a0' });
    tb.setUser({ id: 'bob', name: 'Bob', color: '#00a' });

    const aliceSees = Array.from(ta.getParticipants().values()).map(p => p.user.name).sort();
    const bobSees = Array.from(tb.getParticipants().values()).map(p => p.user.name).sort();
    expect(aliceSees).toEqual(['Alice', 'Bob']);
    expect(bobSees).toEqual(['Alice', 'Bob']);

    ta.destroy(); tb.destroy();
  });

  it('cursor updates propagate across', () => {
    const ta = new TopicAwareness(new TopicDoc());
    const tb = new TopicAwareness(new TopicDoc());
    wireAwareness(ta, tb);
    ta.setUser({ id: 'a', name: 'A', color: '#0a0' });
    tb.setUser({ id: 'b', name: 'B', color: '#00a' });

    ta.setCursor({ blipId: 'blip-99', anchor: 10, head: 14 });

    const remoteA = tb.getParticipantsInBlip('blip-99');
    expect(remoteA.length).toBe(1);
    expect(remoteA[0].user.name).toBe('A');
    expect(remoteA[0].cursor?.head).toBe(14);

    ta.destroy(); tb.destroy();
  });

  it('listener fires when a remote participant joins', () => {
    const ta = new TopicAwareness(new TopicDoc());
    const tb = new TopicAwareness(new TopicDoc());
    wireAwareness(ta, tb);
    ta.setUser({ id: 'a', name: 'A', color: '#0a0' });

    const fn = vi.fn();
    ta.on(fn);
    const callsBefore = fn.mock.calls.length;
    tb.setUser({ id: 'b', name: 'B', color: '#00a' });
    expect(fn.mock.calls.length).toBeGreaterThan(callsBefore);
    // Last call's snapshot has both participants
    const lastSnapshot: ReadonlyMap<number, ParticipantState> = fn.mock.calls[fn.mock.calls.length - 1][0];
    expect(lastSnapshot.size).toBe(2);

    ta.destroy(); tb.destroy();
  });
});
