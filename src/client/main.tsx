import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { api } from './lib/api';
import { AuthPanel } from './components/AuthPanel';
import { TopicsList } from './components/TopicsList';
import { TopicDetail } from './components/TopicDetail';
import { WavesList } from './components/WavesList';
import { WaveView } from './components/WaveView';
import { Toast } from './components/Toast';
import { StatusBar } from './components/StatusBar';

function App() {
  const [me, setMe] = useState<any>(null);
  const [error] = useState<string | null>(null);
  const [route, setRoute] = useState<string>(window.location.hash || '#/');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // bootstrap auth state
  useEffect(() => {
    (async () => {
      try {
        const r = await api('/api/auth/me');
        if (r.ok) setMe(r.data);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const mTopic = route.match(/^#\/topic\/(.+)$/);
    const mWave = route.match(/^#\/wave\/(.+)$/);
    setCurrentId(mTopic ? (mTopic[1] ?? null) : mWave ? (mWave[1] ?? null) : null);
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

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, maxWidth: 720 }}>
      <h1>Rizzoma (Modern)</h1>
      <p>
        API health: <a href="/api/health" target="_blank" rel="noreferrer">/api/health</a>
      </p>
      <section style={{ marginBottom: 24 }}>
        <AuthPanel onSignedIn={(u) => setMe(u)} />
        {me ? (
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
        ) : null}
        {error ? <div style={{ color: 'red', marginTop: 8 }}>{error}</div> : null}
      </section>

      {route.startsWith('#/waves') && !currentId ? (
        <WavesList />
      ) : route.startsWith('#/wave/') && currentId ? (
        <WaveView id={currentId} />
      ) : route.startsWith('#/topic/') && currentId ? (
        <TopicDetail id={currentId} isAuthed={!!me} />
      ) : (
        <TopicsList isAuthed={!!me} initialMy={listParams.my} initialLimit={listParams.limit} initialOffset={listParams.offset} initialQuery={listParams.q} />
      )}
      <StatusBar me={me} />
      <Toast />
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
