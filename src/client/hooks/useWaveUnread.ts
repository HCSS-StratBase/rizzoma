import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { subscribeBlipEvents, subscribeWaveUnread, ensureWaveUnreadJoin } from '../lib/socket';
import { toast } from '../components/Toast';

// Debounce helper
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => { if (timeoutId) clearTimeout(timeoutId); };
  return debounced as T & { cancel: () => void };
}

type Snapshot = {
  unreadIds: string[];
  total: number;
  readCount: number;
  loading: boolean;
  error: string | null;
  version: number;
};

const INITIAL_STATE: Snapshot = {
  unreadIds: [],
  total: 0,
  readCount: 0,
  loading: false,
  error: null,
  version: 0,
};

const DEBUG_KEY = 'rizzoma:debug:unread';
const isPerfMode = (): boolean => {
  try {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash || '';
    const query = hash.split('?')[1] || '';
    const params = new URLSearchParams(query);
    const perfValue = params.get('perf');
    if (perfValue === null) return false;
    return perfValue !== '0' && perfValue !== 'false';
  } catch {
    return false;
  }
};

const debugEnabled = (): boolean => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(DEBUG_KEY) === '1'; } catch { return false; }
};
const dbg = (...args: any[]) => { if (debugEnabled()) console.debug('[useWaveUnread]', ...args); };

export type MarkReadResult = { ok: true } | { ok: false; error?: string };

export type WaveUnreadState = {
  waveId: string | null;
  unreadIds: string[];
  unreadSet: Set<string>;
  total: number;
  readCount: number;
  loading: boolean;
  error: string | null;
  version: number;
  refresh: () => Promise<void>;
  markBlipRead: (blipId: string) => Promise<MarkReadResult>;
  markBlipsRead: (blipIds: string[]) => Promise<MarkReadResult>;
  forceClear: () => void;
};

