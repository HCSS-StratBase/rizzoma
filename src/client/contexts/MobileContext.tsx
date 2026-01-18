import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useIsTouchDevice,
  useCanHover,
  usePrefersReducedMotion,
  useCurrentBreakpoint,
  useOrientation,
  useViewportSize,
  type BreakpointKey,
} from '../hooks/useMediaQuery';

/**
 * Mobile context value interface
 * Provides responsive state for component decisions
 */
export interface MobileContextValue {
  /** True if viewport < 768px */
  isMobile: boolean;
  /** True if viewport is 768px - 1023px */
  isTablet: boolean;
  /** True if viewport >= 1024px */
  isDesktop: boolean;
  /** True if device has touch capability */
  isTouchDevice: boolean;
  /** True if device supports hover (non-touch) */
  canHover: boolean;
  /** True if user prefers reduced motion */
  prefersReducedMotion: boolean;
  /** Current breakpoint name (xs, sm, md, lg, xl) */
  breakpoint: BreakpointKey;
  /** Current orientation */
  orientation: 'portrait' | 'landscape';
  /** Current viewport dimensions */
  viewport: { width: number; height: number };
  /** Helper: True for mobile or touch tablet */
  shouldUseMobileUI: boolean;
  /** Helper: True for tablet or larger */
  shouldShowSidebar: boolean;
}

const MobileContext = createContext<MobileContextValue | null>(null);

interface MobileProviderProps {
  children: ReactNode;
}

/**
 * Provider component for mobile/responsive context
 * Wrap your app with this to access mobile state throughout
 */
export function MobileProvider({ children }: MobileProviderProps): JSX.Element {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isDesktop = useIsDesktop();
  const isTouchDevice = useIsTouchDevice();
  const canHover = useCanHover();
  const prefersReducedMotion = usePrefersReducedMotion();
  const breakpoint = useCurrentBreakpoint();
  const orientation = useOrientation();
  const viewport = useViewportSize();

  const value = useMemo<MobileContextValue>(() => ({
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    canHover,
    prefersReducedMotion,
    breakpoint,
    orientation,
    viewport,
    // Mobile UI for phones or touch tablets in portrait
    shouldUseMobileUI: isMobile || (isTablet && isTouchDevice && orientation === 'portrait'),
    // Show sidebar on tablet landscape and desktop
    shouldShowSidebar: isDesktop || (isTablet && orientation === 'landscape'),
  }), [
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    canHover,
    prefersReducedMotion,
    breakpoint,
    orientation,
    viewport,
  ]);

  return (
    <MobileContext.Provider value={value}>
      {children}
    </MobileContext.Provider>
  );
}

/**
 * Hook to access mobile context
 * Must be used within a MobileProvider
 */
export function useMobileContext(): MobileContextValue {
  const context = useContext(MobileContext);
  if (!context) {
    throw new Error('useMobileContext must be used within a MobileProvider');
  }
  return context;
}

/**
 * Hook to safely access mobile context (returns null outside provider)
 * Useful for components that might render outside the provider
 */
export function useMobileContextSafe(): MobileContextValue | null {
  return useContext(MobileContext);
}

/**
 * HOC to inject mobile props into class components
 */
export function withMobileContext<P extends object>(
  Component: React.ComponentType<P & MobileContextValue>
): React.FC<Omit<P, keyof MobileContextValue>> {
  return function WithMobileContext(props: Omit<P, keyof MobileContextValue>) {
    const mobileContext = useMobileContext();
    return <Component {...(props as P)} {...mobileContext} />;
  };
}
