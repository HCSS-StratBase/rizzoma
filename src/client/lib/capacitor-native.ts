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

/** True if the page is running inside the Capacitor native shell. */
export const isNative = Capacitor.isNativePlatform();

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
