import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bootState = vi.hoisted(() => ({ api: vi.fn(), toast: vi.fn() }));

vi.mock('../client/lib/api', () => ({
  api: bootState.api,
  ensureCsrf: vi.fn(async () => 'csrf'),
}));
vi.mock('@mantine/core', () => ({
  MantineProvider: ({ children }: any) => children,
  createTheme: () => ({}),
}));
vi.mock('@shared/featureFlags', () => ({ FEATURES: { FOLLOW_GREEN: false } }));
vi.mock('../client/lib/capacitor-native', () => ({
  isNative: false,
  launchNativeOAuth: vi.fn(),
  initCapacitorNativeShell: vi.fn(async () => undefined),
}));
vi.mock('../client/lib/socket', () => ({
  resetSocketForAuthTransition: vi.fn(),
  refreshSocketSession: vi.fn(),
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
vi.mock('../client/contexts/MobileContext', () => ({ MobileProvider: ({ children }: any) => children }));
vi.mock('../client/hooks/useAuth', () => ({
  AuthProvider: ({ children }: any) => children,
  useAuth: () => ({ loading: false, logout: vi.fn() }),
}));
vi.mock('../client/components/AnonymousTopicRoute', () => ({ AnonymousTopicRoute: () => <div data-testid="anonymous-topic" /> }));
vi.mock('../client/components/RizzomaLayout', () => ({ RizzomaLayout: () => <div data-testid="signed-in-layout" /> }));
vi.mock('../client/components/TopicsList', () => ({ TopicsList: () => null }));
vi.mock('../client/components/WavesList', () => ({ WavesList: () => null }));
vi.mock('../client/components/WaveView', () => ({ WaveView: () => null }));
vi.mock('../client/components/RizzomaTopicDetail', () => ({ RizzomaTopicDetail: () => null }));
vi.mock('../client/components/EditorSearch', () => ({ EditorSearch: () => null }));
vi.mock('../client/components/EditorAdmin', () => ({ EditorAdmin: () => null }));
vi.mock('../client/components/GreenNavigation', () => ({ GreenNavigation: () => null }));
vi.mock('../client/components/StatusBar', () => ({ StatusBar: () => null }));
vi.mock('../client/components/Toast', () => ({ Toast: () => null, toast: bootState.toast }));

describe('password reset boot routing', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    window.history.replaceState(null, '', `/?layout=rizzoma#/?passwordReset=${'z'.repeat(43)}`);
    bootState.api.mockReset();
    bootState.api.mockImplementation(async (path: string) => (
      path === '/api/auth/me'
        ? { ok: true, status: 200, data: { id: 'signed-in-user', email: 'signed@example.test' } }
        : path === '/api/auth/oauth-status'
          ? { ok: true, status: 200, data: { google: false, facebook: false, microsoft: false, twitter: false, saml: false } }
          : { ok: true, status: 200, data: {} }
    ));
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container.remove();
    sessionStorage.clear();
    vi.resetModules();
  });

  it('scrubs the bearer at module boot and forces reset UI before a valid existing session can render', async () => {
    const { App } = await import('../client/main');
    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
      await Promise.resolve();
    });

    expect(window.location.href).not.toContain('z'.repeat(43));
    expect(window.location.hash).toBe('#/');
    expect(container.textContent).toContain('Choose a new password');
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="signed-in-layout"]')).toBeNull();
    expect(bootState.api).not.toHaveBeenCalledWith('/api/auth/me');
  }, 20_000);
});
