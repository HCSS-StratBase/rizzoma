import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the Rizzoma native wrappers
 * (Android + iOS).
 *
 * CURRENT MODE — remote WebView shell (the default):
 *   The native app is a thin shell around the Tailscale Funnel URL.
 *   The WebView loads the live production build served by `vite
 *   preview` on the desktop, which is the same instance your phone's
 *   browser hits. This means:
 *     - Instant iteration: rebuild web, hard-refresh the app
 *     - Always-fresh content
 *     - Uses the same session cookie jar as the PWA
 *     - Requires network (no offline fallback)
 *
 * Override the remote URL for local dev against a LAN IP or an
 * alternate tunnel:
 *     CAP_SERVER_URL=http://192.168.86.32:3000 npm run cap:sync
 *
 * SWITCH TO BUNDLED MODE (for Play Store / App Store submission):
 *   Set `BUNDLE_ASSETS=1` to drop the `server` block entirely —
 *   Capacitor will then serve `dist/client` from `capacitor://localhost`
 *   and the app works offline (but API calls still need to reach
 *   the backend; bake that into the client build via a compile-time
 *   API_BASE env var before shipping).
 *
 * Bundle ID rationale: `work.hcss.rizzoma` matches the HCSS workspace
 * naming and is DNS-reversed so it's unique on both Apple's and
 * Google's stores.
 */

const DEFAULT_REMOTE_URL = 'https://stephan-office.tail4ee1d0.ts.net';
const bundleOnly = process.env['BUNDLE_ASSETS'] === '1';
const remoteUrl = process.env['CAP_SERVER_URL'] || DEFAULT_REMOTE_URL;

const config: CapacitorConfig = {
  appId: 'work.hcss.rizzoma',
  appName: 'Rizzoma',
  webDir: 'dist/client',
  server: bundleOnly
    ? undefined
    : {
        url: remoteUrl,
        cleartext: false,
        // Every host the WebView is allowed to navigate to in-place.
        // Anything NOT in this list is punted to the system browser,
        // which is catastrophic for OAuth because the resulting
        // session cookie lands in Chrome's jar instead of the
        // WebView's — so the user signs in "successfully" but the
        // Capacitor app still shows the login screen. The 2026-04-14
        // fix explicitly whitelists Google/Facebook/Microsoft OAuth
        // hosts so the entire round-trip stays in-WebView.
        allowNavigation: [
          // Rizzoma's own backend (the Tailscale Funnel)
          'stephan-office.tail4ee1d0.ts.net',
          '*.ts.net',
          // Local / LAN dev overrides
          'localhost',
          '127.0.0.1',
          '192.168.*',
          // Google OAuth + account infrastructure
          'accounts.google.com',
          'www.google.com',
          'oauth2.googleapis.com',
          'www.googleapis.com',
          'ssl.gstatic.com',
          'fonts.gstatic.com',
          'fonts.googleapis.com',
          'lh3.googleusercontent.com',
          // Facebook OAuth
          'www.facebook.com',
          'graph.facebook.com',
          // Microsoft OAuth
          'login.microsoftonline.com',
          'login.live.com',
          'graph.microsoft.com',
        ],
      },
  android: {
    // Android's WebView disables third-party cookies by default. We
    // rely on same-origin session cookies for auth so this flag
    // doesn't matter, but leave it here as documentation for anyone
    // who later needs cross-origin cookies.
    allowMixedContent: false,
    // Override the WebView User-Agent so Google OAuth accepts the
    // request. Google's `disallowed_useragent` policy (error 403)
    // refuses OAuth 2.0 flows from any UA containing the `wv` marker
    // that Android's WebView emits by default. Presenting as regular
    // mobile Chrome bypasses the check. The `Rizzoma/1.0` suffix
    // identifies the app to our own server logs / analytics without
    // triggering Google's detection. 2026-04-14 task #40.
    overrideUserAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Rizzoma/1.0',
  },
  ios: {
    // iOS WebView content inset: let the app handle the status bar
    // padding itself via CSS `env(safe-area-inset-top)` rather than
    // Capacitor's automatic adjustment.
    contentInset: 'always',
    // Same reasoning as Android's overrideUserAgent: iOS WKWebView
    // also identifies itself in a way Google's "disallowed_useragent"
    // policy sometimes rejects. Present as mobile Safari to stay on
    // the safe side of Google's OAuth policy.
    overrideUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Rizzoma/1.0',
  },
};

export default config;
