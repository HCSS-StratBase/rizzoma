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

  return (
    <div className="follow-the-green">
      <button
        className="follow-the-green-btn"
        onClick={onNavigate}
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
