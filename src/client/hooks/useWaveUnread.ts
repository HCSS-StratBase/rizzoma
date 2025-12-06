import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { subscribeBlipEvents } from '../lib/socket';
import { toast } from '../components/Toast';

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
  markBlipRead: (blipId: string) => Promise<void>;
  markBlipsRead: (blipIds: string[]) => Promise<void>;
};

export function useWaveUnread(waveId: string | null): WaveUnreadState {
  const [state, setState] = useState<Snapshot>(INITIAL_STATE);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const me = await api('/api/auth/me');
        if (me.ok && me.data && typeof me.data === 'object' && (me.data as any).id) {
          userIdRef.current = String((me.data as any).id);
        }
      } catch {
        userIdRef.current = null;
      }
    })();
  }, []);

  const resetState = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const refresh = useCallback(async () => {
    if (!waveId) {
      resetState();
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const resp = await api(`/api/waves/${encodeURIComponent(waveId)}/unread`);
      if (!resp.ok) {
        throw new Error(typeof resp.data === 'string' ? resp.data : 'unread_fetch_failed');
      }
      const data = resp.data as any;
      const unreadIds = Array.isArray(data?.unread) ? (data.unread as any[]).map((id) => String(id)) : [];
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
    }
  }, [waveId, resetState]);

  useEffect(() => {
    if (!waveId) {
      resetState();
      return;
    }
    void refresh();
  }, [waveId, refresh, resetState]);

  useEffect(() => {
    if (!waveId) return undefined;
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
      void refresh();
    });
    return () => {
      try { unsubscribe(); } catch {}
    };
  }, [waveId, refresh]);

  const markBlipRead = useCallback(async (blipId: string) => {
    if (!waveId || !blipId) return;
    let removed = false;
    setState((prev) => {
      if (!prev.unreadIds.includes(blipId)) return prev;
      removed = true;
      const nextUnread = prev.unreadIds.filter((id) => id !== blipId);
      return {
        ...prev,
        unreadIds: nextUnread,
        readCount: Math.min(prev.total, prev.readCount + 1),
        version: prev.version + 1,
      };
    });
    if (!removed) return;
    try {
      const resp = await api(`/api/waves/${encodeURIComponent(waveId)}/blips/${encodeURIComponent(blipId)}/read`, { method: 'POST' });
      if (!resp.ok) {
        throw new Error(typeof resp.data === 'string' ? resp.data : 'mark_read_failed');
      }
    } catch (error) {
      console.error('Failed to mark blip read', error);
      toast('Read sync failed, retrying…', 'error');
      await refresh();
    }
  }, [waveId, refresh]);

  const markBlipsRead = useCallback(async (blipIds: string[]) => {
    if (!waveId || !Array.isArray(blipIds) || blipIds.length === 0) return;
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
    if (removedCount === 0) return;
    try {
      const resp = await api(`/api/waves/${encodeURIComponent(waveId)}/read`, { method: 'POST', body: JSON.stringify({ blipIds }) });
      if (!resp.ok) {
        throw new Error(typeof resp.data === 'string' ? resp.data : 'mark_read_failed');
      }
    } catch (error) {
      console.error('Failed to mark blips read', error);
      toast('Failed to persist read state, retrying…', 'error');
      await refresh();
    }
  }, [waveId, refresh]);

  const unreadSet = useMemo(() => new Set(state.unreadIds), [state.unreadIds]);

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
  };
}
