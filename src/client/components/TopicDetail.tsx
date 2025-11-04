import { useEffect, useState } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { subscribeTopicDetail } from '../lib/socket';
import { toast } from './Toast';

type TopicFull = { id: string; title: string; content?: string; createdAt: number };
type Comment = { id: string; authorId: string; content: string; createdAt: number };

export function TopicDetail({ id, isAuthed = false }: { id: string; isAuthed?: boolean }) {
  const [topic, setTopic] = useState<TopicFull | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState('');
  const [climit, setCLimit] = useState(20);
  const [coffset, setCOffset] = useState(0);
  const [cHasMore, setCHasMore] = useState(false);
  const [cNextBookmark, setCNextBookmark] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rid, setRid] = useState<string | undefined>(undefined);

  const load = async () => {
    const r = await api(`/api/topics/${encodeURIComponent(id)}`);
    if (r.ok) { setTopic(r.data as TopicFull); setError(null); setRid(undefined); }
    const params = new URLSearchParams();
    params.set('limit', String(climit));
    params.set('offset', String(coffset));
    if (cNextBookmark) params.set('bookmark', cNextBookmark);
    const rc = await api(`/api/topics/${encodeURIComponent(id)}/comments?` + params.toString());
    if (rc.ok) {
      setComments((rc.data as any)?.comments || []);
      setCHasMore(Boolean((rc.data as any)?.hasMore));
      setCNextBookmark(((rc.data as any)?.nextBookmark) || undefined);
    }
  };
  useEffect(() => { load(); }, [id, climit, coffset]);
  // realtime: reload on topic/comment changes for this topic
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeTopicDetail(id, () => {
      load();
    });
    return () => unsub();
  }, [id, climit, coffset]);

  const save = async () => {
    if (!topic) return;
    await ensureCsrf();
    setBusy(true);
    const r = await api(`/api/topics/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title: topic.title, content: topic.content || '' }) });
    setBusy(false);
    if (!r.ok) { setError('Save failed'); setRid(r.requestId); toast(`Save failed${r.requestId?` (${r.requestId})`:''}`,'error'); } else { setError(null); setRid(undefined); toast('Topic saved'); }
  };
  const remove = async () => {
    if (!window.confirm('Delete topic?')) return;
    await ensureCsrf();
    setBusy(true);
    const r = await api(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { setError('Delete failed'); setRid(r.requestId); toast(`Delete failed${r.requestId?` (${r.requestId})`:''}`,'error'); } else { setError(null); setRid(undefined); toast('Topic deleted'); }
    window.location.hash = '#/'
  };
  const post = async () => {
    const content = comment.trim();
    if (!content) { setError('Comment required'); return; }
    await ensureCsrf();
    setBusy(true);
    const r = await api(`/api/topics/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
    setBusy(false);
    if (!r.ok) { setError('Failed to post'); setRid(r.requestId); toast(`Comment failed${r.requestId?` (${r.requestId})`:''}`,'error'); return; } else { setError(null); setRid(undefined); toast('Comment posted'); }
    setComment('');
    load();
  };
  const delComment = async (cid: string) => {
    if (!window.confirm('Delete comment?')) return;
    await ensureCsrf();
    setBusy(true);
    const r = await api(`/api/comments/${encodeURIComponent(cid)}`, { method: 'DELETE' });
    setBusy(false);
    if (!r.ok) { setError('Failed to delete'); setRid(r.requestId); toast(`Delete failed${r.requestId?` (${r.requestId})`:''}`,'error'); return; } else { setError(null); setRid(undefined); toast('Comment deleted'); }
    setComments((comments || []).filter((c) => c.id !== cid));
  };

  if (!topic) return <div>Loading...</div>;
  return (
    <section>
      <a href="#/">← Back</a>
      <h2>Edit Topic</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        <input placeholder="title" value={topic.title} onChange={(e) => setTopic({ ...(topic as TopicFull), title: e.target.value })} />
        <textarea placeholder="content" rows={12} value={topic.content || ''} onChange={(e) => setTopic({ ...(topic as TopicFull), content: e.target.value })} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={busy}>Save</button>
          <button onClick={remove} disabled={busy}>Delete</button>
          <button onClick={() => (window.location.hash = '#/')} disabled={busy}>Cancel</button>
        </div>
      </div>
      {error ? (
        <div style={{ color: 'red', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{error}{rid?` (${rid})`:''}</span>
          <button onClick={()=>{ setError(null); setRid(undefined); load(); }} disabled={busy}>Retry</button>
        </div>
      ) : null}
      <div style={{ borderTop: '1px solid #ddd', paddingTop: 12 }}>
        <h3>Comments</h3>
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label>Per page <input style={{ width: 56 }} type="number" min={1} max={100} value={climit} onChange={(e)=>{ setCOffset(0); setCLimit(Math.min(100, Math.max(1, parseInt(e.target.value||'20',10)||20))); }} /></label>
          <button onClick={()=> { setCNextBookmark(undefined); setCOffset(Math.max(0, coffset - climit)); }} disabled={coffset<=0 || busy}>Prev</button>
          <button onClick={()=> { setCOffset(coffset + climit); }} disabled={busy || !cHasMore}>Next</button>
          <span style={{ opacity: 0.7 }}>Showing {comments.length} comment(s) from {coffset} to {coffset + comments.length}</span>
        </div>
        {isAuthed ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input placeholder="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
            <button onClick={post} disabled={busy}>Post</button>
          </div>
        ) : (
          <div style={{ marginBottom: 8, opacity: 0.8 }}>Login to post comments.</div>
        )}
        <ul>
          {comments.map((c) => (
            <li key={c.id}>
              {new Date(c.createdAt).toLocaleString()} — {c.content} {' '}
              <button onClick={() => delComment(c.id)} disabled={busy}>delete</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
