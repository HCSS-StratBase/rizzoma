import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shellState = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock('../client/lib/api', () => ({
  api: shellState.api,
  ensureCsrf: vi.fn(async () => 'csrf'),
}));

vi.mock('../client/hooks/useAuth', async () => {
  const React = await import('react');
  return {
    AuthProvider: ({ children, onUserChange }: any) => React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'switch-owner',
          onClick: () => onUserChange?.({ id: 'bob-id', email: 'bob@example.test', name: 'Bob' }),
        },
        'Switch owner',
      ),
      children,
    ),
    useAuth: () => ({ loading: false, logout: vi.fn() }),
  };
});

vi.mock('../client/components/RizzomaLayout', async () => {
  const React = await import('react');
  return {
    RizzomaLayout: ({ user }: { user: { id: string } }) => {
      const [mountedOwner] = React.useState(user.id);
      return React.createElement(
        'div',
        { 'data-testid': 'owner-scoped-layout' },
        `${mountedOwner}->${user.id}`,
      );
    },
  };
});

vi.mock('@mantine/core', () => ({
  MantineProvider: ({ children }: any) => children,
  createTheme: () => ({}),
}));
vi.mock('@shared/featureFlags', () => ({ FEATURES: { FOLLOW_GREEN: false } }));
vi.mock('../client/lib/capacitor-native', () => ({
  initCapacitorNativeShell: vi.fn(async () => undefined),
}));
vi.mock('../client/hooks/useServiceWorker', () => ({
  useServiceWorker: () => ({ skipWaiting: vi.fn() }),
  useInstallPrompt: vi.fn(),
}));
vi.mock('../client/hooks/useOfflineStatus', () => ({ useOfflineToast: vi.fn() }));
vi.mock('../client/hooks/useCollaborationPending', () => ({ useCollaborationUnloadGuard: vi.fn() }));
vi.mock('../client/components/editor/extensions/BlipThreadNode', () => ({
  setupBlipThreadClickHandler: () => () => undefined,
}));
vi.mock('../client/contexts/MobileContext', () => ({
  MobileProvider: ({ children }: any) => children,
}));
vi.mock('../client/lib/socket', () => ({ resetSocketForAuthTransition: vi.fn() }));
vi.mock('../client/lib/fragmentSecrets', () => ({
  clearPendingInvite: vi.fn(),
  readPendingInvite: vi.fn(() => null),
  scrubInviteFragment: vi.fn(() => null),
  scrubOwnerRecoveryFragment: vi.fn(() => null),
  scrubPasswordResetFragment: vi.fn(() => null),
}));
vi.mock('../client/components/AuthPanel', () => ({ AuthPanel: () => null }));
vi.mock('../client/components/AnonymousTopicRoute', () => ({ AnonymousTopicRoute: () => null }));
vi.mock('../client/components/TopicsList', () => ({ TopicsList: () => null }));
vi.mock('../client/components/WavesList', () => ({ WavesList: () => null }));
vi.mock('../client/components/WaveView', () => ({ WaveView: () => null }));
vi.mock('../client/components/RizzomaTopicDetail', () => ({ RizzomaTopicDetail: () => null }));
vi.mock('../client/components/EditorSearch', () => ({ EditorSearch: () => null }));
vi.mock('../client/components/EditorAdmin', () => ({ EditorAdmin: () => null }));
vi.mock('../client/components/GreenNavigation', () => ({ GreenNavigation: () => null }));
vi.mock('../client/components/StatusBar', () => ({ StatusBar: () => null }));
vi.mock('../client/components/Toast', () => ({ Toast: () => null, toast: vi.fn() }));

describe('authenticated shell identity boundary', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    window.history.replaceState(null, '', '/?layout=rizzoma#/');
    shellState.api.mockReset();
    shellState.api.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 'alice-id', email: 'alice@example.test', name: 'Alice' },
    });
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container.remove();
    vi.resetModules();
  });

  it('remounts the production layout on a direct A to B identity replacement', async () => {
    const { App } = await import('../client/main');
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="owner-scoped-layout"]')?.textContent)
      .toBe('alice-id->alice-id');

    await act(async () => {
      (container.querySelector('[data-testid="switch-owner"]') as HTMLButtonElement).click();
    });

    // The mock layout captures its owner only at mount. B->B therefore proves
    // React replaced A's entire layout instance instead of reusing its state.
    expect(container.querySelector('[data-testid="owner-scoped-layout"]')?.textContent)
      .toBe('bob-id->bob-id');
  }, 20_000);
});
