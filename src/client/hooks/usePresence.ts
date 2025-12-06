import { useEffect, useState } from 'react';
import { subscribeEditorPresence } from '../lib/socket';

export type PresenceStatus = 'loading' | 'ready' | 'error';
export type PresenceUser = { userId?: string; name?: string };

export function usePresence(waveId: string, blipId?: string) {
  const [status, setStatus] = useState<PresenceStatus>('loading');
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    setStatus('loading');
    setUsers([]);
    const fallback = typeof window !== 'undefined'
      ? window.setTimeout(() => {
        if (!cancelled) {
          setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
        }
      }, 6000)
      : null;

    try {
      unsub = subscribeEditorPresence(waveId, blipId, (payload) => {
        if (cancelled) return;
        if (fallback && typeof window !== 'undefined') window.clearTimeout(fallback);
        setStatus('ready');
        const safeUsers = Array.isArray(payload?.users)
          ? payload.users.map((user) => ({ userId: user?.userId, name: user?.name }))
          : [];
        setUsers(safeUsers);
      });
    } catch {
      if (fallback && typeof window !== 'undefined') window.clearTimeout(fallback);
      if (!cancelled) setStatus('error');
    }

    return () => {
      cancelled = true;
      if (fallback && typeof window !== 'undefined') window.clearTimeout(fallback);
      try { unsub?.(); } catch {}
    };
  }, [waveId, blipId]);

  return { status, users, count: users.length };
}
