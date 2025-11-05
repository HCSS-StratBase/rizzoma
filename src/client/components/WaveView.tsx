import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type BlipNode = { id: string; content: string; createdAt: number; children?: BlipNode[] };

function BlipTree({ nodes }: { nodes: BlipNode[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));
  const render = (n: BlipNode) => (
    <li key={n.id}>
      <button onClick={() => toggle(n.id)} style={{ marginRight: 6 }}>{open[n.id] !== false ? '-' : '+'}</button>
      <span>{new Date(n.createdAt).toLocaleString()} — {n.content || '(empty)'}</span>
      {n.children && n.children.length > 0 && (open[n.id] !== false) ? (
        <ul style={{ marginLeft: 18 }}>
          {n.children.map(render)}
        </ul>
      ) : null}
    </li>
  );
  return <ul>{nodes.map(render)}</ul>;
}

export function WaveView({ id }: { id: string }) {
  const [title, setTitle] = useState<string>('');
  const [blips, setBlips] = useState<BlipNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [unread, setUnread] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

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
        if (ur.ok) setUnread(((ur.data as any)?.unread || []) as string[]);
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

  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  return (
    <section>
      <a href="#/waves">← Back</a>
      <h2>{title}</h2>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <button onClick={expandAll}>Expand all</button>
        <button onClick={collapseAll}>Collapse all</button>
        <button onClick={prevUnread} title="Previous unread (k)" style={{ background: '#95a5a6', color: 'white' }}>Prev</button>
        <button onClick={nextUnread} title="Next unread (j)" style={{ background: '#27ae60', color: 'white' }}>Next</button>
      </div>
      <BlipTreeWithState nodes={blips} unread={new Set(unread)} current={current} openMap={openMap} onToggle={(id, val) => { const next = { ...openMap, [id]: val }; persist(next); }} />
    </section>
  );
}

function BlipTreeWithState({ nodes, unread, current, openMap, onToggle }: { nodes: BlipNode[]; unread: Set<string>; current: string | null; openMap: Record<string, boolean>; onToggle: (id: string, next: boolean) => void }) {
  const render = (n: BlipNode) => {
    const isOpen = openMap[n.id] !== false;
    return (
      <li key={n.id} data-blip-id={n.id} style={{ background: current === n.id ? '#e8f8f2' : unread.has(n.id) ? '#e9fbe9' : undefined }}>
        <button onClick={() => onToggle(n.id, !isOpen)} style={{ marginRight: 6 }}>{isOpen ? '-' : '+'}</button>
        <span>{new Date(n.createdAt).toLocaleString()} — {n.content || '(empty)'}</span>
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
function useWaveKeyboardNav(id: string, nextFn: () => void, prevFn: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = (el?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || (el?.isContentEditable)) return;
      if (e.key === 'j' || e.key === 'J' || e.key === 'n' || e.key === 'N') { e.preventDefault(); nextFn(); }
      if (e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P') { e.preventDefault(); prevFn(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [id, nextFn, prevFn]);
}
