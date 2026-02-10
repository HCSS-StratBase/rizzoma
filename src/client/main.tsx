import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { AuthPanel } from './components/AuthPanel';
import { TopicsList } from './components/TopicsList';
import { WavesList } from './components/WavesList';
import { WaveView } from './components/WaveView';
import { Toast } from './components/Toast';
import { StatusBar } from './components/StatusBar';
import { RizzomaTopicDetail } from './components/RizzomaTopicDetail';
import { EditorSearch } from './components/EditorSearch';
import { EditorAdmin } from './components/EditorAdmin';
import { GreenNavigation } from './components/GreenNavigation';
import { RizzomaLayout } from './components/RizzomaLayout';
import { FEATURES } from '@shared/featureFlags';
import { MobileProvider } from './contexts/MobileContext';
import { useServiceWorker, useInstallPrompt } from './hooks/useServiceWorker';
import { useOfflineToast } from './hooks/useOfflineStatus';
import { setupBlipThreadClickHandler } from './components/editor/extensions/BlipThreadNode';
import './RizzomaApp.css';
import './styles/breakpoints.css';
import './styles/view-transitions.css';

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
  const perfMode = (window.location.hash || '').includes('perf=1');
  const [me, setMe] = useState<any>(perfMode ? { id: 'perf-mode' } : null);
  const [error] = useState<string | null>(null);
  const [route, setRoute] = useState<string>(window.location.hash || '#/');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentBlipPath, setCurrentBlipPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Check if we should use Rizzoma layout based on URL parameter
  const params = new URLSearchParams(window.location.search);
  // Default to Rizzoma layout unless explicitly set to 'basic'
  const useRizzomaLayoutParam = params.get('layout') !== 'basic';

  const [checkingAuth, setCheckingAuth] = useState(!perfMode);

  // PWA and offline hooks
  const { skipWaiting } = useServiceWorker({
    onUpdateAvailable: () => {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: 'App update available. Click to refresh.', type: 'info', action: skipWaiting },
      }));
    },
  });
  useInstallPrompt();
  useOfflineToast();

  // Set up BlipThread click handler for inline [+] markers
  useEffect(() => {
    return setupBlipThreadClickHandler();
  }, []);

  // bootstrap auth state
  useEffect(() => {
    if (perfMode) return;
    (async () => {
      try {
        const r = await api('/api/auth/me');
        if (r.ok) setMe(r.data);
      } catch {}
      finally {
        setCheckingAuth(false);
      }
    })();
  }, [perfMode]);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
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

  const forceRizzomaLayout = useRizzomaLayoutParam || route.startsWith('#/topic/') || route.startsWith('#/wave/');

  // Always render the modern Rizzoma shell for topic/wave routes or explicit layout flag
  if (forceRizzomaLayout) {
    return (
      <div className="rizzoma-app">
        {FEATURES.FOLLOW_GREEN && (
          <div className="notification-bar">
            Have your Rizzoma Tasks copied to your Google Calendar automatically.
            <a href="#">Disable extension</a>
          </div>
        )}
        {checkingAuth ? (
          <div className="rizzoma-loading">Loading…</div>
        ) : !me ? (
          <div className="rizzoma-auth-overlay">
            <AuthPanel onSignedIn={(u) => setMe(u)} />
          </div>
        ) : (
          <RizzomaLayout isAuthed={!!me} user={me} />
        )}
        <Toast />
      </div>
    );
  }

  // Default layout
  return (
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
            <button
              onClick={async () => {
                if (!window.confirm('Logout?')) return;
                setBusy(true);
                await api('/api/auth/logout', { method: 'POST' });
                setBusy(false);
                setMe(null);
                window.dispatchEvent(new CustomEvent('toast', { detail: { message: 'Logged out', type: 'info' } }));
              }}
              disabled={busy}
            >
              Logout
            </button>
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
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <MobileProvider>
      <App />
    </MobileProvider>
  );
}

export default App;
