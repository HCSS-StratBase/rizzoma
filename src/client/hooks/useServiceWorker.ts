import { useState, useEffect, useCallback } from 'react';

export interface ServiceWorkerState {
  /** Whether SW is supported in this browser */
  isSupported: boolean;
  /** Whether SW is registered and active */
  isActive: boolean;
  /** Whether an update is available */
  updateAvailable: boolean;
  /** Registration object if available */
  registration: ServiceWorkerRegistration | null;
  /** Any error that occurred during registration */
  error: Error | null;
  /** Whether the SW is currently installing */
  isInstalling: boolean;
  /** Whether the SW is waiting to activate */
  isWaiting: boolean;
}

export interface UseServiceWorkerOptions {
  /** Path to the service worker file */
  swPath?: string;
  /** Whether to auto-register on mount */
  autoRegister?: boolean;
  /** Callback when update is available */
  onUpdateAvailable?: () => void;
  /** Callback when SW becomes active */
  onActive?: () => void;
  /** Callback on registration error */
  onError?: (error: Error) => void;
}

/**
 * Hook for managing service worker registration and updates
 */
export function useServiceWorker(options: UseServiceWorkerOptions = {}): ServiceWorkerState & {
  register: () => Promise<void>;
  update: () => Promise<void>;
  skipWaiting: () => void;
  clearCache: () => void;
} {
  const {
    swPath = '/sw.js',
    autoRegister = true,
    onUpdateAvailable,
    onActive,
    onError,
  } = options;

  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    isActive: false,
    updateAvailable: false,
    registration: null,
    error: null,
    isInstalling: false,
    isWaiting: false,
  });

  /**
   * Register the service worker
   */
  const register = useCallback(async () => {
    if (!state.isSupported) {
      console.log('[SW Hook] Service workers not supported');
      return;
    }

    try {
      // TEMP: Skip SW registration during dev to avoid stale code caching
      if (import.meta.env['DEV']) {
        console.log('[SW Hook] Skipping SW registration in dev mode');
        return;
      }
      console.log('[SW Hook] Registering service worker...');
      const registration = await navigator.serviceWorker.register(swPath, {
        scope: '/',
      });

      console.log('[SW Hook] Service worker registered:', registration);

      setState((prev) => ({
        ...prev,
        registration,
        isActive: !!registration.active,
        isInstalling: !!registration.installing,
        isWaiting: !!registration.waiting,
      }));

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        console.log('[SW Hook] Update found, installing...');
        setState((prev) => ({ ...prev, isInstalling: true }));

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New SW installed while old one is still active
              console.log('[SW Hook] Update available');
              setState((prev) => ({
                ...prev,
                updateAvailable: true,
                isInstalling: false,
                isWaiting: true,
              }));
              onUpdateAvailable?.();
            } else {
              // First install
              console.log('[SW Hook] First install complete');
              setState((prev) => ({
                ...prev,
                isInstalling: false,
                isActive: true,
              }));
              onActive?.();
            }
          }
        });
      });

      // Check for existing waiting worker
      if (registration.waiting) {
        console.log('[SW Hook] Update already waiting');
        setState((prev) => ({
          ...prev,
          updateAvailable: true,
          isWaiting: true,
        }));
        onUpdateAvailable?.();
      }
    } catch (error) {
      console.error('[SW Hook] Registration failed:', error);
      const err = error instanceof Error ? error : new Error(String(error));
      setState((prev) => ({ ...prev, error: err }));
      onError?.(err);
    }
  }, [state.isSupported, swPath, onUpdateAvailable, onActive, onError]);

  /**
   * Check for updates manually
   */
  const update = useCallback(async () => {
    if (!state.registration) return;

    try {
      console.log('[SW Hook] Checking for updates...');
      await state.registration.update();
    } catch (error) {
      console.error('[SW Hook] Update check failed:', error);
    }
  }, [state.registration]);

  /**
   * Skip waiting and activate the new service worker
   */
  const skipWaiting = useCallback(() => {
    if (!state.registration?.waiting) {
      console.log('[SW Hook] No waiting worker to skip');
      return;
    }

    console.log('[SW Hook] Skipping waiting...');
    state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

    // Reload to get new version
    window.location.reload();
  }, [state.registration]);

  /**
   * Clear all service worker caches
   */
  const clearCache = useCallback(() => {
    if (!state.registration?.active) {
      console.log('[SW Hook] No active worker to clear cache');
      return;
    }

    console.log('[SW Hook] Clearing cache...');
    state.registration.active.postMessage({ type: 'CLEAR_CACHE' });
  }, [state.registration]);

  // Handle controller changes (new SW activated)
  useEffect(() => {
    if (!state.isSupported) return;

    const handleControllerChange = () => {
      console.log('[SW Hook] Controller changed, reloading...');
      // New service worker took control
      setState((prev) => ({
        ...prev,
        isActive: true,
        updateAvailable: false,
        isWaiting: false,
      }));
      onActive?.();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [state.isSupported, onActive]);

  // Auto-register on mount
  useEffect(() => {
    if (autoRegister && state.isSupported && !state.registration) {
      register();
    }
  }, [autoRegister, state.isSupported, state.registration, register]);

  // Periodic update checks (every 60 minutes)
  useEffect(() => {
    if (!state.registration) return;

    const interval = setInterval(() => {
      update();
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [state.registration, update]);

  return {
    ...state,
    register,
    update,
    skipWaiting,
    clearCache,
  };
}

/**
 * Utility to check if we're running as a PWA
 */
export function useIsPWA(): boolean {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Check if running in standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error - iOS Safari specific
      window.navigator.standalone === true;

    setIsPWA(isStandalone);
  }, []);

  return isPWA;
}

/**
 * Hook to detect PWA install prompt availability
 */
export function useInstallPrompt(): {
  canInstall: boolean;
  promptInstall: () => Promise<void>;
} {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 67+ from showing the mini-infobar
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      console.log('[PWA] Install prompt available');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detect when app was installed
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed');
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      console.log('[PWA] No install prompt available');
      return;
    }

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond
    const { outcome } = await deferredPrompt.userChoice;
    console.log('[PWA] Install prompt outcome:', outcome);

    // Clear the deferred prompt
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    canInstall: !!deferredPrompt,
    promptInstall,
  };
}
