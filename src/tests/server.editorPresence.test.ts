import { describe, it, expect, vi, afterEach } from 'vitest';
import { EditorPresenceManager } from '../server/lib/editorPresence';

describe('server: EditorPresenceManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces join and leave presence emits', () => {
    vi.useFakeTimers();
    const events: Array<{ count: number; users: Array<{ userId?: string }> }> = [];
    const manager = new EditorPresenceManager(
      (payload) => events.push({ count: payload.count, users: payload.users }),
      { ttlMs: 1000, debounceMs: 50, cleanupIntervalMs: 250 },
    );
    const room = { room: 'ed:wave:w1', waveId: 'w1' };

    manager.joinRooms('sock-1', [room], { userId: 'u1', name: 'Alpha' });
    manager.joinRooms('sock-2', [room], { userId: 'u2' });
    expect(events).toHaveLength(0);
    vi.advanceTimersByTime(49);
    expect(events).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.count).toBe(2);
    expect(events[0]?.users.map((u) => u.userId)).toEqual(['u1', 'u2']);

    events.length = 0;
    manager.leaveRooms('sock-1', [room]);
    vi.advanceTimersByTime(50);
    expect(events).toHaveLength(1);
    expect(events[0]?.count).toBe(1);
    expect(events[0]?.users.map((u) => u.userId)).toEqual(['u2']);
  });

  it('expires stale presence entries after ttl', () => {
    vi.useFakeTimers();
    const events: Array<{ count: number }> = [];
    const manager = new EditorPresenceManager(
      (payload) => events.push({ count: payload.count }),
      { ttlMs: 100, debounceMs: 10, cleanupIntervalMs: 20 },
    );
    const room = { room: 'ed:wave:w-exp', waveId: 'w-exp' };

    manager.joinRooms('sock-exp', [room], { userId: 'ux' });
    vi.advanceTimersByTime(10);
    expect(events.at(-1)?.count).toBe(1);

    events.length = 0;
    vi.advanceTimersByTime(120);
    manager.pruneExpired();
    vi.advanceTimersByTime(10);
    expect(events).toHaveLength(1);
    expect(events[0]?.count).toBe(0);
  });

  it('heartbeat extends ttl to avoid premature expiry', () => {
    vi.useFakeTimers();
    const events: Array<{ count: number }> = [];
    const manager = new EditorPresenceManager(
      (payload) => events.push({ count: payload.count }),
      { ttlMs: 100, debounceMs: 10, cleanupIntervalMs: 20 },
    );
    const room = { room: 'ed:wave:w-heart', waveId: 'w-heart' };

    manager.joinRooms('sock-heart', [room], { userId: 'u-heart' });
    vi.advanceTimersByTime(10);
    expect(events.at(-1)?.count).toBe(1);

    events.length = 0;
    vi.advanceTimersByTime(80);
    manager.heartbeat('sock-heart');
    vi.advanceTimersByTime(90);
    manager.pruneExpired();
    vi.advanceTimersByTime(10);
    expect(events).toHaveLength(0);
  });
});
