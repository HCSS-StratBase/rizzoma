import type { JSX } from 'react';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from '../client/components/mobile/BottomSheet';
import { useHorizontalSwipe } from '../client/hooks/useSwipe';
import { usePullToRefresh } from '../client/hooks/usePullToRefresh';
import { useIsDesktop, useIsMobile, useIsTablet, useCurrentBreakpoint } from '../client/hooks/useMediaQuery';
import { useViewTransition } from '../client/hooks/useViewTransition';
import { OfflineQueueManager } from '../client/lib/offlineQueue';

function renderElement(element: JSX.Element): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function renderHook<T>(hook: () => T): { getValue: () => T; root: Root; container: HTMLDivElement } {
  let value!: T;
  function Harness(): JSX.Element | null {
    value = hook();
    return null;
  }
  const { container, root } = renderElement(<Harness />);
  return { getValue: () => value, root, container };
}

function installMatchMedia(width: number, options: {
  pointer?: 'coarse' | 'fine';
  hover?: boolean;
  reducedMotion?: boolean;
  orientation?: 'portrait' | 'landscape';
} = {}): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: matchesQuery(query, width, options),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function matchesQuery(query: string, width: number, options: {
  pointer?: 'coarse' | 'fine';
  hover?: boolean;
  reducedMotion?: boolean;
  orientation?: 'portrait' | 'landscape';
}): boolean {
  const min = /min-width:\s*(\d+)px/.exec(query)?.[1];
  const max = /max-width:\s*(\d+)px/.exec(query)?.[1];
  if (min && width < Number(min)) return false;
  if (max && width > Number(max)) return false;
  if (query.includes('pointer: coarse')) return options.pointer === 'coarse';
  if (query.includes('hover: hover')) return options.hover === true;
  if (query.includes('prefers-reduced-motion: reduce')) return options.reducedMotion === true;
  if (query.includes('orientation: portrait')) return (options.orientation || 'portrait') === 'portrait';
  return Boolean(min || max);
}

function dispatchTouch(target: Element, type: string, x: number, y: number): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touch = { clientX: x, clientY: y };
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [touch] });
  Object.defineProperty(event, 'changedTouches', { value: [touch] });
  target.dispatchEvent(event);
}

