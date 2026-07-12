/**
 * Capacitor native-shell glue for the Rizzoma Android / iOS apps.
 *
 * Called once from `main.tsx` on startup. Detects whether we're running
 * inside a Capacitor WebView (as opposed to a desktop browser or the
 * installed PWA) and applies native-only setup:
 *
 * - Status bar styling matching the topic header color
 * - Splash screen dismissal once the first blip frame paints
 * - App state listeners (backgrounded / resumed) for session refresh
 * - Hardware back button handling on Android
 *
 * All plugin calls are wrapped in try/catch because the PWA path
 * serves the same bundle and must not crash when the plugins aren't
 * available on a plain web origin.
 */

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { clearPendingInvite } from './fragmentSecrets';

const NATIVE_VERIFIER_KEY = 'rizzoma:native-oauth-verifier';
const NATIVE_VERIFIER_TTL_MS = 10 * 60 * 1000;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function createNativeVerifier(): Promise<{ verifier: string; challenge: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(raw);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = base64Url(digest);
  sessionStorage.setItem(NATIVE_VERIFIER_KEY, JSON.stringify({ verifier, createdAt: Date.now() }));
  return { verifier, challenge };
}

function readNativeVerifier(): string | undefined {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(NATIVE_VERIFIER_KEY) || '{}') as { verifier?: unknown; createdAt?: unknown };
    if (typeof parsed.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(parsed.verifier)) return undefined;
    if (Date.now() - Number(parsed.createdAt || 0) > NATIVE_VERIFIER_TTL_MS) return undefined;
    return parsed.verifier;
  } catch {
    return undefined;
  }
}

function clearNativeVerifier(): void {
  try { sessionStorage.removeItem(NATIVE_VERIFIER_KEY); } catch {}
}

function reportNativeOAuthFailure(message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('toast', {
    detail: { type: 'error', message },
  }));
}

/** True if the page is running inside the Capacitor native shell. */
export const isNative = Capacitor.isNativePlatform();

/**
 * Launch an OAuth flow (Google/Facebook/Microsoft) from the native
 * Capacitor shell.
 *
 * Why Chrome Custom Tabs instead of `window.location.href`:
 * Android's WebView has a Chromium bug (issue 40450316) where
 * `setUserAgentString` is silently dropped on main-frame navigations,
 * so the `wv` marker leaks into the UA and Google rejects the OAuth
 * request with a 400 "malformed request". Chrome Custom Tabs run
 * inside real Chrome (native UA) so Google is happy.
 *
 * Cookie handoff: Custom Tabs share cookies with the system Chrome
 * jar, NOT with the Capacitor WebView. So we cannot just set a
 * session cookie on the OAuth callback — the cookie would land in
 * Chrome and the WebView would still be signed out. Instead:
 *
 *   1. We open /api/auth/{provider}?mobile=1 in a Custom Tab.
 *   2. The backend correlates provider state in that browser session.
 *   3. On callback, the backend creates a fresh server-random one-time
 *      ticket and redirects only through rizzoma://auth-callback.
 *   4. The appUrlOpen handler POSTs that returned ticket to
 *      /api/auth/redeem-ticket from inside the WebView; the
 *      response's Set-Cookie lands in the WebView's cookie jar.
 *   5. We reload to /?layout=rizzoma and the app shows the user as
 *      signed in on the first subsequent /api/auth/me call.
 */
