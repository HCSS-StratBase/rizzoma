import { useCallback, useRef } from 'react';
import { FEATURES } from '@shared/featureFlags';
import './FollowTheGreen.css';

interface FollowTheGreenProps {
  unreadCount: number;
  onNavigate: () => void;
  disabled?: boolean;
  busy?: boolean;
  statusMessage?: string | null;
  statusTone?: 'info' | 'error';
}

export function FollowTheGreen({
  unreadCount = 0,
  onNavigate,
  disabled = false,
  busy = false,
  statusMessage = null,
  statusTone = 'info',
}: FollowTheGreenProps) {
  if (!FEATURES.FOLLOW_GREEN) {
    return null;
  }

  // Expose a debug hook for tests to call directly.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__followGreenClick = onNavigate;
  }

  const clickLockRef = useRef(false);
  const handleNavigate = useCallback(() => {
    if (disabled || busy) return;
    console.log('[FollowTheGreen] navigate click', { unreadCount });
    if (clickLockRef.current) return;
    clickLockRef.current = true;
    try { onNavigate(); } finally {
      setTimeout(() => { clickLockRef.current = false; }, 0);
    }
  }, [busy, disabled, onNavigate, unreadCount]);

  return (
    <div className="follow-the-green">
      <button
        className="follow-the-green-btn"
        onClick={handleNavigate}
        onMouseDown={handleNavigate}
        title={`Navigate to next unread (${unreadCount} remaining)`}
        disabled={disabled}
        aria-busy={busy}
      >
        <span className="btn-text">{busy ? 'Following…' : 'Next'}</span>
        <span className="btn-arrows">↓↓</span>
        <span className="unread-count">{unreadCount}</span>
      </button>
      {statusMessage ? (
        <div className={`follow-the-green-status ${statusTone}`}>
          {statusMessage}
        </div>
      ) : null}
    </div>
  );
}
