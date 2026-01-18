import { useState, useEffect } from 'react';

/**
 * Standard breakpoint values matching breakpoints.css
 */
export const BREAKPOINTS = {
  xs: 320,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1200,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

/**
 * Low-level hook for custom media queries
 * @param query - Media query string (e.g., '(min-width: 768px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQueryList = window.matchMedia(query);

    // Set initial value
    setMatches(mediaQueryList.matches);

    // Handler for changes
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Modern browsers
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', handleChange);
      return () => mediaQueryList.removeEventListener('change', handleChange);
    }

    // Fallback for older browsers
    mediaQueryList.addListener(handleChange);
    return () => mediaQueryList.removeListener(handleChange);
  }, [query]);

  return matches;
}

/**
 * Hook to check if viewport is at or above a specific breakpoint
 * @param breakpoint - Breakpoint key (xs, sm, md, lg, xl)
 * @returns boolean indicating if viewport >= breakpoint
 */
export function useBreakpoint(breakpoint: BreakpointKey): boolean {
  const query = `(min-width: ${BREAKPOINTS[breakpoint]}px)`;
  return useMediaQuery(query);
}

/**
 * Hook to check if viewport is below a specific breakpoint
 * @param breakpoint - Breakpoint key (xs, sm, md, lg, xl)
 * @returns boolean indicating if viewport < breakpoint
 */
export function useBreakpointDown(breakpoint: BreakpointKey): boolean {
  const query = `(max-width: ${BREAKPOINTS[breakpoint] - 1}px)`;
  return useMediaQuery(query);
}

/**
 * Hook to check if viewport is between two breakpoints
 * @param min - Minimum breakpoint (inclusive)
 * @param max - Maximum breakpoint (exclusive)
 * @returns boolean indicating if min <= viewport < max
 */
export function useBreakpointBetween(min: BreakpointKey, max: BreakpointKey): boolean {
  const query = `(min-width: ${BREAKPOINTS[min]}px) and (max-width: ${BREAKPOINTS[max] - 1}px)`;
  return useMediaQuery(query);
}

/**
 * Hook for mobile device detection (< 768px)
 */
export function useIsMobile(): boolean {
  return useBreakpointDown('md');
}

/**
 * Hook for tablet detection (768px - 1023px)
 */
export function useIsTablet(): boolean {
  return useBreakpointBetween('md', 'lg');
}

/**
 * Hook for desktop detection (>= 1024px)
 */
export function useIsDesktop(): boolean {
  return useBreakpoint('lg');
}

/**
 * Hook for touch device detection
 * Checks both media query and navigator capabilities
 */
export function useIsTouchDevice(): boolean {
  const hasCoarsePointer = useMediaQuery('(pointer: coarse)');
  const [hasTouchCapability, setHasTouchCapability] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasTouch =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      // @ts-expect-error - msMaxTouchPoints exists on older IE
      navigator.msMaxTouchPoints > 0;

    setHasTouchCapability(hasTouch);
  }, []);

  return hasCoarsePointer || hasTouchCapability;
}

/**
 * Hook for hover capability detection
 * Returns false for touch-only devices
 */
export function useCanHover(): boolean {
  return useMediaQuery('(hover: hover)');
}

/**
 * Hook for reduced motion preference
 */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Hook for dark mode preference
 */
export function usePrefersDarkMode(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}

/**
 * Hook for getting the current breakpoint name
 * @returns Current breakpoint key based on viewport width
 */
export function useCurrentBreakpoint(): BreakpointKey {
  const isXl = useBreakpoint('xl');
  const isLg = useBreakpoint('lg');
  const isMd = useBreakpoint('md');
  const isSm = useBreakpoint('sm');

  if (isXl) return 'xl';
  if (isLg) return 'lg';
  if (isMd) return 'md';
  if (isSm) return 'sm';
  return 'xs';
}

/**
 * Hook for getting viewport dimensions
 * Debounced to prevent excessive re-renders during resize
 */
export function useViewportSize(debounceMs: number = 100): { width: number; height: number } {
  const [size, setSize] = useState<{ width: number; height: number }>(() => {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0 };
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, debounceMs);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [debounceMs]);

  return size;
}

/**
 * Hook for orientation detection
 */
export function useOrientation(): 'portrait' | 'landscape' {
  const isPortrait = useMediaQuery('(orientation: portrait)');
  return isPortrait ? 'portrait' : 'landscape';
}
