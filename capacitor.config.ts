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
        // Allow navigation to anything under the *.ts.net tailnet so
        // the WebView doesn't refuse to follow OAuth / API redirects
        // that stay on the same origin. Also covers localhost / LAN
        // overrides set via CAP_SERVER_URL.
        allowNavigation: [
          'stephan-office.tail4ee1d0.ts.net',
          '*.ts.net',
          'localhost',
          '127.0.0.1',
          '192.168.*',
        ],
      },
  android: {
    // Android's WebView disables third-party cookies by default. We
    // rely on same-origin session cookies for auth so this flag
    // doesn't matter, but leave it here as documentation for anyone
    // who later needs cross-origin cookies.
    allowMixedContent: false,
  },
  ios: {
    // iOS WebView content inset: let the app handle the status bar
    // padding itself via CSS `env(safe-area-inset-top)` rather than
    // Capacitor's automatic adjustment.
    contentInset: 'always',
  },
};

export default config;
