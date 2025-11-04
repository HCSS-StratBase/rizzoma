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

  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  return (
    <section>
      <a href="#/waves">← Back</a>
      <h2>{title}</h2>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <button onClick={expandAll}>Expand all</button>
        <button onClick={collapseAll}>Collapse all</button>
      </div>
      <BlipTreeWithState nodes={blips} openMap={openMap} onToggle={(id, val) => { const next = { ...openMap, [id]: val }; persist(next); }} />
    </section>
  );
}

function BlipTreeWithState({ nodes, openMap, onToggle }: { nodes: BlipNode[]; openMap: Record<string, boolean>; onToggle: (id: string, next: boolean) => void }) {
  const render = (n: BlipNode) => {
    const isOpen = openMap[n.id] !== false;
    return (
      <li key={n.id}>
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
