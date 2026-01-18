import { useState } from 'react';
import { api } from '../lib/api';
import { formatTimestamp } from '../lib/format';

type EditorSearchResult = {
  waveId: string;
  blipId?: string;
  updatedAt?: number;
  snippet?: string | null;
};

type EditorSearchApiResponse = {
  results?: Array<{
    waveId?: string;
    blipId?: string;
    updatedAt?: number;
    snippet?: string | null;
  }>;
  nextBookmark?: string | null;
};

type EditorSearchProps = {
  initialResults?: EditorSearchResult[];
  initialBookmark?: string | null;
  initialQuery?: string;
};

export function EditorSearch({ initialResults = [], initialBookmark = null, initialQuery = '' }: EditorSearchProps = {}): JSX.Element {
  const [q, setQ] = useState(initialQuery);
  const [limit, setLimit] = useState(20);
  const [results, setResults] = useState<EditorSearchResult[]>(initialResults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookmark, setBookmark] = useState<string | null>(initialBookmark);
  const [lastQuery, setLastQuery] = useState<string>(initialQuery);

  const runSearch = async (options?: { append?: boolean }): Promise<void> => {
    const baseQuery = q.trim();
    const query = options?.append ? (lastQuery || baseQuery) : baseQuery;
    if (!query) {
      setResults([]);
      setError(null);
      setBookmark(null);
      setLastQuery('');
      return;
    }
    setBusy(true);
    setError(null);
    if (!options?.append) {
      setLastQuery(query);
    }
    try {
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('limit', String(limit));
      if (options?.append && bookmark) {
        params.set('bookmark', bookmark);
      }
      const r = await api(`/api/editor/search?${params.toString()}`);
      if (!r.ok) {
        setError(`Search failed (${r.status})`);
        if (!options?.append) setResults([]);
        return;
      }
      const payload = r.data as EditorSearchApiResponse;
      const raw = Array.isArray(payload.results) ? payload.results : [];
      const mapped = raw.map((item) => ({
        waveId: item.waveId ? String(item.waveId) : '',
        blipId: item.blipId ? String(item.blipId) : undefined,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined,
        snippet: typeof item.snippet === 'string' ? item.snippet : null,
      }));
      setResults((prev) => (options?.append ? [...prev, ...mapped] : mapped));
      setBookmark(payload.nextBookmark ? String(payload.nextBookmark) : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Search error');
      if (!options?.append) setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const handleJump = (href: string) => {
    const target = href.startsWith('#') ? href.slice(1) : href;
    window.location.hash = target;
  };

  return (
    <section>
      <h2>Editor Search</h2>
      <p style={{ maxWidth: 640, fontSize: 14 }}>
        Search editor snapshots by materialized text (behind <code>EDITOR_ENABLE=1</code>). Results link to waves and, when
        possible, focus the matching blip.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <input
          placeholder="search editor text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runSearch();
          }}
        />
        <label>
          Limit{' '}
          <input
            type="number"
            min={1}
            max={100}
            style={{ width: 64 }}
            value={limit}
            onChange={(e) => {
              const n = parseInt(e.target.value || '20', 10) || 20;
              setLimit(Math.min(100, Math.max(1, n)));
            }}
          />
        </label>
        <button onClick={() => { void runSearch(); }} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
        {bookmark ? (
          <button onClick={() => { void runSearch({ append: true }); }} disabled={busy}>
            {busy ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>
      {error ? (
        <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>
      ) : null}
      {results.length > 0 ? (
        <ul>
          {results.map((r, idx) => {
            const href = r.blipId
              ? `#/wave/${encodeURIComponent(r.waveId)}?focus=${encodeURIComponent(r.blipId)}`
              : `#/wave/${encodeURIComponent(r.waveId)}`;
            return (
              <li key={`${r.waveId}:${r.blipId || idx}`} style={{ padding: 6, borderBottom: '1px solid #eee' }}>
                <a href={href}>
                  Wave <code>{r.waveId}</code>
                  {r.blipId ? (
                    <>
                      {' '}
                      — Blip <code>{r.blipId}</code>
                    </>
                  ) : null}
                </a>
                {typeof r.updatedAt === 'number' ? (
                  <span style={{ marginLeft: 8, color: '#555' }}>{formatTimestamp(r.updatedAt)}</span>
                ) : null}
                {r.snippet ? (
                  <div style={{ marginTop: 4, fontSize: 13, color: '#2c3e50' }}>{r.snippet}</div>
                ) : null}
                <div style={{ marginTop: 4 }}>
                  <button onClick={() => handleJump(href)}>
                    {r.blipId ? 'Jump to blip' : 'Open wave'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        !busy &&
        !error && (
          <div style={{ opacity: 0.7, fontSize: 14 }}>No results yet.</div>
        )
      )}
      {!bookmark && results.length > 0 ? (
        <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>No more results.</div>
      ) : null}
    </section>
  );
}
