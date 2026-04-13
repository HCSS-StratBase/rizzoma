import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { RizzomaLayout } from './components/RizzomaLayout';
import { Toast } from './components/Toast';
import { FEATURES } from '@shared/featureFlags';
import './RizzomaApp.css';

type AuthedUser = { id: string; email?: string } | null;

const CALENDAR_BANNER_DISMISSED_KEY = 'rizzoma:calendarBannerDismissed';

export function RizzomaApp(): JSX.Element {
  const [me, setMe] = useState<AuthedUser>(null);
  const [loading, setLoading] = useState(true);
  const [showCalendarBanner, setShowCalendarBanner] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(CALENDAR_BANNER_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });

  // Bootstrap auth state
  useEffect(() => {
    void (async () => {
      try {
        const r = await api('/api/auth/me');
        if (r.ok) setMe(r.data as AuthedUser);
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const dismissCalendarBanner = () => {
    setShowCalendarBanner(false);
    try {
      window.localStorage.setItem(CALENDAR_BANNER_DISMISSED_KEY, '1');
    } catch {
      // Best-effort persist; banner will reappear next session.
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <h2>Loading Rizzoma...</h2>
      </div>
    );
  }

  return (
    <div className="rizzoma-app">
      {/* Yellow notification bar like real Rizzoma — now with a
          persistent dismiss (×) button mirroring the Install /
          Notifications toast affordance. Dismissal stored in
          localStorage so it sticks across reloads. */}
      {FEATURES.FOLLOW_GREEN && showCalendarBanner && (
        <div className="notification-bar">
          <span className="notification-bar-text">
            Have your Rizzoma Tasks copied to your Google Calendar automatically.{' '}
            <a href="#">Disable extension</a>
          </span>
          <button
            type="button"
            className="notification-bar-dismiss"
            aria-label="Dismiss calendar banner"
            title="Dismiss"
            onClick={dismissCalendarBanner}
          >
            ×
          </button>
        </div>
      )}

      <RizzomaLayout isAuthed={!!me} />
      <Toast />
    </div>
  );
}
