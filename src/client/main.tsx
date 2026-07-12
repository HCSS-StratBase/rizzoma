import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { api, ensureCsrf } from './lib/api';
import { AuthPanel } from './components/AuthPanel';
import { AnonymousTopicRoute } from './components/AnonymousTopicRoute';
import { TopicsList } from './components/TopicsList';
import { WavesList } from './components/WavesList';
import { WaveView } from './components/WaveView';
import { Toast, toast } from './components/Toast';
import { StatusBar } from './components/StatusBar';
import { RizzomaTopicDetail } from './components/RizzomaTopicDetail';
import { EditorSearch } from './components/EditorSearch';
import { EditorAdmin } from './components/EditorAdmin';
import { GreenNavigation } from './components/GreenNavigation';
import { RizzomaLayout } from './components/RizzomaLayout';
import { FEATURES } from '@shared/featureFlags';
import { MobileProvider } from './contexts/MobileContext';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useCollaborationUnloadGuard } from './hooks/useCollaborationPending';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import '@mantine/charts/styles.css';

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
});

import { useServiceWorker, useInstallPrompt } from './hooks/useServiceWorker';
import { useOfflineToast } from './hooks/useOfflineStatus';
import { setupBlipThreadClickHandler } from './components/editor/extensions/BlipThreadNode';
import { initCapacitorNativeShell } from './lib/capacitor-native';
import { resetSocketForAuthTransition } from './lib/socket';

// Initialize Capacitor native shell (status bar, splash, back button,
// app state listeners). No-op when running in a browser / PWA — the
// same bundle ships to both paths.
initCapacitorNativeShell().catch((err) => {
  // Never crash on init — just log for the native shell debugger.
  console.warn('[capacitor] init failed', err);
});
import './RizzomaApp.css';
import './styles/breakpoints.css';
import './styles/view-transitions.css';
import {
  clearPendingInvite,
  readPendingInvite,
  scrubInviteFragment,
  scrubOwnerRecoveryFragment,
  scrubPasswordResetFragment,
} from './lib/fragmentSecrets';

// OAuth callbacks return to the app without the original fragment. Restore a
// pending invite in this tab before React derives its initial route; fragment
// data never reaches the OAuth provider or web-server logs.
const passwordResetAtBoot = scrubPasswordResetFragment();
const pendingInviteAtBoot = scrubInviteFragment();
scrubOwnerRecoveryFragment();
const oauthErrorAtBoot = new URLSearchParams(window.location.search).has('error');
if (oauthErrorAtBoot) clearPendingInvite();
else if (pendingInviteAtBoot && !window.location.hash.startsWith('#/topic/')) {
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}#/topic/${encodeURIComponent(pendingInviteAtBoot.waveId)}`,
  );
}

const PERF_SKIP_KEY = 'rizzoma:perf:skipSidebarTopics';
const PERF_AUTO_EXPAND_KEY = 'rizzoma:perf:autoExpandRoot';

