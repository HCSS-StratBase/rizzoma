import { useRef, useCallback, useEffect, type RefObject } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeState {
  /** Direction of the swipe */
  direction: SwipeDirection | null;
  /** Distance swiped in pixels */
  distance: number;
  /** Velocity of the swipe (pixels per ms) */
  velocity: number;
  /** Whether a swipe is in progress */
  isSwiping: boolean;
  /** Starting X position */
  startX: number;
  /** Starting Y position */
  startY: number;
  /** Current X position */
  currentX: number;
  /** Current Y position */
  currentY: number;
}

export interface UseSwipeOptions {
  /** Minimum distance in pixels to trigger a swipe (default: 50) */
  threshold?: number;
  /** Maximum time in ms to complete the swipe (default: 300) */
  timeout?: number;
  /** Directions to detect (default: all) */
  directions?: SwipeDirection[];
  /** Callback when swipe starts */
  onSwipeStart?: (state: SwipeState) => void;
  /** Callback during swipe (for animations) */
  onSwipeMove?: (state: SwipeState) => void;
  /** Callback when swipe ends (successfully or not) */
  onSwipeEnd?: (state: SwipeState, success: boolean) => void;
  /** Callback when a swipe is detected */
  onSwipe?: (direction: SwipeDirection, state: SwipeState) => void;
  /** Prevent default touch behavior */
  preventDefault?: boolean;
  /** Whether the swipe is enabled */
  enabled?: boolean;
}

/**
 * Hook for detecting swipe gestures on an element
 * Uses native TouchEvent API with no dependencies
 */
export function useSwipe<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  options: UseSwipeOptions = {}
): SwipeState {
  const {
    threshold = 50,
    timeout = 300,
    directions = ['left', 'right', 'up', 'down'],
    onSwipeStart,
    onSwipeMove,
    onSwipeEnd,
    onSwipe,
    preventDefault = false,
    enabled = true,
  } = options;

  const stateRef = useRef<SwipeState>({
    direction: null,
    distance: 0,
    velocity: 0,
    isSwiping: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  const startTimeRef = useRef<number>(0);

  const getSwipeDirection = useCallback(
    (deltaX: number, deltaY: number): SwipeDirection | null => {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Determine primary direction
      if (absX > absY) {
        // Horizontal swipe
        if (deltaX > 0 && directions.includes('right')) return 'right';
        if (deltaX < 0 && directions.includes('left')) return 'left';
      } else {
        // Vertical swipe
        if (deltaY > 0 && directions.includes('down')) return 'down';
        if (deltaY < 0 && directions.includes('up')) return 'up';
      }

      return null;
    },
    [directions]
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!enabled) return;

      const touch = event.touches[0];
      startTimeRef.current = Date.now();

      stateRef.current = {
        direction: null,
        distance: 0,
        velocity: 0,
        isSwiping: true,
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
      };

      onSwipeStart?.(stateRef.current);
    },
    [enabled, onSwipeStart]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!enabled || !stateRef.current.isSwiping) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - stateRef.current.startX;
      const deltaY = touch.clientY - stateRef.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const direction = getSwipeDirection(deltaX, deltaY);
      const elapsed = Date.now() - startTimeRef.current;
      const velocity = elapsed > 0 ? distance / elapsed : 0;

      stateRef.current = {
        ...stateRef.current,
        direction,
        distance,
        velocity,
        currentX: touch.clientX,
        currentY: touch.clientY,
      };

      if (preventDefault && direction) {
        event.preventDefault();
      }

      onSwipeMove?.(stateRef.current);
    },
    [enabled, getSwipeDirection, preventDefault, onSwipeMove]
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (!enabled || !stateRef.current.isSwiping) return;

      const elapsed = Date.now() - startTimeRef.current;
      const { direction, distance } = stateRef.current;

      // Check if swipe meets criteria
      const success = direction !== null && distance >= threshold && elapsed <= timeout;

      stateRef.current = {
        ...stateRef.current,
        isSwiping: false,
      };

      onSwipeEnd?.(stateRef.current, success);

      if (success && direction) {
        onSwipe?.(direction, stateRef.current);
      }

      // Reset state after callbacks
      stateRef.current = {
        direction: null,
        distance: 0,
        velocity: 0,
        isSwiping: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
      };
    },
    [enabled, threshold, timeout, onSwipeEnd, onSwipe]
  );

  const handleTouchCancel = useCallback(() => {
    if (!stateRef.current.isSwiping) return;

    stateRef.current = {
      direction: null,
      distance: 0,
      velocity: 0,
      isSwiping: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    };

    onSwipeEnd?.(stateRef.current, false);
  }, [onSwipeEnd]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    // Use passive listeners for better scroll performance
    // except when we need to preventDefault
    const options = preventDefault ? { passive: false } : { passive: true };

    element.addEventListener('touchstart', handleTouchStart, options);
    element.addEventListener('touchmove', handleTouchMove, options);
    element.addEventListener('touchend', handleTouchEnd, options);
    element.addEventListener('touchcancel', handleTouchCancel, options);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [
    ref,
    enabled,
    preventDefault,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  ]);

  return stateRef.current;
}