describe('client: mobile and PWA runtime coverage', () => {
  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    installMatchMedia(390, { pointer: 'coarse', orientation: 'portrait' });
    localStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useRealTimers();
  });

  it('defines xs/sm/md/lg/xl responsive breakpoints and device detection hooks', async () => {
    const mobile = renderHook(() => ({
      isMobile: useIsMobile(),
      isTablet: useIsTablet(),
      isDesktop: useIsDesktop(),
      breakpoint: useCurrentBreakpoint(),
    }));
    expect(mobile.getValue()).toMatchObject({
      isMobile: true,
      isTablet: false,
      isDesktop: false,
      breakpoint: 'xs',
    });
    act(() => mobile.root.unmount());
    mobile.container.remove();

    installMatchMedia(900, { pointer: 'coarse', orientation: 'portrait' });
    const tablet = renderHook(() => ({
      isMobile: useIsMobile(),
      isTablet: useIsTablet(),
      isDesktop: useIsDesktop(),
      breakpoint: useCurrentBreakpoint(),
    }));
    expect(tablet.getValue()).toMatchObject({
      isMobile: false,
      isTablet: true,
      isDesktop: false,
      breakpoint: 'md',
    });
    act(() => tablet.root.unmount());
    tablet.container.remove();

    installMatchMedia(1280, { pointer: 'fine', hover: true, orientation: 'landscape' });
    const desktop = renderHook(() => ({
      isMobile: useIsMobile(),
      isTablet: useIsTablet(),
      isDesktop: useIsDesktop(),
      breakpoint: useCurrentBreakpoint(),
    }));
    expect(desktop.getValue()).toMatchObject({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      breakpoint: 'xl',
    });
    act(() => desktop.root.unmount());
    desktop.container.remove();
  });

  it('ships a PWA manifest with eight install icons and a service worker with cache-first/network-first strategies', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf8')) as {
      icons: Array<{ sizes: string; purpose?: string }>;
      display: string;
      start_url: string;
    };
    const serviceWorker = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/?layout=rizzoma');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual([
      '72x72',
      '96x96',
      '128x128',
      '144x144',
      '152x152',
      '192x192',
      '384x384',
      '512x512',
    ]);
    expect(manifest.icons.filter((icon) => icon.purpose?.includes('maskable'))).toHaveLength(2);
    expect(serviceWorker).toContain('cacheFirst(event.request, STATIC_CACHE)');
    expect(serviceWorker).toContain('networkFirst(event.request, DYNAMIC_CACHE)');
    expect(serviceWorker).toContain("const API_PATHS = ['/api/', '/socket.io/']");
  });

  it('detects horizontal swipe gestures for panel navigation', async () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    function SwipeHarness(): JSX.Element {
      const ref = useRef<HTMLDivElement>(null);
      useHorizontalSwipe(ref, { onSwipeLeft: onLeft, onSwipeRight: onRight, threshold: 30 });
      return <div ref={ref} data-testid="swipe-surface" />;
    }

    const { container, root } = renderElement(<SwipeHarness />);
    const surface = container.querySelector('[data-testid="swipe-surface"]')!;

    await act(async () => {
      dispatchTouch(surface, 'touchstart', 120, 20);
      dispatchTouch(surface, 'touchmove', 40, 20);
      dispatchTouch(surface, 'touchend', 40, 20);
    });
    expect(onLeft).toHaveBeenCalledTimes(1);

    await act(async () => {
      dispatchTouch(surface, 'touchstart', 40, 20);
      dispatchTouch(surface, 'touchmove', 120, 20);
      dispatchTouch(surface, 'touchend', 120, 20);
    });
    expect(onRight).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });

  it('triggers pull-to-refresh after the configured threshold', async () => {
    const onRefresh = vi.fn(async () => {});
    const onPullChange = vi.fn();
    function PullHarness(): JSX.Element {
      const ref = useRef<HTMLDivElement>(null);
      usePullToRefresh(ref, { threshold: 40, resistance: 1, onRefresh, onPullChange });
      return <div ref={ref} data-testid="pull-surface" style={{ overflow: 'auto' }} />;
    }

    const { container, root } = renderElement(<PullHarness />);
    const surface = container.querySelector('[data-testid="pull-surface"]') as HTMLDivElement;
    Object.defineProperty(surface, 'scrollTop', { configurable: true, value: 0 });

    await act(async () => {
      dispatchTouch(surface, 'touchstart', 10, 10);
      dispatchTouch(surface, 'touchmove', 10, 70);
      await Promise.resolve();
    });
    expect(onPullChange).toHaveBeenCalledWith(expect.objectContaining({
      isPulling: true,
      isTriggered: true,
      progress: 1,
    }));

    await act(async () => {
      dispatchTouch(surface, 'touchend', 10, 70);
      await Promise.resolve();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });

  it('persists offline mutations and retries them up to the configured max', async () => {
    vi.useFakeTimers();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    const queue = new OfflineQueueManager({
      storageKey: 'test-offline-queue',
      fetchFn: fetchFn as unknown as typeof fetch,
      retryDelay: 1,
      maxRetries: 3,
      autoSync: false,
    });

    queue.enqueue({ method: 'PATCH', url: '/api/blips/b1', body: { content: 'offline edit' } });
    expect(JSON.parse(localStorage.getItem('test-offline-queue') || '[]')).toHaveLength(1);

    const syncPromise = queue.sync();
    await vi.runAllTimersAsync();
    const result = await syncPromise;

    expect(result).toEqual({ success: 1, failed: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(queue.length).toBe(0);
  });

  it('falls back from View Transitions API when unsupported', async () => {
    const onComplete = vi.fn();
    const onUpdate = vi.fn();
    const hook = renderHook(() => useViewTransition({ onComplete }));

    let result: { animated: boolean } | undefined;
    await act(async () => {
      result = await hook.getValue().startTransition(onUpdate);
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(result).toEqual({ animated: false });

    act(() => hook.root.unmount());
    hook.container.remove();
  });

  it('opens, dismisses, and keyboard-closes the mobile bottom sheet', async () => {
    const onClose = vi.fn();
    const { container, root } = renderElement(
      <BottomSheet isOpen={true} onClose={onClose} title="Mobile actions" data-testid="sheet">
        <button type="button">Action</button>
      </BottomSheet>,
    );

    expect(document.querySelector('[data-testid="sheet"]')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      (document.querySelector('[data-testid="sheet"]') as HTMLElement).click();
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
    container.remove();
  });
});
