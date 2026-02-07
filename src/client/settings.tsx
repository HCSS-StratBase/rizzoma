import { createRoot } from 'react-dom/client';
import { useState, useEffect } from 'react';
import { api, ensureCsrf } from './lib/api';
import { toast } from './components/Toast';

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

  const styles = {
    container: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      maxWidth: 800,
      margin: '0 auto',
      padding: 24,
    },
    header: {
      marginBottom: 24,
      borderBottom: '1px solid #e0e0e0',
      paddingBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: 600,
      color: '#333',
      margin: 0,
    },
    tabs: {
      display: 'flex',
      gap: 8,
      marginBottom: 24,
    },
    tab: {
      padding: '10px 20px',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      fontSize: 14,
      color: '#666',
      borderRadius: 4,
    },
    tabActive: {
      background: '#e8f0fe',
      color: '#4285f4',
      fontWeight: 500,
    },
    section: {
      marginBottom: 32,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 500,
      marginBottom: 16,
      color: '#333',
    },
    formGroup: {
      marginBottom: 16,
    },
    label: {
      display: 'block',
      marginBottom: 6,
      fontSize: 14,
      fontWeight: 500,
      color: '#333',
    },
    input: {
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #ddd',
      borderRadius: 4,
      fontSize: 14,
    },
    checkbox: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    select: {
      padding: '10px 12px',
      border: '1px solid #ddd',
      borderRadius: 4,
      fontSize: 14,
      minWidth: 150,
    },
    button: {
      padding: '10px 20px',
      background: '#4285f4',
      border: 'none',
      borderRadius: 4,
      color: 'white',
      fontSize: 14,
      cursor: 'pointer',
    },
    backLink: {
      color: '#4285f4',
      textDecoration: 'none',
      fontSize: 14,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <a href="/" style={styles.backLink}>&larr; Back to Rizzoma</a>
        <h1 style={styles.title}>Settings</h1>
      </div>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'profile' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'notifications' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('notifications')}
        >
          Notifications
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'appearance' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('appearance')}
        >
          Appearance
        </button>
      </div>

      {activeTab === 'profile' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Profile Information</h2>
          <div style={styles.formGroup}>
            <label style={styles.label}>Display Name</label>
            <input
              type="text"
              style={styles.input}
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              style={{ ...styles.input, background: '#f5f5f5' }}
              value={profile.email}
              disabled
            />
            <small style={{ color: '#666', fontSize: 12 }}>Email cannot be changed</small>
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Email Notifications</h2>

          <div style={styles.checkbox}>
            <input
              type="checkbox"
              id="emailEnabled"
              checked={notifications.emailEnabled}
              onChange={(e) => setNotifications({ ...notifications, emailEnabled: e.target.checked })}
            />
            <label htmlFor="emailEnabled">Enable email notifications</label>
          </div>

          {notifications.emailEnabled && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Digest Frequency</label>
                <select
                  style={styles.select}
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

              <h3 style={{ ...styles.sectionTitle, fontSize: 16, marginTop: 24 }}>Notify me about:</h3>

              <div style={styles.checkbox}>
                <input
                  type="checkbox"
                  id="invites"
                  checked={notifications.inviteNotifications}
                  onChange={(e) => setNotifications({ ...notifications, inviteNotifications: e.target.checked })}
                />
                <label htmlFor="invites">Topic invitations</label>
              </div>

              <div style={styles.checkbox}>
                <input
                  type="checkbox"
                  id="mentions"
                  checked={notifications.mentionNotifications}
                  onChange={(e) => setNotifications({ ...notifications, mentionNotifications: e.target.checked })}
                />
                <label htmlFor="mentions">Mentions (@you)</label>
              </div>

              <div style={styles.checkbox}>
                <input
                  type="checkbox"
                  id="replies"
                  checked={notifications.replyNotifications}
                  onChange={(e) => setNotifications({ ...notifications, replyNotifications: e.target.checked })}
                />
                <label htmlFor="replies">Replies to my blips</label>
              </div>
            </>
          )}

          <button
            style={{ ...styles.button, marginTop: 16 }}
            onClick={saveNotifications}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Notifications'}
          </button>
        </div>
      )}

      {activeTab === 'appearance' && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Appearance</h2>

          <div style={styles.formGroup}>
            <label style={styles.label}>Theme</label>
            <select
              style={styles.select}
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
            >
              <option value="system">System default</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <p style={{ color: '#666', fontSize: 13 }}>
            Note: Dark theme is coming soon. Currently only light theme is available.
          </p>
        </div>
      )}

    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
