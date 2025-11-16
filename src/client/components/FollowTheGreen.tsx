import { FEATURES } from '@shared/featureFlags';
import './FollowTheGreen.css';

interface FollowTheGreenProps {
  unreadCount: number;
  onNavigate: () => void;
}

export function FollowTheGreen({ unreadCount = 0, onNavigate }: FollowTheGreenProps) {
  if (!FEATURES.FOLLOW_GREEN) {
    return null;
  }

  return (
    <button 
      className="follow-the-green-btn"
      onClick={onNavigate}
      title={`Navigate to next unread (${unreadCount} remaining)`}
    >
      <span className="btn-text">Next</span>
      <span className="btn-arrows">↓↓</span>
      <span className="unread-count">{unreadCount}</span>
    </button>
  );
}