import { useEffect, useState } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { subscribeTopicsRefresh } from '../lib/socket';
import { toast } from './Toast';
import { formatTimestamp } from '../lib/format';

type Topic = { id: string; title: string; createdAt: number };

export function TopicsList({ isAuthed = false, initialMy=false, initialLimit=20, initialOffset=0, initialQuery='' }: { isAuthed?: boolean; initialMy?: boolean; initialLimit?: number; initialOffset?: number; initialQuery?: string }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rid, setRid] = useState<string | undefined>(undefined);
  const [myOnly, setMyOnly] = useState(initialMy);
  const [limit, setLimit] = useState(initialLimit);
  const [offset, setOffset] = useState(initialOffset);
  const [query, setQuery] = useState(initialQuery);
  const [hasMore, setHasMore] = useState(false);
  const [nextBookmark, setNextBookmark] = useState<string | undefined>(undefined);
  const [prevBookmarks, setPrevBookmarks] = useState<string[]>([]);

  const refresh = async (useBookmark: string | null | undefined = nextBookmark) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (myOnly) params.set('my', '1');
    if (query) params.set('q', query);
    if (useBookmark) params.set('bookmark', useBookmark);
    const r = await api('/api/topics?' + params.toString());
    if (r.ok) {
      setTopics((r.data as any)?.topics || []);
      setHasMore(Boolean((r.data as any)?.hasMore));
      setNextBookmark(((r.data as any)?.nextBookmark) || undefined);
      setError(null);
      setRid(undefined);
    } else {
      setError('Failed to load topics');
      setRid(r.requestId);
      import('./Toast').then(({ toast }) => toast(`Load failed${r.requestId?` (${r.requestId})`:''}`, 'error'));
    }
  };
  useEffect(() => { refresh(); }, []);
  // realtime updates: refresh on topic events
  useEffect(() => {
    const unsub = subscribeTopicsRefresh(() => {
      refresh();
    });
    return () => unsub();
  }, [myOnly, limit, offset, query]);
  useEffect(() => { refresh(); }, [myOnly, limit, offset, query]);
  // reset bookmarks when filters change (except plain offset)
  useEffect(() => { setNextBookmark(undefined); setPrevBookmarks([]); }, [myOnly, limit, query]);

  // write hash on changes
  useEffect(() => {
    const parts = [] as string[];
    parts.push(`my=${myOnly?1:0}`);
    parts.push(`limit=${limit}`);
    parts.push(`offset=${offset}`);
    if (query) parts.push(`q=${encodeURIComponent(query)}`);
    window.location.hash = `#/` + parts.join('&');
  }, [myOnly, limit, offset, query]);

  const create = async () => {
    setError(null);
    if (!title.trim()) { setError('Title required'); return; }
    await ensureCsrf();
    setBusy(true);
    const r = await api('/api/topics', { method: 'POST', body: JSON.stringify({ title }) });
    setBusy(false);
    if (!r.ok) setError('Create failed'); else { setTitle(''); toast('Topic created'); refresh(); }
  };

  const canPrev = offset > 0;
  const canNext = hasMore; // from server
  return (
    <section>
      <h2>Topics</h2>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label><input type="checkbox" checked={myOnly} onChange={(e) => { setOffset(0); setMyOnly(e.target.checked); }} /> My topics</label>
        <label>Per page <input style={{ width: 56 }} type="number" min={1} max={100} value={limit} onChange={(e)=>{setOffset(0); setLimit(Math.min(100, Math.max(1, parseInt(e.target.value||'20',10)||20)));}} /></label>
        <button onClick={()=> { setNextBookmark(undefined); setPrevBookmarks([]); setOffset(Math.max(0, offset - limit)); }} disabled={!canPrev || busy}>Prev</button>
        <button onClick={()=> { if (nextBookmark) setPrevBookmarks((s)=>[...s, nextBookmark]); setOffset(offset + limit); refresh(nextBookmark); }} disabled={busy || !canNext}>Next</button>
        <span style={{ opacity: 0.7 }}>Showing {topics.length} item(s) from {offset} to {offset + topics.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder="search title/content" value={query} onChange={(e)=>{ setOffset(0); setQuery(e.target.value); }} />
        <button onClick={()=> refresh()} disabled={busy}>Apply</button>
      </div>
      {isAuthed ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button onClick={create} disabled={busy}>Create</button>
          <button onClick={() => refresh()} disabled={busy}>Refresh</button>
        </div>
      ) : (
        <div style={{ marginBottom: 8, opacity: 0.8 }}>Login to create topics. <button onClick={() => refresh()} disabled={busy}>Refresh</button></div>
      )}
      {error ? (
        <div style={{ color: 'red', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{error}{rid?` (${rid})`:''}</span>
          <button onClick={()=>{ setError(null); setRid(undefined); refresh(); }} disabled={busy}>Retry</button>
        </div>
      ) : null}
      <ul>
        {topics.map((t) => (
          <li key={t.id} style={{ padding: 6, borderBottom: '1px solid #eee' }}>
            <span style={{ color: '#555' }}>{formatTimestamp(t.createdAt)}</span>
            <span> – {t.title} </span>
            <a href={`#/topic/${t.id}`}>open</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
