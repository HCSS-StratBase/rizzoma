import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Wave = { id: string; title: string; createdAt: number };

export function WavesList({ initialLimit = 20, initialOffset = 0, initialQuery = '' }: { initialLimit?: number; initialOffset?: number; initialQuery?: string }) {
  const [waves, setWaves] = useState<Wave[]>([]);
  const [limit, setLimit] = useState(initialLimit);
  const [offset, setOffset] = useState(initialOffset);
  const [query, setQuery] = useState(initialQuery);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (query) params.set('q', query);
    const r = await api('/api/waves?' + params.toString());
    setBusy(false);
    if (r.ok) { setWaves((r.data as any)?.waves || []); setHasMore(Boolean((r.data as any)?.hasMore)); setError(null); }
    else { setError('Failed to load'); }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => { refresh(); }, [limit, offset, query]);

  return (
    <section>
      <h2>Waves</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>Per page <input style={{ width: 56 }} type="number" min={1} max={100} value={limit} onChange={(e)=>{setOffset(0); setLimit(Math.min(100, Math.max(1, parseInt(e.target.value||'20',10)||20)));}} /></label>
        <button onClick={()=> setOffset(Math.max(0, offset - limit))} disabled={offset<=0 || busy}>Prev</button>
        <button onClick={()=> setOffset(offset + limit)} disabled={busy || !hasMore}>Next</button>
        <input placeholder="search title" value={query} onChange={(e)=>{ setOffset(0); setQuery(e.target.value); }} />
        <button onClick={()=> refresh()} disabled={busy}>Apply</button>
      </div>
      {error ? <div style={{ color: 'red', marginBottom: 8 }}>{error}</div> : null}
      <ul>
        {waves.map((w) => (
          <li key={w.id}>
            {new Date(w.createdAt).toLocaleString()} – {w.title} {' '}
            <a href={`#/wave/${w.id}`}>open</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

