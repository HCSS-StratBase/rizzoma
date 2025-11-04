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

  useEffect(() => {
    (async () => {
      const r = await api(`/api/waves/${encodeURIComponent(id)}`);
      if (!r.ok) { setError('Load failed'); return; }
      const data = r.data as any;
      setTitle(data.title || '');
      setBlips((data.blips as BlipNode[]) || []);
    })();
  }, [id]);

  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  return (
    <section>
      <a href="#/waves">← Back</a>
      <h2>{title}</h2>
      <BlipTree nodes={blips} />
    </section>
  );
}

