import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the Rizzoma native wrappers
 * (Android + iOS). The web build in `dist/client` is packaged
 * inside the app shell.
 *
 * Dev mode:
 *   Set `CAP_SERVER_URL` to a Tailscale Funnel or LAN URL to have
 *   the Capacitor WebView load the live dev server instead of the
 *   bundled `dist/client`. Example:
 *     CAP_SERVER_URL=https://stephan-office.tail4ee1d0.ts.net npx cap run android
 *
 * Production mode: leave `CAP_SERVER_URL` unset — Capacitor will
 * serve the files from `dist/client` packaged into the app bundle.
 *
 * Bundle ID rationale: `work.hcss.rizzoma` matches the HCSS workspace
 * naming and is DNS-reversed so it's unique on both Apple's and
 * Google's stores.
 */
const config: CapacitorConfig = {
  appId: 'work.hcss.rizzoma',
  appName: 'Rizzoma',
  webDir: 'dist/client',
  server: process.env['CAP_SERVER_URL']
    ? {
        url: process.env['CAP_SERVER_URL'],
        cleartext: false,
        // Allow navigation to API endpoints that live off the main
        // webview origin (Tailscale Funnel proxies /api/* to the
        // Express backend on :8788, so they share the same host —
        // but declare the hosts explicitly so the WebView's security
        // policy doesn't block them if we ever split them later).
        allowNavigation: [
          'stephan-office.tail4ee1d0.ts.net',
          '*.ts.net',
          'localhost',
        ],
      }
    : undefined,
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
