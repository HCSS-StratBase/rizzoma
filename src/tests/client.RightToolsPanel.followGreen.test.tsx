import type { JSX } from 'react';
import { act } from 'react';
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { RightToolsPanel } from '../client/components/RightToolsPanel';
import { FEATURES } from '@shared/featureFlags';
import type { WaveUnreadState } from '../client/hooks/useWaveUnread';
import { toast } from '../client/components/Toast';

vi.mock('../client/components/Toast', () => ({
  toast: vi.fn(),
}));

type UnreadStateStub = Pick<
  WaveUnreadState,
  'waveId' | 'unreadIds' | 'unreadSet' | 'total' | 'readCount' | 'loading' | 'error' | 'version' | 'refresh' | 'markBlipRead' | 'markBlipsRead'
>;

function renderElement(element: JSX.Element): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe('client: RightToolsPanel Follow-the-Green', () => {
  const originalFollowGreen = FEATURES.FOLLOW_GREEN;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.resetAllMocks();
    (FEATURES as any).FOLLOW_GREEN = originalFollowGreen;
  });

  it('navigates to first unread blip and marks it read', () => {
    (FEATURES as any).FOLLOW_GREEN = true;
    const scrollSpy = vi.fn();

    const unreadBlip = document.createElement('div');
    unreadBlip.className = 'rizzoma-blip unread';
    unreadBlip.setAttribute('data-blip-id', 'blip-1');
    (unreadBlip as any).scrollIntoView = scrollSpy;
    document.body.appendChild(unreadBlip);

    const markBlipRead = vi.fn(async () => {});
    const unreadState: UnreadStateStub = {
      waveId: 'wave-1',
      unreadIds: ['blip-1'],
      unreadSet: new Set(['blip-1']),
      total: 1,
      readCount: 0,
      loading: false,
      error: null,
      version: 1,
      refresh: async () => {},
      markBlipRead,
      markBlipsRead: async () => {},
    };

    const { container, root } = renderElement(
      <RightToolsPanel isAuthed={true} unreadState={unreadState as WaveUnreadState} />,
    );

    const button = container.querySelector('.follow-the-green-btn') as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('Next');
    expect(button?.textContent).toContain('1');

    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(markBlipRead).toHaveBeenCalledWith('blip-1');

    act(() => root.unmount());
    container.remove();
  });

  it('does nothing when there are no unread blips in the DOM', () => {
    (FEATURES as any).FOLLOW_GREEN = true;
    const markBlipRead = vi.fn(async () => {});
    const unreadState: UnreadStateStub = {
      waveId: 'wave-1',
      unreadIds: ['blip-1'],
      unreadSet: new Set(['blip-1']),
      total: 1,
      readCount: 0,
      loading: false,
      error: null,
      version: 1,
      refresh: async () => {},
      markBlipRead,
      markBlipsRead: async () => {},
    };

    const { container, root } = renderElement(
      <RightToolsPanel isAuthed={true} unreadState={unreadState as WaveUnreadState} />,
    );

    const button = container.querySelector('.follow-the-green-btn') as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(markBlipRead).not.toHaveBeenCalled();
    const status = container.querySelector('.follow-the-green-status');
    expect(status?.textContent).toContain('No unread');
    expect(toast).toHaveBeenCalledWith('No unread blips to follow', 'info');

    act(() => root.unmount());
    container.remove();
  });
});
