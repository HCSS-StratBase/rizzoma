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

  it('navigates to first unread blip and marks it read', async () => {
    (FEATURES as any).FOLLOW_GREEN = true;
    const scrollSpy = vi.fn();

    const unreadBlip = document.createElement('div');
    unreadBlip.className = 'rizzoma-blip unread';
    unreadBlip.setAttribute('data-blip-id', 'blip-1');
    (unreadBlip as any).scrollIntoView = scrollSpy;
    document.body.appendChild(unreadBlip);

    const markBlipRead = vi.fn(async () => ({ ok: true }));
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
      markBlipsRead: async () => ({ ok: true }),
    };

    const { container, root } = renderElement(
      <RightToolsPanel isAuthed={true} unreadState={unreadState as WaveUnreadState} />,
    );

    const button = container.querySelector('.follow-the-green-btn') as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('Next');

    // Component auto-navigates on mount, so wait for effects
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // Verify navigation happened (auto-navigate or manual click triggers scroll + markBlipRead)
    expect(scrollSpy).toHaveBeenCalled();
    expect(markBlipRead).toHaveBeenCalledWith('blip-1');

    act(() => root.unmount());
    container.remove();
  });

  it('does nothing when there are no unread blips in the DOM', async () => {
    (FEATURES as any).FOLLOW_GREEN = true;
    const markBlipRead = vi.fn(async () => ({ ok: true }));
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
      markBlipsRead: async () => ({ ok: true }),
    };

    const { container, root } = renderElement(
      <RightToolsPanel isAuthed={true} unreadState={unreadState as WaveUnreadState} />,
    );

    const button = container.querySelector('.follow-the-green-btn') as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(markBlipRead).not.toHaveBeenCalled();
    const status = container.querySelector('.follow-the-green-status');
    expect(status?.textContent).toContain('No unread');
    expect(toast).toHaveBeenCalledWith('No unread blips to follow', 'info');

    act(() => root.unmount());
    container.remove();
  });

  it('surfaces inline status and toast on mark-read failure', async () => {
    (FEATURES as any).FOLLOW_GREEN = true;
    const scrollSpy = vi.fn();
    const unreadBlip = document.createElement('div');
    unreadBlip.className = 'rizzoma-blip unread';
    unreadBlip.setAttribute('data-blip-id', 'blip-2');
    (unreadBlip as any).scrollIntoView = scrollSpy;
    document.body.appendChild(unreadBlip);

    const markBlipRead = vi.fn(async () => ({ ok: false, error: 'forced' }));
    const unreadState: UnreadStateStub = {
      waveId: 'wave-2',
      unreadIds: ['blip-2'],
      unreadSet: new Set(['blip-2']),
      total: 1,
      readCount: 0,
      loading: false,
      error: null,
      version: 1,
      refresh: async () => {},
      markBlipRead,
      markBlipsRead: async () => ({ ok: true }),
    };

    const { container, root } = renderElement(
      <RightToolsPanel isAuthed={true} unreadState={unreadState as WaveUnreadState} />,
    );

    const button = container.querySelector('.follow-the-green-btn') as HTMLButtonElement | null;
    expect(button).toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 10));
    });

    // Component may auto-navigate multiple times on mount/effects
    expect(scrollSpy).toHaveBeenCalled();
    expect(markBlipRead).toHaveBeenCalledWith('blip-2');
    const status = container.querySelector('.follow-the-green-status');
    expect(status?.textContent).toContain('Follow-the-Green failed');
    expect(status?.classList.contains('error')).toBe(true);
    expect(toast).toHaveBeenCalledWith('Follow-the-Green failed, please refresh the wave', 'error');

    act(() => root.unmount());
    container.remove();
  });
});
