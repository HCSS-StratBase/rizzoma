import { resetSocketForAuthTransition } from './socket';

export const AUTH_CHANGE_STORAGE_KEY = 'rizzoma:auth-session-change';
export const AUTH_CHANGE_CHANNEL = 'rizzoma:auth-session';
export const AUTH_TAB_ID = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36);

/** Announce only an epoch change — never identity, credentials, or tokens. */
export function announceAuthChange({ resetSocket = true }: { resetSocket?: boolean } = {}): void {
  // Local auth mutations rotate the transport before any new-account UI can
  // reuse the old Socket.IO handshake or its buffered packets.
  if (resetSocket) resetSocketForAuthTransition();
  const payload = {
    at: Date.now(),
    sourceTabId: AUTH_TAB_ID,
    nonce: globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36),
  };
  try { localStorage.setItem(AUTH_CHANGE_STORAGE_KEY, JSON.stringify(payload)); } catch {}
  try {
    const channel = new BroadcastChannel(AUTH_CHANGE_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {}
}