// In perf mode, short-circuit expensive topic list fetches before any React render
const perfHashEnabled = typeof window !== 'undefined' && (window.location.hash || '').includes('perf=1');
if (perfHashEnabled && typeof window !== 'undefined') {
  try { localStorage.setItem(PERF_SKIP_KEY, '1'); } catch {}
  try {
    localStorage.setItem(PERF_AUTO_EXPAND_KEY, '0');
  } catch {}
  if (!(window as any).__rizzomaPerfFetchPatched) {
    const originalFetch = window.fetch.bind(window);
    (window as any).__rizzomaPerfFetchPatched = true;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === 'string' ? input : (input as any)?.url || '';
      const method = (init?.method || 'GET').toString().toUpperCase();
      const normalizedPath = (() => {
        try { return new URL(rawUrl, window.location.origin).pathname; } catch { return rawUrl; }
      })();
      if (method === 'GET' && normalizedPath === '/api/topics') {
        return new Response(JSON.stringify({ topics: [], hasMore: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(input as any, init);
    };
  }
}

// Preserve layout parameter across navigation
if (new URLSearchParams(window.location.search).get('layout') === 'rizzoma') {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    if (args[2] && typeof args[2] === 'string' && !args[2].includes('?')) {
      args[2] += '?layout=rizzoma';
    }
    return originalPushState(...args);
  };

  history.replaceState = function (...args) {
    if (args[2] && typeof args[2] === 'string' && !args[2].includes('?')) {
      args[2] += '?layout=rizzoma';
    }
    return originalReplaceState(...args);
  };
}

export function App() {
  useCollaborationUnloadGuard();
  const perfMode = (window.location.hash || '').includes('perf=1');
  const [me, setMe] = useState<any>(perfMode ? { id: 'perf-mode' } : null);
  const [passwordResetActive, setPasswordResetActive] = useState(Boolean(passwordResetAtBoot));
  const [error] = useState<string | null>(null);
  const [route, setRoute] = useState<string>(window.location.hash || '#/');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentBlipPath, setCurrentBlipPath] = useState<string | null>(null);
  // Check if we should use Rizzoma layout based on URL parameter
  const params = new URLSearchParams(window.location.search);
  // Default to Rizzoma layout unless explicitly set to 'basic'
  const useRizzomaLayoutParam = params.get('layout') !== 'basic';

  const [checkingAuth, setCheckingAuth] = useState(!perfMode && !passwordResetAtBoot);

  // Calendar-banner dismiss state persisted in localStorage so the
  // yellow "Google Calendar automatically" banner sticks dismissed
  // across reloads. Legacy Rizzoma also had an × on the banner;
  // before this fix the banner was a permanent chrome element with
  // no way to close it besides clicking "Disable extension" (which
  // didn't do anything either).
  const CALENDAR_BANNER_DISMISSED_KEY = 'rizzoma:calendarBannerDismissed';
  const [showCalendarBanner, setShowCalendarBanner] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(CALENDAR_BANNER_DISMISSED_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const dismissCalendarBanner = () => {
    setShowCalendarBanner(false);
    try {
      window.localStorage.setItem(CALENDAR_BANNER_DISMISSED_KEY, '1');
    } catch {
      // Best-effort persist; banner reappears next session if storage blocked.
    }
  };

  // PWA and offline hooks
  const { skipWaiting } = useServiceWorker({
    onUpdateAvailable: () => {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: 'App update available. Click to refresh.', type: 'info', action: skipWaiting },
      }));
    },
  });
  useInstallPrompt();
  // The modern shell owns one reserved-space offline/read-only strip. Avoid a
  // duplicate bottom toast that collides with mobile navigation.
  useOfflineToast({ showOffline: false });

  // Set up BlipThread click handler for inline [+] markers
  useEffect(() => {
    return setupBlipThreadClickHandler();
  }, []);

  // bootstrap auth state
  useEffect(() => {
    if (perfMode || passwordResetActive) return;
    (async () => {
      try {
        const r = await api('/api/auth/me');
        if (r.ok) {
          setMe(r.data);
          // The basic shell can instantiate Socket.IO before auth bootstrap
          // resolves; rotate that guest handshake locally without broadcasting
          // a false cross-tab auth transition.
          resetSocketForAuthTransition();
        }
      } catch {}
      finally {
        setCheckingAuth(false);
      }
    })();
  }, [passwordResetActive, perfMode]);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onAuthChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ authenticated?: boolean }>).detail;
      if (detail?.authenticated === false) setMe(null);
    };
    window.addEventListener('rizzoma:auth-changed', onAuthChanged);
    return () => window.removeEventListener('rizzoma:auth-changed', onAuthChanged);
  }, []);

  useEffect(() => {
    // Match topic with optional blipPath: #/topic/{topicId}/{blipPath}/
    // blipPath can contain multiple segments like "0_b_xxx/0_b_yyy/"
    const mTopicWithBlip = route.match(/^#\/topic\/([^/?]+)\/(.+?)(?:\?.*)?$/);
    const mTopic = route.match(/^#\/topic\/([^/?]+)\/?(?:\?.*)?$/);
    const mWave = route.match(/^#\/wave\/([^?]+)(?:\?.*)?$/);

    if (mTopicWithBlip) {
      // Has blipPath - navigating inside a subblip
      setCurrentId(mTopicWithBlip[1] ?? null);
      setCurrentBlipPath(mTopicWithBlip[2] ?? null);
    } else if (mTopic) {
      // Topic root - no blipPath
      setCurrentId(mTopic[1] ?? null);
      setCurrentBlipPath(null);
    } else if (mWave) {
      setCurrentId(mWave[1] ?? null);
      setCurrentBlipPath(null);
    } else {
      setCurrentId(null);
      setCurrentBlipPath(null);
    }
  }, [route]);

  // Invitation links carry a one-time token in the URL fragment.
  // Redeem only after authentication; a pending participant grants no access
  // until this succeeds and binds the invitation to the signed-in user id.
  useEffect(() => {
    const pendingInvite = readPendingInvite();
    if (!me || !currentId || !pendingInvite || pendingInvite.waveId !== currentId) return;
    let cancelled = false;
    void (async () => {
      const csrfToken = await ensureCsrf();
      let response: { ok: boolean; status: number; data?: unknown };
      try {
        // Bearer redemption stays on the shared API boundary but is explicitly
        // online-only. Persisting this raw token in an offline queue would turn
        // a tab-scoped secret into a durable localStorage credential and could
        // report a synthetic 202 as acceptance.
        response = await api('/api/waves/invitations/accept', {
          method: 'POST',
          queueable: false,
          headers: {
            'content-type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          body: JSON.stringify({ token: pendingInvite.token }),
        });
      } catch {
        response = { ok: false, status: 0 };
      }
      if (cancelled) return;
      if (response.ok) {
        clearPendingInvite();
        window.dispatchEvent(new CustomEvent('rizzoma:access-changed', { detail: { waveId: currentId } }));
      } else {
        if ([400, 404, 410].includes(response.status)) {
          clearPendingInvite();
        }
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: response.status === 403
              ? 'This invitation belongs to another email address. Sign out and switch to the invited account to try again.'
              : [400, 404, 410].includes(response.status)
              ? 'This invitation is invalid, expired, or belongs to another account.'
              : 'The invitation could not be accepted yet. It remains available for another try.',
            type: 'error',
          },
        }));
      }
    })();
    return () => { cancelled = true; };
  }, [me, currentId]);

  // parse hash for list filters and pass as initial props
  const parseListParams = () => {
    const m = (route || '#/').match(/^#\/\/?(.*)$/);
    const qs = (m && m[1]) || '';
    const params = new URLSearchParams(qs);
    return {
      my: params.get('my') === '1',
      limit: Math.min(Math.max(parseInt(String(params.get('limit') || '20'), 10) || 20, 1), 100),
      offset: Math.max(parseInt(String(params.get('offset') || '0'), 10) || 0, 0),
      q: params.get('q') ? decodeURIComponent(params.get('q') as string) : '',
    };
  };
  const listParams = parseListParams();

  const forceRizzomaLayout = passwordResetActive || useRizzomaLayoutParam || route.startsWith('#/topic/') || route.startsWith('#/wave/');
  const anonymousTopicRoute = !me && currentId && route.startsWith('#/topic/');

  // Always render the modern Rizzoma shell for topic/wave routes or explicit layout flag
  if (forceRizzomaLayout) {
    return (
      <AuthProvider user={me} loading={checkingAuth} onUserChange={setMe}>
      <div className="rizzoma-app">
        {FEATURES.FOLLOW_GREEN && showCalendarBanner && (
          <div className="notification-bar">
            <span className="notification-bar-text">
              Have your Rizzoma Tasks copied to your Google Calendar automatically.{' '}
              <a href="#">Disable extension</a>
            </span>
            <button
              type="button"
              className="notification-bar-dismiss"
              aria-label="Dismiss calendar banner"
              title="Dismiss"
              onClick={dismissCalendarBanner}
            >
              ×
            </button>
          </div>
        )}
        {checkingAuth ? (
          <div className="rizzoma-loading">Loading…</div>
        ) : passwordResetActive ? (
          <div className="rizzoma-auth-overlay">
            <AuthPanel
              onSignedIn={(u) => setMe(u)}
              onPasswordResetExit={() => {
                setPasswordResetActive(false);
                setMe(null);
              }}
            />
          </div>
        ) : anonymousTopicRoute ? (
          <AnonymousTopicRoute
            topicId={currentId}
            blipPath={currentBlipPath}
            onSignedIn={(u) => setMe(u)}
          />
        ) : !me ? (
          <div className="rizzoma-auth-overlay">
            <AuthPanel onSignedIn={(u) => setMe(u)} />
          </div>
        ) : (
          <RizzomaLayout isAuthed={!!me} user={me} />
        )}
        <Toast />
      </div>
      </AuthProvider>
    );
  }

  // Default layout
  return (
    <AuthProvider user={me} onUserChange={setMe}>
      <div style={{ fontFamily: 'sans-serif', padding: 16, maxWidth: 720 }}>
        <h1>Rizzoma (Modern)</h1>
        <nav style={{ marginBottom: 12 }}>
          <a href="#/">Topics</a> | <a href="#/waves">Waves</a> | <a href="#/editor/search">Editor search</a> | <a href="#/editor/admin">Editor admin</a>
        </nav>
        <p>
          API health: <a href="/api/health" target="_blank" rel="noreferrer">/api/health</a>
        </p>
        <section style={{ marginBottom: 24 }}>
          {!me ? (
            <AuthPanel onSignedIn={(u) => setMe(u)} />
          ) : (
            <div style={{ marginTop: 8 }}>
              Signed in as {me.email || me.id}
              {' '}
              <BasicLogoutButton />
            </div>
          )}
          {error ? <div style={{ color: 'red', marginTop: 8 }}>{error}</div> : null}
        </section>

        {route.startsWith('#/editor/admin') ? (
          <EditorAdmin />
        ) : route.startsWith('#/editor/search') ? (
          <EditorSearch />
        ) : route.startsWith('#/waves') && !currentId ? (
          <WavesList />
        ) : route.startsWith('#/wave/') && currentId ? (
          <WaveView id={currentId} />
        ) : route.startsWith('#/topic/') && currentId ? (
          <RizzomaTopicDetail id={currentId} blipPath={currentBlipPath} isAuthed={!!me} />
        ) : (
          <TopicsList isAuthed={!!me} initialMy={listParams.my} initialLimit={listParams.limit} initialOffset={listParams.offset} initialQuery={listParams.q} />
        )}
        <StatusBar me={me} />
        <Toast />
        {FEATURES.FOLLOW_GREEN && <GreenNavigation />}
      </div>
    </AuthProvider>
  );
}

function BasicLogoutButton(): JSX.Element {
  const { loading, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        if (!window.confirm('Logout?')) return;
        setBusy(true);
        void logout()
          .then(() => toast('Logged out', 'info'))
          .catch(() => toast('Logout failed. Your session is still active.', 'error'))
          .finally(() => setBusy(false));
      }}
      disabled={busy || loading}
    >
      {busy ? 'Logging out…' : 'Logout'}
    </button>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <MantineProvider theme={theme}>
      <MobileProvider>
        <App />
      </MobileProvider>
    </MantineProvider>
  );
}

export default App;