/**
 * Simplified hook for horizontal swipe navigation
 */
export function useHorizontalSwipe(
  ref: RefObject<HTMLElement>,
  options: {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    threshold?: number;
    enabled?: boolean;
  } = {}
): void {
  const { onSwipeLeft, onSwipeRight, threshold = 50, enabled = true } = options;

  useSwipe(ref, {
    directions: ['left', 'right'],
    threshold,
    enabled,
    onSwipe: (direction) => {
      if (direction === 'left') onSwipeLeft?.();
      if (direction === 'right') onSwipeRight?.();
    },
  });
}

/**
 * Hook for swipe-to-dismiss behavior
 */
export function useSwipeToDismiss(
  ref: RefObject<HTMLElement>,
  options: {
    direction?: 'left' | 'right' | 'down';
    threshold?: number;
    onDismiss: () => void;
    enabled?: boolean;
  }
): { progress: number; isDismissing: boolean } {
  const { direction = 'right', threshold = 100, onDismiss, enabled = true } = options;
  const progressRef = useRef(0);
  const isDismissingRef = useRef(false);

  const swipeState = useSwipe(ref, {
    directions: [direction],
    threshold,
    enabled,
    preventDefault: true,
    onSwipeMove: (state) => {
      // Calculate progress (0 to 1)
      const element = ref.current;
      if (!element) return;

      let delta = 0;
      if (direction === 'right') {
        delta = state.currentX - state.startX;
      } else if (direction === 'left') {
        delta = state.startX - state.currentX;
      } else if (direction === 'down') {
        delta = state.currentY - state.startY;
      }

      const progress = Math.max(0, Math.min(1, delta / threshold));
      progressRef.current = progress;
      isDismissingRef.current = true;

      // Apply transform for visual feedback
      if (direction === 'right' || direction === 'left') {
        const translateX = direction === 'right' ? delta : -delta;
        element.style.transform = `translateX(${translateX}px)`;
        element.style.opacity = `${1 - progress * 0.5}`;
      } else {
        element.style.transform = `translateY(${delta}px)`;
        element.style.opacity = `${1 - progress * 0.5}`;
      }
    },
    onSwipeEnd: (state, success) => {
      const element = ref.current;
      if (!element) return;

      isDismissingRef.current = false;

      if (success) {
        // Complete the dismiss animation
        element.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
        if (direction === 'right') {
          element.style.transform = 'translateX(100%)';
        } else if (direction === 'left') {
          element.style.transform = 'translateX(-100%)';
        } else {
          element.style.transform = 'translateY(100%)';
        }
        element.style.opacity = '0';

        setTimeout(() => {
          onDismiss();
          element.style.transition = '';
          element.style.transform = '';
          element.style.opacity = '';
        }, 200);
      } else {
        // Reset position
        element.style.transition = 'transform 200ms ease-out, opacity 200ms ease-out';
        element.style.transform = '';
        element.style.opacity = '';

        setTimeout(() => {
          element.style.transition = '';
        }, 200);
      }

      progressRef.current = 0;
    },
  });

  return {
    progress: progressRef.current,
    isDismissing: isDismissingRef.current,
  };
}
