import { useChangeTracking } from '../hooks/useChangeTracking';
import { useAuth } from '../hooks/useAuth';
import { FEATURES } from '../shared/featureFlags';
import './editor/FollowGreen.css';

export function GreenNavigation() {
  const { user } = useAuth();
  const { goToNextUnread, unreadCount } = useChangeTracking(user?.id || null);

  if (!FEATURES.FOLLOW_GREEN || unreadCount === 0) {
    return null;
  }

  const handleNavigate = () => {
    const blipId = goToNextUnread();
    if (blipId) {
      // Scroll to the blip
      const element = document.getElementById(`blip-${blipId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash the highlight
        element.classList.add('blip-highlight-active');
        setTimeout(() => {
          element.classList.remove('blip-highlight-active');
        }, 1000);
      }
    }
  };

  return (
    <div className="green-navigation">
      <button 
        className="green-navigation-button"
        onClick={handleNavigate}
        title="Navigate to next unread change (Shortcut: n)"
      >
        <span>Follow the Green</span>
        <span className="green-count">{unreadCount}</span>
        <span>→</span>
      </button>
    </div>
  );
}