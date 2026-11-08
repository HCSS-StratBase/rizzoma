import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { api, ensureCsrf } from './lib/api';
import { toast } from './components/Toast';
import './settings.css';

interface NotificationPreferences {
  emailEnabled: boolean;
  digestFrequency: 'none' | 'daily' | 'weekly';
  inviteNotifications: boolean;
  mentionNotifications: boolean;
  replyNotifications: boolean;
}

interface UserProfile {
  name: string;
  email: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'appearance'>('profile');
  const [profile, setProfile] = useState<UserProfile>({ name: '', email: '' });
  const [notifications, setNotifications] = useState<NotificationPreferences>({
    emailEnabled: true,
    digestFrequency: 'weekly',
    inviteNotifications: true,
    mentionNotifications: true,
    replyNotifications: true,
  });
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load user profile
      const profileRes = await api<{ name: string; email: string }>('/api/auth/me');
      if (profileRes.ok && profileRes.data && typeof profileRes.data === 'object') {
        const data = profileRes.data as { name: string; email: string };
        setProfile({ name: data.name || '', email: data.email || '' });
      }

      // Load notification preferences
      const notifRes = await api<NotificationPreferences>('/api/notifications/preferences');
      if (notifRes.ok && notifRes.data && typeof notifRes.data === 'object') {
        setNotifications(notifRes.data as NotificationPreferences);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveNotifications = async () => {
    setSaving(true);
    try {
      await ensureCsrf();
      const response = await api('/api/notifications/preferences', {
        method: 'PATCH',
        body: JSON.stringify(notifications),
      });
      if (response.ok) {
        toast('Notification settings saved');
      } else {
        toast('Failed to save settings', 'error');
      }
    } catch (error) {
      toast('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-card">
        <header className="settings-header-bar">
          <div className="settings-header-left">
            <h1 className="settings-header-title">Rizzoma Settings</h1>
          </div>
          <a href="/" className="settings-back-link">
            &larr; Back to Topics
          </a>
        </header>

        <div className="settings-body-layout">
          <nav className="settings-sidebar">
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'notifications' ? 'active' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              Notifications
            </button>
            <button
              type="button"
              className={`settings-tab-btn ${activeTab === 'appearance' ? 'active' : ''}`}
              onClick={() => setActiveTab('appearance')}
            >
              Appearance
            </button>
          </nav>

          <main className="settings-content">
            {activeTab === 'profile' && (
              <section className="settings-section">
                <h2 className="settings-section-title">Profile Information</h2>
                <div className="settings-form-group">
                  <label htmlFor="settings-name">Display Name</label>
                  <input
                    id="settings-name"
                    type="text"
                    className="settings-input"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  />
                </div>
                <div className="settings-form-group">
                  <label htmlFor="settings-email">Email Address</label>
                  <input
                    id="settings-email"
                    type="email"
                    className="settings-input"
                    value={profile.email}
                    disabled
                  />
                  <div className="settings-hint">Primary account email cannot be changed.</div>
                </div>
              </section>
            )}

            {activeTab === 'notifications' && (
              <section className="settings-section">
                <h2 className="settings-section-title">Email Notifications</h2>

                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    id="emailEnabled"
                    checked={notifications.emailEnabled}
                    onChange={(e) => setNotifications({ ...notifications, emailEnabled: e.target.checked })}
                  />
                  Enable email notifications
                </label>

                {notifications.emailEnabled && (
                  <>
                    <div className="settings-form-group" style={{ marginTop: 14 }}>
                      <label htmlFor="digest-freq">Digest Frequency</label>
                      <select
                        id="digest-freq"
                        className="settings-select"
                        value={notifications.digestFrequency}
                        onChange={(e) => setNotifications({
                          ...notifications,
                          digestFrequency: e.target.value as 'none' | 'daily' | 'weekly'
                        })}
                      >
                        <option value="none">No digest</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                      </select>
                    </div>

                    <div style={{ marginTop: 18, marginBottom: 12, fontWeight: 'bold', fontSize: 13, color: '#4c5a68' }}>
                      Notify me about:
                    </div>

                    <label className="settings-checkbox-row">
                      <input
                        type="checkbox"
                        checked={notifications.inviteNotifications}
                        onChange={(e) => setNotifications({ ...notifications, inviteNotifications: e.target.checked })}
                      />
                      Topic invitations
                    </label>

                    <label className="settings-checkbox-row">
                      <input
                        type="checkbox"
                        checked={notifications.mentionNotifications}
                        onChange={(e) => setNotifications({ ...notifications, mentionNotifications: e.target.checked })}
                      />
                      Mentions (@you)
                    </label>

                    <label className="settings-checkbox-row">
                      <input
                        type="checkbox"
                        checked={notifications.replyNotifications}
                        onChange={(e) => setNotifications({ ...notifications, replyNotifications: e.target.checked })}
                      />
                      Replies to my blips
                    </label>
                  </>
                )}

                <button
                  type="button"
                  className="settings-save-btn"
                  onClick={saveNotifications}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Notifications'}
                </button>
              </section>
            )}

            {activeTab === 'appearance' && (
              <section className="settings-section">
                <h2 className="settings-section-title">Appearance</h2>

                <div className="settings-form-group">
                  <label htmlFor="theme-select">Theme</label>
                  <select
                    id="theme-select"
                    className="settings-select"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                  >
                    <option value="system">System default</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>

                <div className="settings-hint">
                  Original Rizzoma light theme is active by default.
                </div>
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
