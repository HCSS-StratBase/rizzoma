import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  browserListeners: new Map<string, (...args: any[]) => any>(),
  appListeners: new Map<string, (...args: any[]) => any>(),
  browserOpen: vi.fn(async () => undefined),
  browserClose: vi.fn(async () => undefined),
  clearPendingInvite: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    addListener: vi.fn(async (name: string, callback: (...args: any[]) => any) => {
      nativeMocks.browserListeners.set(name, callback);
      return { remove: vi.fn(async () => undefined) };
    }),
    open: nativeMocks.browserOpen,
    close: nativeMocks.browserClose,
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((name: string, callback: (...args: any[]) => any) => {
      nativeMocks.appListeners.set(name, callback);
      return Promise.resolve({ remove: vi.fn(async () => undefined) });
    }),
    getLaunchUrl: vi.fn(async () => undefined),
    exitApp: vi.fn(),
  },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: vi.fn(async () => undefined),
    setBackgroundColor: vi.fn(async () => undefined),
    setOverlaysWebView: vi.fn(async () => undefined),
  },
  Style: { Dark: 'DARK' },
}));

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: vi.fn(async () => undefined) },
}));

vi.mock('../client/lib/fragmentSecrets', () => ({
  clearPendingInvite: nativeMocks.clearPendingInvite,
}));

import { initCapacitorNativeShell, launchNativeOAuth } from '../client/lib/capacitor-native';

const callbackUrl = `rizzoma://auth-callback?ticket=${'a'.repeat(32)}`;

async function flushCallback(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('native OAuth callback ordering', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    nativeMocks.browserListeners.clear();
    nativeMocks.appListeners.clear();
    nativeMocks.browserOpen.mockClear();
    nativeMocks.browserClose.mockClear();
    nativeMocks.clearPendingInvite.mockClear();
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await initCapacitorNativeShell();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('preserves the invite when browserFinished arrives before appUrlOpen', async () => {
    await launchNativeOAuth('google');
    expect(nativeMocks.browserOpen).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringMatching(/mobile=1&challenge=[A-Za-z0-9_-]{43}$/),
    }));
    await nativeMocks.browserListeners.get('browserFinished')?.();
    expect(nativeMocks.clearPendingInvite).not.toHaveBeenCalled();

    nativeMocks.appListeners.get('appUrlOpen')?.({ url: callbackUrl });
    await flushCallback();
    await vi.runAllTimersAsync();

    expect(fetch).toHaveBeenCalledWith('/api/auth/redeem-ticket', expect.objectContaining({
      method: 'POST',
      body: expect.stringMatching(/"verifier":"[A-Za-z0-9_-]{43}"/),
    }));
    expect(nativeMocks.clearPendingInvite).not.toHaveBeenCalled();
  });

  it('preserves the invite when appUrlOpen arrives before browserFinished', async () => {
    await launchNativeOAuth('microsoft');
    nativeMocks.appListeners.get('appUrlOpen')?.({ url: callbackUrl });
    await nativeMocks.browserListeners.get('browserFinished')?.();
    await flushCallback();
    await vi.runAllTimersAsync();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(nativeMocks.clearPendingInvite).not.toHaveBeenCalled();
  });

  it('surfaces a retryable error when ticket redemption fails', async () => {
    const toast = vi.fn();
    window.addEventListener('toast', toast);
    await launchNativeOAuth('google');
    nativeMocks.appListeners.get('appUrlOpen')?.({ url: callbackUrl });
    await flushCallback();

    expect(toast).toHaveBeenCalledTimes(1);
    expect((toast.mock.calls[0]?.[0] as CustomEvent).detail.message).toContain('try the provider again');
    expect(nativeMocks.clearPendingInvite).not.toHaveBeenCalled();
    window.removeEventListener('toast', toast);
  });

  it('clears a pending invite only after a finished flow has no callback', async () => {
    await launchNativeOAuth('facebook');
    await nativeMocks.browserListeners.get('browserFinished')?.();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(nativeMocks.clearPendingInvite).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(nativeMocks.clearPendingInvite).toHaveBeenCalledTimes(1);
  });
});
