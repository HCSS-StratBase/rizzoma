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
 *   1. We generate a random nonce BEFORE opening the tab.
 *   2. We pass ?nonce=<nonce> on the /api/auth/{provider}?mobile=1
 *      URL; the backend bakes it into the Google state parameter.
 *   3. On callback, the backend stores a one-time auth ticket keyed
 *      by the nonce and returns a small HTML page that calls
 *      window.close() — which closes Chrome Custom Tabs and fires
 *      the Capacitor `browserFinished` event.
 *   4. When that event fires, this code POSTs the nonce to
 *      /api/auth/redeem-ticket from inside the WebView; the
 *      response's Set-Cookie lands in the WebView's cookie jar.
 *   5. We reload to /?layout=rizzoma and the app shows the user as
 *      signed in on the first subsequent /api/auth/me call.
 */
export async function launchNativeOAuth(provider: 'google' | 'facebook' | 'microsoft'): Promise<void> {
  const nonce = generateNonce();
  const url = `${window.location.origin}/api/auth/${provider}?mobile=1&nonce=${encodeURIComponent(nonce)}`;

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
    await redeemNonce(nonce);
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
    // Last-resort fallback: a plain navigation. This will trigger
    // the Chromium UA bug and probably fail, but it's better than a
    // silent no-op so the user gets SOME error feedback.
    window.location.href = url;
  }
}

function generateNonce(): string {
  // 32 hex chars of cryptographic randomness; avoids depending on
  // crypto.randomUUID which is not in older TS DOM lib versions.
  const bytes = new Uint8Array(16);
  (globalThis.crypto || (window as any).crypto).getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function redeemNonce(nonce: string): Promise<void> {
  try {
    const res = await fetch('/api/auth/redeem-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ticket: nonce }),
    });
    if (!res.ok) {
      console.warn('[capacitor] ticket redemption failed', res.status);
      return;
    }
    // Reload into the authed app shell so React's bootstrap sees
    // the new session cookie on its first /api/auth/me call.
    window.location.replace('/?layout=rizzoma');
  } catch (err) {
    console.warn('[capacitor] ticket redemption error', err);
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