export function useWaveUnread(waveId: string | null): WaveUnreadState {
  const [state, setState] = useState<Snapshot>(INITIAL_STATE);
  const userIdRef = useRef<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const perfMode = isPerfMode();

  useEffect(() => {
    if (perfMode) {
      setAuthReady(false);
      userIdRef.current = null;
      setUserId(null);
      return;
    }
    (async () => {
      try {
        const me = await api('/api/auth/me');
        if (me.ok && me.data && typeof me.data === 'object' && (me.data as any).id) {
          const id = String((me.data as any).id);
          userIdRef.current = id;
          setUserId(id);
        }
      } catch {
        userIdRef.current = null;
        setUserId(null);
      }
      setAuthReady(true);
    })();
  }, []);

  const resetState = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const refresh = useCallback(async () => {
    if (perfMode) {
      resetState();
      return;
    }
    if (!waveId) {
      resetState();
      return;
    }
    dbg('refresh:start', { waveId });
    if (typeof window !== 'undefined') {
      try { (window as any).__rizzomaUnreadLastRefresh = Date.now(); } catch {}
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const resp = await api(`/api/waves/${encodeURIComponent(waveId)}/unread`);
      if (!resp.ok) {
        throw new Error(typeof resp.data === 'string' ? resp.data : 'unread_fetch_failed');
      }
      const data = resp.data as any;
      const unreadIds = Array.isArray(data?.unread) ? (data.unread as any[]).map((id) => String(id)) : [];
      dbg('refresh:success', { waveId, unreadCount: unreadIds.length, total: data?.total, read: data?.read });
      setState((prev) => ({
        unreadIds,
        total: Number(data?.total || 0),
        readCount: Number(data?.read || 0),
        loading: false,
        error: null,
        version: prev.version + 1,
      }));
    } catch (error) {
      console.error('Failed to refresh unread state', error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Failed to load unread state',
        version: prev.version + 1,
      }));
      dbg('refresh:error', { waveId, error });
    }
  }, [waveId, resetState, perfMode]);

  useEffect(() => {
    if (perfMode) {
      resetState();
      return;
    }
    if (!waveId) {
      resetState();
      return;
    }
    void refresh();
  }, [waveId, refresh, resetState, perfMode]);

  // Create a debounced refresh to avoid hammering the server on rapid socket events
  const debouncedRefreshRef = useRef<(ReturnType<typeof debounce>) | null>(null);
  useEffect(() => {
    debouncedRefreshRef.current = debounce(() => {
      dbg('debounced:refresh');
      void refresh();
    }, 2000); // 2 second debounce for socket-triggered refreshes
    return () => {
      debouncedRefreshRef.current?.cancel();
    };
  }, [refresh]);

  useEffect(() => {
    if (perfMode) return undefined;
    if (!waveId || !authReady) return undefined;
    ensureWaveUnreadJoin(waveId, userIdRef.current);
    const unsubscribe = subscribeBlipEvents(waveId, (evt) => {
      const selfId = userIdRef.current;
      if (evt.userId && selfId && evt.userId === selfId && evt.action !== 'deleted') {
        // Local optimistic updates already handled.
        return;
      }
      if (evt.action === 'deleted') {
        setState((prev) => {
          if (!prev.unreadIds.includes(evt.blipId)) return prev;
          const nextUnread = prev.unreadIds.filter((id) => id !== evt.blipId);
          return {
            ...prev,
            unreadIds: nextUnread,
            total: Math.max(0, prev.total - 1),
            version: prev.version + 1,
          };
        });
        return;
      }
      dbg('blip:event', evt);
      // Use debounced refresh for socket events to avoid hammering server
      debouncedRefreshRef.current?.();
    });
    const unsubscribeWave = subscribeWaveUnread(waveId, (evt) => {
      dbg('wave:unread:event', evt);
      // Use debounced refresh for socket events
      debouncedRefreshRef.current?.();
    }, userIdRef.current);
    return () => {
      try { unsubscribe(); } catch {}
      try { unsubscribeWave(); } catch {}
    };
  }, [waveId, userId, authReady, perfMode]);

  const markBlipRead = useCallback(async (blipId: string): Promise<MarkReadResult> => {
    if (perfMode) return { ok: true };
    if (!waveId || !blipId) return { ok: true };
    let removed = false;
    let snapshot: Snapshot | null = null;
    setState((prev) => {
      snapshot = prev;
      if (!prev.unreadIds.includes(blipId)) return prev;
      removed = true;
      const nextUnread = prev.unreadIds.filter((id) => id !== blipId);
      dbg('markBlipRead:optimistic', { waveId, blipId, before: prev.unreadIds.length, after: nextUnread.length });
      return {
        ...prev,
        unreadIds: nextUnread,
        readCount: Math.min(prev.total, prev.readCount + 1),
        version: prev.version + 1,
      };
    });
    if (!removed) return { ok: true };
    try {
      const resp = await api(`/api/waves/${encodeURIComponent(waveId)}/blips/${encodeURIComponent(blipId)}/read`, { method: 'POST' });
      if (!resp.ok) {
        throw new Error(typeof resp.data === 'string' ? resp.data : 'mark_read_failed');
      }
      dbg('markBlipRead:success', { waveId, blipId });
      return { ok: true };
    } catch (error) {
      console.error('Failed to mark blip read', error);
      if (snapshot) setState(snapshot);
      toast('Follow-the-Green failed, please refresh', 'error');
      dbg('markBlipRead:rollback', { waveId, blipId });
      return { ok: false, error: error instanceof Error ? error.message : 'mark_read_failed' };
    }
  }, [waveId, perfMode]);

  const markBlipsRead = useCallback(async (blipIds: string[]): Promise<MarkReadResult> => {
    if (perfMode) return { ok: true };
    if (!waveId || !Array.isArray(blipIds) || blipIds.length === 0) return { ok: true };
    let removedCount = 0;
    setState((prev) => {
      const removalSet = new Set(blipIds);
      const nextUnread = prev.unreadIds.filter((id) => {
        const remove = removalSet.has(id);
        if (remove) removedCount += 1;
        return !remove;
      });
      if (removedCount === 0) return prev;
      return {
        ...prev,
        unreadIds: nextUnread,
        readCount: Math.min(prev.total, prev.readCount + removedCount),
        version: prev.version + 1,
      };
    });
    if (removedCount === 0) return { ok: true };
    try {
      const resp = await api(`/api/waves/${encodeURIComponent(waveId)}/read`, { method: 'POST', body: JSON.stringify({ blipIds }) });
      if (!resp.ok) {
        throw new Error(typeof resp.data === 'string' ? resp.data : 'mark_read_failed');
      }
      return { ok: true };
    } catch (error) {
      console.error('Failed to mark blips read', error);
      toast('Failed to persist read state, retrying…', 'error');
      await refresh();
      return { ok: false, error: error instanceof Error ? error.message : 'mark_read_failed' };
    }
  }, [waveId, refresh]);

  const unreadSet = useMemo(() => new Set(state.unreadIds), [state.unreadIds]);

  const forceClear = useCallback(() => {
    setState((prev) => ({
      ...prev,
      unreadIds: [],
      readCount: prev.total,
      version: prev.version + 1,
    }));
    if (typeof window !== 'undefined') {
      try { (window as any).__rizzomaUnreadOptimistic = { waveId, at: Date.now() }; } catch {}
    }
  }, [waveId]);

  return {
    waveId,
    unreadIds: state.unreadIds,
    unreadSet,
    total: state.total,
    readCount: state.readCount,
    loading: state.loading,
    error: state.error,
    version: state.version,
    refresh,
    markBlipRead,
    markBlipsRead,
    forceClear,
  };
}
