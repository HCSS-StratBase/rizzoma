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

  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  return (
    <section>
      <a href="#/waves">← Back</a>
      <h2>{title}</h2>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <button onClick={expandAll}>Expand all</button>
        <button onClick={collapseAll}>Collapse all</button>
        <button onClick={nextUnread} style={{ background: '#27ae60', color: 'white' }}>Next</button>
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
  return <ul>{nodes.map(render)}</ul>;
}
