import { useState, useEffect } from 'react';
import { useInstallPrompt, useIsPWA } from '../hooks/useServiceWorker';
import { useOfflineIndicator } from '../hooks/useOfflineStatus';
import './PWAPrompts.css';

const DISMISSED_KEY = 'rizzoma:pwa:install-dismissed';
const NOTIF_DISMISSED_KEY = 'rizzoma:pwa:notif-dismissed';

/**
 * Compact banner for PWA install prompt and notification opt-in.
 * Auto-hides when already installed, dismissed, or not available.
 */
export function PWAPrompts() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const isPWA = useIsPWA();
  const { isOffline, hasPending, pendingCount } = useOfflineIndicator();

  const [installDismissed, setInstallDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
  });
  const [notifDismissed, setNotifDismissed] = useState(() => {
    try { return localStorage.getItem(NOTIF_DISMISSED_KEY) === '1'; } catch { return false; }
  });
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });

  // Listen for permission changes
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    // Re-check on visibility change (permission may have been granted in system settings)
    const check = () => setNotifPermission(Notification.permission);
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  const handleInstall = async () => {
    await promptInstall();
  };

  const handleDismissInstall = () => {
    setInstallDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
  };

  const handleNotifEnable = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: 'Notifications enabled', type: 'success' },
      }));
    }
  };

  const handleDismissNotif = () => {
    setNotifDismissed(true);
    try { localStorage.setItem(NOTIF_DISMISSED_KEY, '1'); } catch {}
  };

  const showInstall = canInstall && !isPWA && !installDismissed;
  const showNotif = notifPermission === 'default' && !notifDismissed;
  const showOffline = isOffline || hasPending;

  if (!showInstall && !showNotif && !showOffline) return null;

  return (
    <div className="pwa-prompts">
      {showOffline && (
        <div className="pwa-prompt pwa-prompt--offline">
          <span className="pwa-prompt__icon">!</span>
          <span className="pwa-prompt__text">
            {isOffline
              ? `Offline${hasPending ? ` — ${pendingCount} change${pendingCount > 1 ? 's' : ''} queued` : ''}`
              : `Syncing ${pendingCount} queued change${pendingCount > 1 ? 's' : ''}...`}
          </span>
        </div>
      )}
      {showInstall && (
        <div className="pwa-prompt pwa-prompt--install">
          <span className="pwa-prompt__icon">+</span>
          <span className="pwa-prompt__text">Install Rizzoma for faster access</span>
          <button className="pwa-prompt__btn pwa-prompt__btn--primary" onClick={handleInstall}>Install</button>
          <button className="pwa-prompt__btn pwa-prompt__btn--dismiss" onClick={handleDismissInstall} aria-label="Dismiss">&times;</button>
        </div>
      )}
      {showNotif && (
        <div className="pwa-prompt pwa-prompt--notif">
          <span className="pwa-prompt__icon">&#128276;</span>
          <span className="pwa-prompt__text">Enable notifications for updates</span>
          <button className="pwa-prompt__btn pwa-prompt__btn--primary" onClick={handleNotifEnable}>Enable</button>
          <button className="pwa-prompt__btn pwa-prompt__btn--dismiss" onClick={handleDismissNotif} aria-label="Dismiss">&times;</button>
        </div>
      )}
    </div>
  );
}
