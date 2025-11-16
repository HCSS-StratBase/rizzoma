import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { RizzomaLayout } from './components/RizzomaLayout';
import { Toast } from './components/Toast';
import { FEATURES } from '@shared/featureFlags';
import './RizzomaApp.css';

export function RizzomaApp() {
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap auth state
  useEffect(() => {
    (async () => {
      try {
        const r = await api('/api/auth/me');
        if (r.ok) setMe(r.data);
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <h2>Loading Rizzoma...</h2>
      </div>
    );
  }

  return (
    <div className="rizzoma-app">
      {/* Yellow notification bar like real Rizzoma */}
      {FEATURES.FOLLOW_GREEN && (
        <div className="notification-bar">
          Have your Rizzoma Tasks copied to your Google Calendar automatically. 
          <a href="#">Disable extension</a>
        </div>
      )}
      
      <RizzomaLayout isAuthed={!!me} />
      <Toast />
    </div>
  );
}

