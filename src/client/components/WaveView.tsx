import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { subscribeLinks } from '../lib/socket';
import { formatTimestamp } from '../lib/format';
import { BlipContent } from './BlipContent';
import { Editor } from './Editor';

type BlipNode = { id: string; content: string; createdAt: number; children?: BlipNode[] };

// legacy simple tree component was removed (superseded by BlipTreeWithState)

export function WaveView({ id }: { id: string }) {
  const [title, setTitle] = useState<string>('');
  const [blips, setBlips] = useState<BlipNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [unread, setUnread] = useState<string[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [readCount, setReadCount] = useState<number>(0);
  const [current, setCurrent] = useState<string | null>(null);
  useInitCurrentSetter((bid: string) => setCurrent(bid));
  const [linksOut, setLinksOut] = useState<Array<{ toBlipId: string; waveId: string }>>([]);
  const [linksIn, setLinksIn] = useState<Array<{ fromBlipId: string; waveId: string }>>([]);
  const [newLinkTo, setNewLinkTo] = useState<string>('');
  const [showEditor, setShowEditor] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const r = await api(`/api/waves/${encodeURIComponent(id)}`);
      if (!r.ok) { setError('Load failed'); return; }
      const data = r.data as any;
      setTitle(data.title || '');
      setBlips((data.blips as BlipNode[]) || []);
      // load persisted open state
      try {
        const raw = localStorage.getItem(`wave-open:${id}`);
        if (raw) setOpenMap(JSON.parse(raw));
      } catch {}
      // fetch unread list
      try {
        const ur = await api(`/api/waves/${encodeURIComponent(id)}/unread`);
        if (ur.ok) {
          setUnread(((ur.data as any)?.unread || []) as string[]);
          setTotal(Number(((ur.data as any)?.total) || 0));
          setReadCount(Number(((ur.data as any)?.read) || 0));
        }
      } catch {}
      // handle goto=first/last or focus parameter from hash
      try {
        const hash = window.location.hash || '';
        const q = (hash.split('?')[1] || '').trim();
        const params = new URLSearchParams(q);
        const goto = params.get('goto');
        const focus = params.get('focus');
        setTimeout(async () => {
          if (focus) {
            setCurrent(focus);
            expandAll();
            const el = document.querySelector(`[data-blip-id="${CSS.escape(focus)}"]`);
            if (el && 'scrollIntoView' in el) (el as any).scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (goto === 'first') {
            await firstUnread();
          } else if (goto === 'last') {
            await lastUnread();
          }
        }, 80);
      } catch {}
    })();
  }, [id]);

  const persist = (next: Record<string, boolean>) => {
    setOpenMap(next);
    try { localStorage.setItem(`wave-open:${id}`, JSON.stringify(next)); } catch {}
  };
  const expandAll = () => {
    const next: Record<string, boolean> = {};
    const visit = (n: BlipNode) => { next[n.id] = true; (n.children||[]).forEach(visit); };
    blips.forEach(visit);
    persist(next);
  };
  const collapseAll = () => { persist({}); };

  const nextUnread = async () => {
    const nr = await api(`/api/waves/${encodeURIComponent(id)}/next${current ? `?after=${encodeURIComponent(current)}` : ''}`);
    if (!nr.ok || !(nr.data as any)?.next) return;
    const nextId = String((nr.data as any).next);
    setCurrent(nextId);
    // expand path heuristically: mark the parent chain as open (best-effort: open all)
    expandAll();
    // mark as read
    await api(`/api/waves/${encodeURIComponent(id)}/blips/${encodeURIComponent(nextId)}/read`, { method: 'POST' });
    setUnread((u) => u.filter((x) => x !== nextId));
    setReadCount((c) => c + 1);
    // scroll into view
    setTimeout(() => {
      const el = document.querySelector(`[data-blip-id="${CSS.escape(nextId)}"]`);
      if (el && 'scrollIntoView' in el) (el as any).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };
  const prevUnread = async () => {
    const pr = await api(`/api/waves/${encodeURIComponent(id)}/prev${current ? `?before=${encodeURIComponent(current)}` : ''}`);
    if (!pr.ok || !(pr.data as any)?.prev) return;
    const prevId = String((pr.data as any).prev);
    setCurrent(prevId);
    expandAll();
    // do not auto-mark prev as read; leave it highlighted for review
    setTimeout(() => {
      const el = document.querySelector(`[data-blip-id="${CSS.escape(prevId)}"]`);
      if (el && 'scrollIntoView' in el) (el as any).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };
  const firstUnread = async () => {
    const id0 = unread[0];
    if (!id0) return;
    setCurrent(id0);
    expandAll();
    setTimeout(() => {
      const el = document.querySelector(`[data-blip-id="${CSS.escape(id0)}"]`);
      if (el && 'scrollIntoView' in el) (el as any).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const lastUnread = async () => {
    const idn = unread[unread.length - 1];
    if (!idn) return;
    setCurrent(idn);
    expandAll();
    setTimeout(() => {
      const el = document.querySelector(`[data-blip-id="${CSS.escape(idn)}"]`);
      if (el && 'scrollIntoView' in el) (el as any).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  // keyboard shortcuts: j/k next/prev, g/G first/last
  useWaveKeyboardNav(id, nextUnread, prevUnread, firstUnread, lastUnread);

  // Load links for current blip when it changes
  useEffect(() => {
    (async () => {
      if (!current) { setLinksOut([]); setLinksIn([]); return; }
      const r = await api(`/api/blips/${encodeURIComponent(current)}/links`);
      if (r.ok) {
        const d = r.data as any;
        setLinksOut((d?.out || []).map((x: any) => ({ toBlipId: String(x.toBlipId), waveId: String(x.waveId) })));
        setLinksIn((d?.in || []).map((x: any) => ({ fromBlipId: String(x.fromBlipId), waveId: String(x.waveId) })));
      }
    })();
  }, [current]);
  useEffect(() => {
    const unsub = subscribeLinks(async () => {
      if (!current) return;
      const lr = await api(`/api/blips/${encodeURIComponent(current)}/links`);
      if (lr.ok) {
        const d = lr.data as any;
        setLinksOut((d?.out || []).map((x: any) => ({ toBlipId: String(x.toBlipId), waveId: String(x.waveId) })));
        setLinksIn((d?.in || []).map((x: any) => ({ fromBlipId: String(x.fromBlipId), waveId: String(x.waveId) })));
      }
    });
    return () => unsub();
  }, [current]);

  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, padding: 0 }}>{title || 'Wave'}</h2>
        <button onClick={()=> setShowEditor(v=>!v)} style={{ marginLeft: 'auto' }}>{showEditor ? 'Hide editor' : (current ? 'Show editor for current blip' : 'Show editor')}</button>
      </div>
      {showEditor ? (
        <div style={{ margin: '12px 0' }}>
          <Editor waveId={id} blipId={current ?? undefined} readOnly={false} />
        </div>
      ) : null}
      <a href="#/waves">← Back</a>
      <h2>{title}</h2>
      <div style={{ marginBottom: 6, fontSize: 14, color: '#444' }}>
        Unread {unread.length} / {total} (read {readCount}){current ? <span> — Current: <code>{current}</code></span> : null}
      </div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={expandAll}>Expand all</button>
        <button onClick={collapseAll}>Collapse all</button>
        <button onClick={prevUnread} title="Previous unread (k)" style={{ background: '#95a5a6', color: 'white' }}>Prev</button>
        <button onClick={nextUnread} title="Next unread (j)" style={{ background: '#27ae60', color: 'white' }}>Next</button>
        <button onClick={firstUnread} title="First unread (g)">First</button>
        <button onClick={lastUnread} title="Last unread (G)">Last</button>
      </div>
      {current ? (
        <div style={{ marginBottom: 12, padding: 8, border: '1px dashed #ddd', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Links for {current}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <input placeholder="to blip id" value={newLinkTo} onChange={(e)=> setNewLinkTo(e.target.value)} />
            <button onClick={async ()=>{
              const to = newLinkTo.trim(); if (!to) return;
              const r = await api('/api/links', { method: 'POST', body: JSON.stringify({ fromBlipId: current, toBlipId: to, waveId: id }) });
              if (r.ok) {
                setNewLinkTo('');
                const lr = await api(`/api/blips/${encodeURIComponent(current)}/links`);
                if (lr.ok) {
                  const d = lr.data as any;
                  setLinksOut((d?.out||[]).map((x:any)=>({toBlipId:String(x.toBlipId), waveId:String(x.waveId)})));
                  setLinksIn((d?.in||[]).map((x:any)=>({fromBlipId:String(x.fromBlipId), waveId:String(x.waveId)})));
                }
              }
            }}>
              Add link
            </button>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 600 }}>Outgoing</div>
              <ul>
                {linksOut.map((l)=> (
                  <li key={`out:${current}:${l.toBlipId}`}>
                    → <code>{l.toBlipId}</code> <button onClick={async ()=>{
                      await api(`/api/links/${encodeURIComponent(current)}/${encodeURIComponent(l.toBlipId)}`, { method: 'DELETE' });
                      const lr = await api(`/api/blips/${encodeURIComponent(current)}/links`);
                      if (lr.ok) {
                        const d = lr.data as any;
                        setLinksOut((d?.out||[]).map((x:any)=>({toBlipId:String(x.toBlipId), waveId:String(x.waveId)})));
                        setLinksIn((d?.in||[]).map((x:any)=>({fromBlipId:String(x.fromBlipId), waveId:String(x.waveId)})));
                      }
                    }}>remove</button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Incoming</div>
              <ul>
                {linksIn.map((l)=> (
                  <li key={`in:${l.fromBlipId}:${current}`}>
                    ← <code>{l.fromBlipId}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
      <BlipTreeWithState nodes={blips} unread={new Set(unread)} current={current} openMap={openMap} onToggle={(id, val) => { const next = { ...openMap, [id]: val }; persist(next); }} />
    </section>
  );
}

function BlipTreeWithState({ nodes, unread, current, openMap, onToggle }: { nodes: BlipNode[]; unread: Set<string>; current: string | null; openMap: Record<string, boolean>; onToggle: (id: string, next: boolean) => void }) {
  const render = (n: BlipNode) => {
    const isOpen = openMap[n.id] !== false;
    return (
      <li key={n.id} data-blip-id={n.id} style={{ background: current === n.id ? '#e8f8f2' : unread.has(n.id) ? '#e9fbe9' : undefined }} onClick={(e)=>{ if ((e.target as HTMLElement).tagName.toLowerCase() !== 'button') { (window as any).setWaveCurrent?.(n.id); } }}>
        <button onClick={() => onToggle(n.id, !isOpen)} style={{ marginRight: 6 }}>{isOpen ? '-' : '+'}</button>
        <span style={{ color: '#555' }}>{formatTimestamp(n.createdAt)}</span>
        <span> — <BlipContent content={n.content || ''} /></span>
        {n.children && n.children.length > 0 && isOpen ? (
          <ul style={{ marginLeft: 18 }}>
            {n.children.map(render)}
          </ul>
        ) : null}
      </li>
    );
  };
  return <ul style={{ listStyle: 'none', paddingLeft: 0 }}>{nodes.map(render)}</ul>;
}

// keyboard navigation
// j: next unread, k: previous unread (ignores inputs)
// attach on mount
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function useWaveKeyboardNav(id: string, nextFn: () => void, prevFn: () => void, firstFn?: () => void, lastFn?: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = (el?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || (el?.isContentEditable)) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'n' || e.key === 'N') { e.preventDefault(); nextFn(); }
      if (e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P') { e.preventDefault(); prevFn(); }
      if (e.key === 'g' && firstFn) { e.preventDefault(); firstFn(); }
      if (e.key === 'G' && lastFn) { e.preventDefault(); lastFn(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [id, nextFn, prevFn, firstFn, lastFn]);
}

// Provide a simple way for list items to set current blip
declare global {
  interface Window { setWaveCurrent?: (id: string) => void }
}

// initialize setter for current selection on mount
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function useInitCurrentSetter(setCurrent: (id: string)=>void) {
  useEffect(() => {
    const prev = (window as any).setWaveCurrent;
    (window as any).setWaveCurrent = setCurrent;
    return () => { (window as any).setWaveCurrent = prev; };
  }, [setCurrent]);
}

