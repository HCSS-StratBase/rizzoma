import type { JSX } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyBlipSlot } from '../client/components/blip/LazyBlipSlot';

type ObserverRecord = {
  callback: (entries: Array<{ isIntersecting: boolean }>) => void;
  disconnect: ReturnType<typeof vi.fn>;
};

const observers: ObserverRecord[] = [];
const originalIntersectionObserver = globalThis.IntersectionObserver;

class MockIntersectionObserver {
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly takeRecords = vi.fn(() => []);
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [0];

  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observers.push({ callback, disconnect: this.disconnect });
  }
}

function render(element: JSX.Element): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

describe('client: LazyBlipSlot', () => {
  let mounted: { container: HTMLDivElement; root: Root } | null = null;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    observers.length = 0;
    globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    if (mounted) {
      act(() => mounted?.root.unmount());
      mounted.container.remove();
      mounted = null;
    }
    globalThis.IntersectionObserver = originalIntersectionObserver;
    vi.restoreAllMocks();
  });

  it('keeps an off-screen child lightweight until the observer intersects', () => {
    mounted = render(
      <LazyBlipSlot
        blipId="child-1"
        label="Deferred child"
        hasUnread={false}
        hasChildren={false}
        renderFull={(expandOnMount) => (
          <div data-testid="full-child">expanded:{String(expandOnMount)}</div>
        )}
      />,
    );

    expect(mounted.container.querySelector('[data-testid="lazy-blip-slot"]')).toBeTruthy();
    expect(mounted.container.querySelector('[data-testid="full-child"]')).toBeNull();
    expect(observers).toHaveLength(1);

    act(() => observers[0].callback([{ isIntersecting: true }]));

    expect(mounted.container.querySelector('[data-testid="lazy-blip-slot"]')).toBeNull();
    expect(mounted.container.querySelector('[data-testid="full-child"]')?.textContent).toBe('expanded:false');
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('upgrades and carries expansion intent when its placeholder is clicked', () => {
    const onExpand = vi.fn();
    mounted = render(
      <LazyBlipSlot
        blipId="child-2"
        label="Clickable child"
        hasUnread
        hasChildren
        onExpand={onExpand}
        renderFull={(expandOnMount) => (
          <div data-testid="full-child">expanded:{String(expandOnMount)}</div>
        )}
      />,
    );

    const row = mounted.container.querySelector('.lazy-blip-collapsed');
    expect(row).toBeTruthy();
    act(() => row?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onExpand).toHaveBeenCalledWith('child-2');
    expect(mounted.container.querySelector('[data-testid="full-child"]')?.textContent).toBe('expanded:true');
  });
});