export async function launchNativeOAuth(provider: 'google' | 'facebook' | 'microsoft'): Promise<void> {
  if (nativeOAuthCancellationTimer !== undefined) {
    window.clearTimeout(nativeOAuthCancellationTimer);
    nativeOAuthCancellationTimer = undefined;
  }
  nativeOAuthCompleted = false;
  const { challenge } = await createNativeVerifier();
  const url = `${window.location.origin}/api/auth/${provider}?mobile=1&challenge=${encodeURIComponent(challenge)}`;

  // Register the finish handler BEFORE opening the tab so we can't
  // miss the event on a fast flow (e.g. an already-signed-in account
  // that silently redirects without any user interaction).
  let finished = false;
  const handle = await Browser.addListener('browserFinished', async () => {
    if (finished) return;
    finished = true;
    try {
      await handle.remove();
    } catch {
      /* handle may already be removed */
    }
    // Capacitor can report browserFinished just before it delivers appUrlOpen
    // for the successful deep link. Give the deep-link channel a bounded
    // grace period; it owns successful completion and cancels this cleanup.
    nativeOAuthCancellationTimer = window.setTimeout(() => {
      nativeOAuthCancellationTimer = undefined;
      if (!nativeOAuthCompleted) clearPendingInvite();
    }, NATIVE_OAUTH_CALLBACK_GRACE_MS);
  });

  try {
    await Browser.open({ url, presentationStyle: 'popover' });
  } catch (err) {
    console.warn('[capacitor] Browser.open failed', err);
    finished = true;
    try {
      await handle.remove();
    } catch {
      /* ignore */
    }
    clearNativeVerifier();
    reportNativeOAuthFailure('Native sign-in could not be opened. Your invitation is preserved; try the provider again.');
  }
}

let nativeOAuthCompleted = false;
let nativeOAuthCancellationTimer: number | undefined;
const NATIVE_OAUTH_CALLBACK_GRACE_MS = 3_000;

async function handleNativeAuthCallback(url: string | undefined): Promise<boolean> {
  if (!url) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'rizzoma:' || parsed.hostname !== 'auth-callback') return false;
  const ticket = parsed.searchParams.get('ticket') || '';
  if (!/^[A-Za-z0-9_-]{24,}$/.test(ticket)) return false;
  nativeOAuthCompleted = true;
  if (nativeOAuthCancellationTimer !== undefined) {
    window.clearTimeout(nativeOAuthCancellationTimer);
    nativeOAuthCancellationTimer = undefined;
  }
  try { await Browser.close(); } catch {}
  await redeemNativeTicket(ticket);
  return true;
}

async function redeemNativeTicket(ticket: string): Promise<void> {
  try {
    const verifier = readNativeVerifier();
    if (!verifier) {
      console.warn('[capacitor] native OAuth verifier missing or expired');
      reportNativeOAuthFailure('Native sign-in expired before completion. Try the provider again.');
      return;
    }
    const res = await fetch('/api/auth/redeem-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ticket, verifier }),
    });
    if (!res.ok) {
      console.warn('[capacitor] ticket redemption failed', res.status);
      reportNativeOAuthFailure('Native sign-in could not be completed. Your invitation is preserved; try the provider again.');
      return;
    }
    clearNativeVerifier();
    // Reload into the authed app shell so React's bootstrap sees
    // the new session cookie on its first /api/auth/me call.
    window.location.replace('/?layout=rizzoma');
  } catch (err) {
    console.warn('[capacitor] ticket redemption error', err);
    reportNativeOAuthFailure('Native sign-in could not be completed. Check your connection and try again.');
  }
}

/** Short platform string: 'ios', 'android', or 'web'. */
export const nativePlatform = Capacitor.getPlatform();

/**
 * One-shot initialization. Safe to call on web — it's a no-op outside
 * Capacitor.
 */
export async function initCapacitorNativeShell(): Promise<void> {
  if (!isNative) return;

  try {
    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      void handleNativeAuthCallback(url);
    });
    const launch = await CapacitorApp.getLaunchUrl();
    await handleNativeAuthCallback(launch?.url);
  } catch (err) {
    console.warn('[capacitor] auth callback setup failed', err);
  }

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#2c3e50' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (err) {
    console.warn('[capacitor] StatusBar setup failed', err);
  }

  // Hide splash once the app is ready. SplashScreen is configured with
  // `launchAutoHide: false` in capacitor.config.ts so React controls
  // the handoff — we hide here after the initial module graph runs.
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch (err) {
    console.warn('[capacitor] SplashScreen.hide failed', err);
  }

  // Android hardware back button: close the app when at root, otherwise
  // let the browser's history handle it.
  try {
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });
  } catch (err) {
    console.warn('[capacitor] back button handler failed', err);
  }

  // Refresh auth / unread state when the app returns from background.
  // Dispatches the existing rizzoma:refresh-topics event so topics
  // sidebar + wave unread hook reload without any component changes.
  try {
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
      }
    });
  } catch (err) {
    console.warn('[capacitor] appStateChange listener failed', err);
  }

}
