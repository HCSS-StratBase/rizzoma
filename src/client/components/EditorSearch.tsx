import { useState } from 'react';
import { api } from '../lib/api';
import { formatTimestamp } from '../lib/format';

type EditorSearchResult = {
  waveId: string;
  blipId?: string;
  updatedAt?: number;
};

export function EditorSearch() {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(20);
  const [results, setResults] = useState<EditorSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('limit', String(limit));
      const r = await api(`/api/editor/search?${params.toString()}`);
      if (!r.ok) {
        setError(`Search failed (${r.status})`);
        setResults([]);
        return;
      }
      const list = Array.isArray((r.data as any)?.results) ? (r.data as any).results : [];
      setResults(
        list.map((d: any) => ({
          waveId: String(d.waveId),
          blipId: d.blipId ? String(d.blipId) : undefined,
          updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : undefined,
        })),
      );
    } catch (e: any) {
      setError(e?.message || 'Search error');
      setResults([]);
    } finally {
      setBusy(false);
    }
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
            if (e.key === 'Enter') runSearch();
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
        <button onClick={runSearch} disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
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
    </section>
  );
}

