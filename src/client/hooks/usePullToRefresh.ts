import { useRef, useCallback, useEffect, useState, type RefObject } from 'react';

export interface PullToRefreshState {
  /** Whether the user is currently pulling */
  isPulling: boolean;
  /** Whether the refresh threshold has been reached */
  isTriggered: boolean;
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean;
  /** Current pull distance in pixels */
  pullDistance: number;
  /** Progress from 0 to 1 (1 = threshold reached) */
  progress: number;
}

export interface UsePullToRefreshOptions {
  /** Distance in pixels required to trigger refresh (default: 80) */
  threshold?: number;
  /** Maximum pull distance (default: 150) */
  maxPull?: number;
  /** Resistance factor for over-pull (default: 2.5) */
  resistance?: number;
  /** Callback when refresh is triggered */
  onRefresh: () => Promise<void>;
  /** Whether pull-to-refresh is enabled */
  enabled?: boolean;
  /** Callback during pull for custom UI updates */
  onPullChange?: (state: PullToRefreshState) => void;
}

/**
 * Hook for implementing pull-to-refresh functionality
 * Uses native TouchEvent API with no dependencies
 */
export function usePullToRefresh<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  options: UsePullToRefreshOptions
): PullToRefreshState {
  const {
    threshold = 80,
    maxPull = 150,
    resistance = 2.5,
    onRefresh,
    enabled = true,
    onPullChange,
  } = options;

  const [state, setState] = useState<PullToRefreshState>({
    isPulling: false,
    isTriggered: false,
    isRefreshing: false,
    pullDistance: 0,
    progress: 0,
  });

  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const isPullingRef = useRef<boolean>(false);
  const indicatorRef = useRef<HTMLDivElement | null>(null);

  // Create or get the pull indicator element
  const getIndicator = useCallback(() => {
    if (indicatorRef.current) return indicatorRef.current;

    const indicator = document.createElement('div');
    indicator.className = 'pull-to-refresh-indicator';
    indicator.innerHTML = `
      <div class="ptr-spinner">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="currentColor"/>
        </svg>
      </div>
      <span class="ptr-text">Pull to refresh</span>
    `;
    indicator.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      transform: translateY(-100%);
      transition: none;
      color: #666;
      font-size: 14px;
      z-index: 100;
    `;

    const parent = ref.current?.parentElement;
    if (parent) {
      parent.style.position = 'relative';
      parent.style.overflow = 'hidden';
      parent.insertBefore(indicator, parent.firstChild);
    }

    indicatorRef.current = indicator;
    return indicator;
  }, [ref]);

  // Update indicator UI
  const updateIndicator = useCallback(
    (pullDistance: number, isRefreshing: boolean) => {
      const indicator = getIndicator();
      if (!indicator) return;

      const progress = Math.min(pullDistance / threshold, 1);
      const isTriggered = pullDistance >= threshold;

      // Update transform
      const translateY = Math.min(pullDistance, maxPull) - indicator.offsetHeight;
      indicator.style.transform = `translateY(${Math.max(translateY, -indicator.offsetHeight)}px)`;

      // Update spinner rotation
      const spinner = indicator.querySelector('.ptr-spinner') as HTMLElement;
      if (spinner) {
        spinner.style.transform = `rotate(${progress * 180}deg)`;
        if (isRefreshing) {
          spinner.style.animation = 'ptr-spin 1s linear infinite';
        } else {
          spinner.style.animation = '';
        }
      }

      // Update text
      const text = indicator.querySelector('.ptr-text') as HTMLElement;
      if (text) {
        if (isRefreshing) {
          text.textContent = 'Refreshing...';
        } else if (isTriggered) {
          text.textContent = 'Release to refresh';
        } else {
          text.textContent = 'Pull to refresh';
        }
      }

      // Update opacity based on progress
      indicator.style.opacity = String(Math.min(progress * 2, 1));
    },
    [getIndicator, threshold, maxPull]
  );

  // Check if element is at top of scroll
  const isAtTop = useCallback(() => {
    const element = ref.current;
    if (!element) return false;
    return element.scrollTop <= 0;
  }, [ref]);

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!enabled || state.isRefreshing) return;
      if (!isAtTop()) return;

      startYRef.current = event.touches[0].clientY;
      currentYRef.current = startYRef.current;
      isPullingRef.current = false;
    },
    [enabled, state.isRefreshing, isAtTop]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!enabled || state.isRefreshing) return;

      const currentY = event.touches[0].clientY;
      const deltaY = currentY - startYRef.current;

      // Only activate if pulling down from top
      if (deltaY > 0 && isAtTop()) {
        // Prevent default scroll behavior
        event.preventDefault();

        isPullingRef.current = true;
        currentYRef.current = currentY;

        // Apply resistance to the pull
        const pullDistance = deltaY / resistance;
        const cappedPull = Math.min(pullDistance, maxPull);
        const progress = Math.min(cappedPull / threshold, 1);
        const isTriggered = cappedPull >= threshold;

        const newState: PullToRefreshState = {
          isPulling: true,
          isTriggered,
          isRefreshing: false,
          pullDistance: cappedPull,
          progress,
        };

        setState(newState);
        updateIndicator(cappedPull, false);
        onPullChange?.(newState);

        // Apply transform to scrollable element
        const element = ref.current;
        if (element) {
          element.style.transform = `translateY(${cappedPull}px)`;
          element.style.transition = 'none';
        }
      }
    },
    [enabled, state.isRefreshing, isAtTop, resistance, maxPull, threshold, updateIndicator, onPullChange, ref]
  );

  const handleTouchEnd = useCallback(async () => {
    if (!isPullingRef.current || state.isRefreshing) return;

    const element = ref.current;
    const wasTriggered = state.isTriggered;

    if (wasTriggered) {
      // Trigger refresh
      const refreshingState: PullToRefreshState = {
        isPulling: false,
        isTriggered: true,
        isRefreshing: true,
        pullDistance: threshold,
        progress: 1,
      };

      setState(refreshingState);
      onPullChange?.(refreshingState);

      // Keep element pulled down during refresh
      if (element) {
        element.style.transform = `translateY(${threshold}px)`;
        element.style.transition = 'transform 200ms ease-out';
      }
      updateIndicator(threshold, true);

      try {
        await onRefresh();
      } catch (error) {
        console.error('Pull-to-refresh error:', error);
      }
    }

    // Reset state
    const resetState: PullToRefreshState = {
      isPulling: false,
      isTriggered: false,
      isRefreshing: false,
      pullDistance: 0,
      progress: 0,
    };

    setState(resetState);
    onPullChange?.(resetState);

    // Animate back
    if (element) {
      element.style.transform = '';
      element.style.transition = 'transform 200ms ease-out';
      setTimeout(() => {
        element.style.transition = '';
      }, 200);
    }
    updateIndicator(0, false);

    isPullingRef.current = false;
  }, [state.isRefreshing, state.isTriggered, threshold, onRefresh, onPullChange, ref, updateIndicator]);

  // Add touch event listeners
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [ref, enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);

  // Inject CSS for spinner animation
  useEffect(() => {
    const styleId = 'ptr-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes ptr-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .pull-to-refresh-indicator {
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  // Cleanup indicator on unmount
  useEffect(() => {
    return () => {
      if (indicatorRef.current) {
        indicatorRef.current.remove();
        indicatorRef.current = null;
      }
    };
  }, []);

  return state;
}

/**
 * Simple hook that just returns a refresh callback wrapper
 * For simpler use cases where you don't need the full state
 */
export function useSimplePullToRefresh(
  ref: RefObject<HTMLElement>,
  onRefresh: () => Promise<void>,
  enabled: boolean = true
): { isRefreshing: boolean } {
  const state = usePullToRefresh(ref, {
    onRefresh,
    enabled,
  });

  return { isRefreshing: state.isRefreshing };
}
