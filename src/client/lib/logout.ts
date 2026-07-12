import { api } from './api';
import { refreshSocketSession } from './socket';

/** Complete durable logout before changing local identity. A failed session
 * store revocation must remain visible and retryable; reconnecting/clearing UI
 * state would falsely claim the stolen or copied SID was invalidated. */
export async function logoutCurrentSession(): Promise<void> {
  const response = await api('/api/auth/logout', { method: 'POST' });
  if (!response.ok) {
    const code = typeof response.data === 'object' && response.data && 'error' in response.data
      ? String((response.data as any).error)
      : `http_${response.status}`;
    throw new Error(code || 'logout_failed');
  }
  refreshSocketSession();
}
