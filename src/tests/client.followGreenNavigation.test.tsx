import type { JSX } from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import { GreenNavigation } from '../client/components/GreenNavigation';
import * as changeTrackingModule from '../client/hooks/useChangeTracking';
import * as authModule from '../client/hooks/useAuth';
import { FEATURES } from '@shared/featureFlags';

type ChangeTrackingApi = ReturnType<typeof changeTrackingModule.useChangeTracking>;

function renderElement(element: JSX.Element): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function ChangeTrackingHarness({
  userId,
  onUpdate,
}: {
  userId: string | null;
  onUpdate: (api: ChangeTrackingApi) => void;
}) {
  const api = changeTrackingModule.useChangeTracking(userId);
  onUpdate(api);
  return null;
}

function mountChangeTracking(userId = 'user-1') {
  let latestApi: ChangeTrackingApi | null = null;
  const handleUpdate = (api: ChangeTrackingApi) => {
    latestApi = api;
  };
  const rendered = renderElement(<ChangeTrackingHarness userId={userId} onUpdate={handleUpdate} />);
  return {
    ...rendered,
    getApi() {
      if (!latestApi) {
        throw new Error('useChangeTracking has not been initialized');
      }
      return latestApi;
    },
  };
}

const originalFollowGreen = FEATURES.FOLLOW_GREEN;

describe('client: Follow-the-Green navigation', () => {
  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    localStorage.clear();
    (FEATURES as Record<string, boolean>).FOLLOW_GREEN = true;
  });

  afterEach(() => {
    (FEATURES as Record<string, boolean>).FOLLOW_GREEN = originalFollowGreen;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('useChangeTracking hook', () => {
    it('tracks unread changes, cycles navigation, and updates read state', () => {
      const mounted = mountChangeTracking();
      const api = () => mounted.getApi();

      expect(api().unreadCount).toBe(0);

      act(() => {
        api().trackChange('blip-a', 1000);
        api().trackChange('blip-b', 2000);
      });

      expect(api().unreadCount).toBe(2);
      expect(api().hasUnreadChanges('blip-a')).toBe(true);
      expect(api().hasUnreadChanges('blip-b')).toBe(true);

      let navigated: string | null = null;
      act(() => {
        navigated = api().goToNextUnread();
      });
      expect(navigated).toBe('blip-a');

      act(() => {
        navigated = api().goToNextUnread();
      });
      expect(navigated).toBe('blip-b');

      const timeSpy = vi.spyOn(Date, 'now');
      timeSpy.mockReturnValue(10000);
      act(() => {
        api().markAsRead('blip-a');
      });

      expect(api().hasUnreadChanges('blip-a')).toBe(false);
      expect(api().hasUnreadChanges('blip-b')).toBe(true);
      expect(api().unreadCount).toBe(1);

      act(() => {
        timeSpy.mockReturnValue(12000);
        api().trackChange('blip-a');
      });

      expect(api().hasUnreadChanges('blip-a')).toBe(true);
      timeSpy.mockRestore();

      act(() => mounted.root.unmount());
      mounted.container.remove();
    });

    it('persists read timestamps and hydrates them on mount', () => {
      const mounted = mountChangeTracking();
      const api = () => mounted.getApi();
      const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(5000);

      act(() => {
        api().trackChange('blip-123', 4000);
      });
      expect(api().hasUnreadChanges('blip-123')).toBe(true);

      act(() => {
        api().markAsRead('blip-123');
      });

      const stored = localStorage.getItem('rizzoma-read-times-user-1');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored || '{}')).toEqual({ 'blip-123': 5000 });

      act(() => mounted.root.unmount());
      mounted.container.remove();

      nowSpy.mockRestore();

      const remounted = mountChangeTracking('user-1');
      const api2 = () => remounted.getApi();

      act(() => {
        api2().trackChange('blip-123', 4500);
      });

      expect(api2().hasUnreadChanges('blip-123')).toBe(false);

      act(() => remounted.root.unmount());
      remounted.container.remove();
    });
  });

  it('renders GreenNavigation button and flashes highlighted blip', () => {
    const goToNextUnread = vi.fn().mockReturnValue('demo');
    const hookStub: ChangeTrackingApi = {
      markAsRead: vi.fn(),
      trackChange: vi.fn(),
      goToNextUnread,
      hasUnreadChanges: vi.fn(),
      getTimeSinceChange: vi.fn(),
      currentHighlight: null,
      unreadCount: 3,
    };
    const changeTrackingSpy = vi
      .spyOn(changeTrackingModule, 'useChangeTracking')
      .mockReturnValue(hookStub);
    const authSpy = vi.spyOn(authModule, 'useAuth').mockReturnValue({
      user: { id: 'user-1', email: 'demo@example.com', name: 'Demo User' },
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const highlightTarget = document.createElement('div');
    highlightTarget.id = 'blip-demo';
    highlightTarget.scrollIntoView = vi.fn() as any;
    document.body.appendChild(highlightTarget);

    vi.useFakeTimers();
    const rendered = renderElement(<GreenNavigation />);
    const button = rendered.container.querySelector('.green-navigation-button');
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('Follow the Green');
    expect(button?.textContent).toContain('3');

    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(goToNextUnread).toHaveBeenCalledTimes(1);
    expect(highlightTarget.classList.contains('blip-highlight-active')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(highlightTarget.classList.contains('blip-highlight-active')).toBe(false);

    act(() => rendered.root.unmount());
    rendered.container.remove();
    highlightTarget.remove();
    changeTrackingSpy.mockRestore();
    authSpy.mockRestore();
  });
});
