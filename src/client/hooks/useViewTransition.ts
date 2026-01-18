import { useCallback, useRef } from 'react';
import { usePrefersReducedMotion } from './useMediaQuery';

/**
 * Check if View Transitions API is supported
 */
export function isViewTransitionSupported(): boolean {
  return (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    typeof document.startViewTransition === 'function'
  );
}

export interface ViewTransitionOptions {
  /** Custom transition name for CSS targeting */
  name?: string;
  /** Whether to skip animation if user prefers reduced motion */
  respectReducedMotion?: boolean;
  /** Callback before the DOM update */
  onBeforeCapture?: () => void;
  /** Callback after the transition completes */
  onComplete?: () => void;
  /** Callback on transition error */
  onError?: (error: Error) => void;
  /** Types for the transition (for CSS targeting) */
  types?: string[];
}

export interface ViewTransitionResult {
  /** Whether the transition was actually animated (vs instant) */
  animated: boolean;
  /** The ViewTransition object if supported */
  transition?: ViewTransition;
}

/**
 * Hook for using the View Transitions API with graceful fallback
 *
 * @example
 * ```tsx
 * const { startTransition } = useViewTransition();
 *
 * const handleNavigation = () => {
 *   startTransition(() => {
 *     setCurrentPage(newPage);
 *   });
 * };
 * ```
 */
export function useViewTransition(options: ViewTransitionOptions = {}): {
  /** Start a view transition with a DOM update callback */
  startTransition: (updateCallback: () => void | Promise<void>) => Promise<ViewTransitionResult>;
  /** Whether view transitions are supported */
  isSupported: boolean;
  /** Whether the current transition is in progress */
  isTransitioning: boolean;
} {
  const {
    respectReducedMotion = true,
    onBeforeCapture,
    onComplete,
    onError,
    types,
  } = options;

  const prefersReducedMotion = usePrefersReducedMotion();
  const isTransitioningRef = useRef(false);

  const isSupported = isViewTransitionSupported();

  const startTransition = useCallback(
    async (updateCallback: () => void | Promise<void>): Promise<ViewTransitionResult> => {
      // Skip animation if reduced motion is preferred
      if (respectReducedMotion && prefersReducedMotion) {
        await updateCallback();
        return { animated: false };
      }

      // Fallback for unsupported browsers
      if (!isSupported) {
        await updateCallback();
        return { animated: false };
      }

      // Prevent overlapping transitions
      if (isTransitioningRef.current) {
        await updateCallback();
        return { animated: false };
      }

      try {
        isTransitioningRef.current = true;
        onBeforeCapture?.();

        // Start the view transition
        const transition = document.startViewTransition(async () => {
          await updateCallback();
        });

        // Set transition types if provided
        if (types && 'types' in transition) {
          types.forEach((type) => {
            (transition as any).types.add(type);
          });
        }

        // Wait for transition to complete
        await transition.finished;

        onComplete?.();

        return { animated: true, transition };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('[ViewTransition] Error:', err);
        onError?.(err);
        return { animated: false };
      } finally {
        isTransitioningRef.current = false;
      }
    },
    [isSupported, prefersReducedMotion, respectReducedMotion, onBeforeCapture, onComplete, onError, types]
  );

  return {
    startTransition,
    isSupported,
    isTransitioning: isTransitioningRef.current,
  };
}

/**
 * Hook for navigation transitions with slide animations
 */
export function useNavigationTransition(options: {
  direction?: 'forward' | 'back';
  onNavigate: (to: string) => void;
} = { onNavigate: () => {} }): {
  navigate: (to: string, direction?: 'forward' | 'back') => Promise<void>;
} {
  const { onNavigate, direction: defaultDirection = 'forward' } = options;

  const { startTransition, isSupported } = useViewTransition({
    onBeforeCapture: () => {
      // Add direction class for CSS targeting
      document.documentElement.dataset.navDirection = defaultDirection;
    },
    onComplete: () => {
      delete document.documentElement.dataset.navDirection;
    },
  });

  const navigate = useCallback(
    async (to: string, direction: 'forward' | 'back' = defaultDirection) => {
      if (isSupported) {
        document.documentElement.dataset.navDirection = direction;
      }

      await startTransition(() => {
        onNavigate(to);
      });
    },
    [startTransition, onNavigate, defaultDirection, isSupported]
  );

  return { navigate };
}

/**
 * Hook for cross-fade transitions
 */
export function useCrossFadeTransition(): {
  crossFade: (updateCallback: () => void | Promise<void>) => Promise<void>;
} {
  const { startTransition } = useViewTransition({
    types: ['crossfade'],
  });

  const crossFade = useCallback(
    async (updateCallback: () => void | Promise<void>) => {
      await startTransition(updateCallback);
    },
    [startTransition]
  );

  return { crossFade };
}

/**
 * Utility to set view-transition-name on an element temporarily
 */
export function withTransitionName<T>(
  element: HTMLElement | null,
  name: string,
  callback: () => T
): T {
  if (!element) return callback();

  const originalName = element.style.viewTransitionName;
  element.style.viewTransitionName = name;

  try {
    return callback();
  } finally {
    // Reset after a tick to ensure transition has captured
    requestAnimationFrame(() => {
      element.style.viewTransitionName = originalName;
    });
  }
}

/**
 * Hook for element-specific transitions
 */
export function useElementTransition(
  elementId: string
): {
  transition: (updateCallback: () => void | Promise<void>) => Promise<void>;
} {
  const { startTransition } = useViewTransition();

  const transition = useCallback(
    async (updateCallback: () => void | Promise<void>) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.style.viewTransitionName = elementId;
      }

      await startTransition(async () => {
        await updateCallback();
        // Reset the name after DOM update
        requestAnimationFrame(() => {
          if (element) {
            element.style.viewTransitionName = '';
          }
        });
      });
    },
    [startTransition, elementId]
  );

  return { transition };
}
