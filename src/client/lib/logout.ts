import { api } from './api';
import { announceAuthChange } from './authSessionSignal';
import { offlineQueue } from './offlineQueue';
import { refreshSocketSession } from './socket';

/** Ask any active Service Worker to clear cached responses on sign-out. */
export function clearServiceWorkerCache(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHE' });
    void navigator.serviceWorker.getRegistration?.().then((reg) => {
      reg?.active?.postMessage({ type: 'CLEAR_CACHE' });
    }).catch(() => {});
  } catch {
    // Best-effort cache cleanup
  }
}

/** Complete durable logout before changing local identity. A failed session
 * store revocation must remain visible and retryable; reconnecting/clearing UI
 * state would falsely claim the stolen or copied SID was invalidated. */
export async function logoutCurrentSession(): Promise<void> {
  offlineQueue.deactivateUser();
  const response = await api('/api/auth/logout', { method: 'POST' });
  if (!response.ok && response.status !== 401) {
    const code = typeof response.data === 'object' && response.data && 'error' in response.data
      ? String((response.data as any).error)
      : `http_${response.status}`;
    throw new Error(code || 'logout_failed');
  }
  clearServiceWorkerCache();
  announceAuthChange({ resetSocket: false });
  refreshSocketSession();
}
