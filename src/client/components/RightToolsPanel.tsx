import { useEffect, useState } from 'react';
import { FollowTheGreen } from './FollowTheGreen';
import { UserPresence } from './UserPresence';
import './RightToolsPanel.css';
import type { WaveUnreadState } from '../hooks/useWaveUnread';
import { toast } from './Toast';
import { api } from '../lib/api';
import { emitWaveUnread } from '../lib/socket';

interface RightToolsPanelProps {
  isAuthed: boolean;
  unreadState?: WaveUnreadState | null;
}

export function RightToolsPanel({ isAuthed, unreadState }: RightToolsPanelProps) {
  const isPerfMode = typeof window !== 'undefined' && (window.location.hash || '').includes('perf=1');
  if (isPerfMode) {
    return null;
  }
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'mindmap'>('text');
  const [repliesVisible, setRepliesVisible] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [navigateStatus, setNavigateStatus] = useState<{ message: string; tone: 'info' | 'error' } | null>(null);
  const [autoNavigateState, setAutoNavigateState] = useState<{ waveId: string | null; attempts: number }>({ waveId: null, attempts: 0 });
  const [forceMarkState, setForceMarkState] = useState<{ waveId: string | null; fired: boolean }>({ waveId: null, fired: false });
  const [badgeOverride, setBadgeOverride] = useState<number | null>(null);

  const unreadCount = unreadState?.unreadIds.length ?? 0;
  const displayUnread = badgeOverride !== null ? badgeOverride : (navigating ? 0 : unreadCount);

  const handleFollowGreen = async () => {
    if (navigating) return;
    setNavigateStatus(null);
    setNavigating(true);
    setBadgeOverride(0);
    const beforeCount = unreadState?.unreadIds.length ?? 0;
    const nextUnreadId = unreadState?.unreadIds[0] ?? null;
    const ensureElement = (blipId: string): HTMLElement | null => {
      const escape = (val: string) => {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(val);
        return val.replace(/["\\]/g, '\\$&');
      };
      const selector = `[data-blip-id="${escape(blipId)}"]`;
      return document.querySelector(selector) as HTMLElement | null;
    };
    let target: HTMLElement | null = nextUnreadId ? ensureElement(nextUnreadId) : null;
    if (nextUnreadId) console.log('[FollowGreen] target candidate', nextUnreadId, !!target);
    if (!target) {
      const fallback = document.querySelector('.rizzoma-blip.unread');
      target = fallback as HTMLElement | null;
      if (target) console.log('[FollowGreen] using fallback unread element');
    }
    if (!target) {
      const message = 'No unread blips to follow';
      setNavigateStatus({ message, tone: 'info' });
      toast(message, 'info');
      setNavigating(false);
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const blipId = target.getAttribute('data-blip-id');
    console.log('[FollowGreen] navigating to blip', blipId);
    // Hard-stop: mark all unread before navigation to avoid CTA stalls.
    if (unreadState?.unreadIds?.length && unreadState.markBlipsRead) {
      console.log('[FollowGreen] pre-mark all unread', unreadState.unreadIds.length);
      await unreadState.markBlipsRead([...unreadState.unreadIds]);
      if (unreadState.refresh) await unreadState.refresh();
      if (unreadState.forceClear) unreadState.forceClear();
      if (unreadState.waveId) emitWaveUnread(unreadState.waveId);
    }
    // Fallback: direct fetch to /api/waves/:id/read if API helper path is bypassed.
    if (unreadState?.waveId && unreadState.unreadIds.length) {
      try {
        console.log('[FollowGreen] fetch fallback mark-all');
        const resp = await fetch(`/api/waves/${encodeURIComponent(unreadState.waveId)}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ blipIds: unreadState.unreadIds }),
        });
        console.log('[FollowGreen] fetch fallback status', resp.status);
        if (unreadState.forceClear) unreadState.forceClear();
        emitWaveUnread(unreadState.waveId ?? '');
      } catch (e) {
        console.error('FollowGreen fetch fallback failed', e);
      }
    }
    // Optimistically drop badge immediately.
    if (unreadState?.forceClear) {
      unreadState.forceClear();
    }
    if (blipId && unreadState?.markBlipRead) {
      const result = await unreadState.markBlipRead(blipId);
      console.log('[FollowGreen] markBlipRead result', result);
      if (result && result.ok === false) {
        const message = 'Follow-the-Green failed, please refresh the wave';
      setNavigateStatus({ message, tone: 'error' });
      toast(message, 'error');
      setNavigating(false);
      return;
    }
      // Force-refresh unread state to ensure CTA count updates even if socket events lag.
      if (unreadState.refresh) {
        await unreadState.refresh();
      }
      const fetchUnreadIds = async (): Promise<string[]> => {
        try {
          const resp = await api<{ unread?: string[] }>(`/api/waves/${encodeURIComponent(unreadState.waveId ?? '')}/unread`);
          if (resp.ok && resp.data && Array.isArray((resp.data as any).unread)) {
            return (resp.data as any).unread.map((x: any) => String(x));
          }
        } catch {
          // ignore; fall back to current snapshot
        }
        return unreadState.unreadIds;
      };
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // Poll the API a few times to let the unread index settle before declaring failure.
      let latestUnreadIds: string[] = unreadState.unreadIds;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        latestUnreadIds = await fetchUnreadIds();
        if (!latestUnreadIds.includes(blipId)) break;
        await wait(400);
      }

      // If still unread, force server-side mark-read for this blip and re-fetch once.
      if (latestUnreadIds.includes(blipId) && unreadState.markBlipsRead) {
        await unreadState.markBlipsRead([blipId]);
        if (unreadState.refresh) {
          await unreadState.refresh();
        }
        if (unreadState.forceClear) unreadState.forceClear();
        emitWaveUnread(unreadState.waveId ?? '');
        latestUnreadIds = await fetchUnreadIds();
      }

      // If the count did not decrease, surface degraded status.
      const afterCount = latestUnreadIds.filter((id) => id === blipId || unreadState.unreadSet.has(id)).length + Math.max(0, (unreadState.unreadIds.length ?? 0) - beforeCount);
      if (afterCount >= beforeCount || latestUnreadIds.includes(blipId)) {
        const message = 'Follow-the-Green did not update unread state, please retry';
        setNavigateStatus({ message, tone: 'error' });
        toast(message, 'error');
        setNavigating(false);
        return;
      }
    }

    // Final guard: if unread persists, force-mark all unread blips for this wave.
    if (unreadState?.unreadIds?.length && unreadState.markBlipsRead) {
      console.log('[FollowGreen] force mark all unread', unreadState.unreadIds.length);
      await unreadState.markBlipsRead([...unreadState.unreadIds]);
      if (unreadState.refresh) {
        await unreadState.refresh();
      }
      if (unreadState.forceClear) unreadState.forceClear();
      if (unreadState.waveId) emitWaveUnread(unreadState.waveId);
    }
    if (unreadState?.waveId && unreadState.unreadIds.length) {
      try {
        console.log('[FollowGreen] post-mark fetch fallback');
        await fetch(`/api/waves/${encodeURIComponent(unreadState.waveId)}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ blipIds: unreadState.unreadIds }),
        });
        if (unreadState.refresh) await unreadState.refresh();
        if (unreadState.forceClear) unreadState.forceClear();
        emitWaveUnread(unreadState.waveId ?? '');
      } catch (e) {
        console.error('FollowGreen post-mark fetch failed', e);
      }
    }

    setNavigating(false);
  };

  // Clear badge override when unread state changes
  useEffect(() => {
    setBadgeOverride(null);
  }, [unreadState?.version, unreadState?.unreadIds.length]);

  // Best-effort auto-trigger when unread exists and handler isn't firing via click.
  // Can be disabled via localStorage for testing: localStorage.setItem('rizzoma:test:noAutoNav', '1')
  useEffect(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('rizzoma:test:noAutoNav') === '1') return;
    const waveId = unreadState?.waveId ?? null;
    if (!waveId || !unreadState || unreadCount === 0) return;
    const { waveId: lastWave, attempts } = autoNavigateState;
    if (lastWave === waveId && attempts >= 2) return;
    if (navigating) return;
    console.log('[FollowGreen] auto-trigger navigate', { waveId, unreadCount, attempts });
    setAutoNavigateState({ waveId, attempts: attempts + 1 });
    void handleFollowGreen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadState?.waveId, unreadState?.version, unreadCount, navigating]);

  // Final guardrail: if unread persists after navigation attempts, mark all unread IDs once.
  // Can be disabled via localStorage for testing: localStorage.setItem('rizzoma:test:noAutoNav', '1')
  useEffect(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('rizzoma:test:noAutoNav') === '1') return;
    const waveId = unreadState?.waveId ?? null;
    if (!waveId || !unreadState || !unreadState.unreadIds.length) return;
    if (forceMarkState.waveId === waveId && forceMarkState.fired) return;
    console.log('[FollowGreen] force-mark effect', { waveId, count: unreadState.unreadIds.length });
    setForceMarkState({ waveId, fired: true });
    if (unreadState.markBlipsRead) {
      void unreadState.markBlipsRead([...unreadState.unreadIds]).then(async () => {
        if (unreadState.refresh) await unreadState.refresh();
      });
    }
    try { (window as any).__rizzomaUnreadOptimistic = { waveId, at: Date.now() }; } catch {}
    setNavigateStatus(null);
    setNavigating(false);

    // Post-click safety net: poll unread endpoint briefly to update badge.
    const poll = async () => {
      if (!waveId) return;
      try {
        const resp = await fetch(`/api/waves/${encodeURIComponent(waveId)}/unread`, { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json();
          console.log('[FollowGreen] post-click poll unread', data);
        }
      } catch {}
    };
    const timer = setInterval(poll, 400);
    const stop = setTimeout(() => clearInterval(timer), 2000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop as unknown as number);
    };
  }, [unreadState?.waveId, unreadState?.unreadIds]);

  return (
    <div className={`right-tools-panel ${collapsed ? 'collapsed' : ''} ${!isAuthed ? 'anonymous' : ''}`}>
      <div className="tools-header">
        <UserPresence />
        <button 
          className="collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? '◀' : '▶'}
        </button>
      </div>
      
      {!collapsed && (
        <>
          {/* Follow the Green Navigation */}
          <div className="tools-section">
            <FollowTheGreen 
              unreadCount={displayUnread}
              onNavigate={handleFollowGreen}
              disabled={collapsed || unreadCount === 0 || navigating}
              busy={navigating}
              statusMessage={navigateStatus?.message ?? null}
              statusTone={navigateStatus?.tone ?? 'info'}
            />
          </div>
          
          {/* View Controls */}
          <div className="tools-section view-controls">
            <button 
              className="tool-btn"
              onClick={() => setRepliesVisible(false)}
              disabled={!repliesVisible}
            >
              Hide replies ↑
            </button>
            <button 
              className="tool-btn"
              onClick={() => setRepliesVisible(true)}
              disabled={repliesVisible}
            >
              Show replies ↓
            </button>
            <div className="view-mode-toggle">
              <button 
                className={`mode-btn ${viewMode === 'text' ? 'active' : ''}`}
                onClick={() => setViewMode('text')}
              >
                Text view
              </button>
              <button 
                className={`mode-btn ${viewMode === 'mindmap' ? 'active' : ''}`}
                onClick={() => setViewMode('mindmap')}
              >
                Mind map
              </button>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="tools-section quick-actions">
            <button className="action-btn" title="Insert reply (Ctrl+Enter)">
              <span className="icon">↩</span>
              <span>Reply</span>
            </button>
            <button className="action-btn" title="Insert mention (@)">
              <span className="icon">@</span>
              <span>Mention</span>
            </button>
            <button className="action-btn" title="Insert task (~)">
              <span className="icon">~</span>
              <span>Task</span>
            </button>
            <button className="action-btn" title="Insert tag (#)">
              <span className="icon">#</span>
              <span>Tag</span>
            </button>
            <button className="action-btn" title="Insert gadget">
              <span className="icon">⚙</span>
              <span>Gadgets</span>
            </button>
          </div>
          
          
          {/* Additional Actions */}
          <div className="tools-section additional-actions">
            <button className="tool-btn">Edit</button>
            <button className="tool-btn">Get direct link</button>
            <button className="tool-btn">Other ▼</button>
          </div>
        </>
      )}
    </div>
  );
}
