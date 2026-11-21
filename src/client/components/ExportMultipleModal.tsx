import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { generateTopicHtmlExport } from '../lib/topicExport';
import { buildZip } from '../lib/zipStore';
import './ExportModal.css';

type TopicRow = { id: string; title: string };

/** The original's "Export topics" popup (export/template.coffee): select all, one checkbox per topic, "Export selected topics". */
export default function ExportMultipleModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ count: number; url: string; name: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setDone(null); setPicked(new Set());
    let live = true;
    (async () => {
      const rows: TopicRow[] = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const r = await api<{ topics?: Array<{ id?: string; _id?: string; title?: string }> }>(`/api/topics?limit=100&offset=${offset}`);
        const page = (r.ok && r.data && typeof r.data === 'object' ? (r.data as { topics?: Array<{ id?: string; _id?: string; title?: string }> }).topics : []) || [];
        for (const t of page) { const id = t.id || t._id; if (id) rows.push({ id, title: t.title || '' }); }
        if (page.length < 100) break;
      }
      if (live) setTopics(rows);
    })().catch(() => undefined);
    return () => { live = false; };
  }, [isOpen]);

  if (!isOpen) return null;
  const allChecked = topics.length > 0 && picked.size === topics.length;
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const start = async () => {
    if (!picked.size || busy) return;
    setBusy(true);
    try {
      const entries: Array<{ name: string; content: string }> = [];
      const used = new Set<string>();
      for (const t of topics.filter((x) => picked.has(x.id))) {
        const topic = await api<{ content?: string; title?: string }>(`/api/topics/${encodeURIComponent(t.id)}`);
        const blips = await api<{ blips?: unknown[] }>(`/api/blips?waveId=${encodeURIComponent(t.id)}&limit=1000`);
        const list = ((blips.data && typeof blips.data === 'object' ? (blips.data as { blips?: unknown[] }).blips : []) || []) as Array<{ id?: string; _id?: string; deleted?: boolean }>;
        const html = generateTopicHtmlExport({
          topicTitle: t.title || '(no title)', topicId: t.id,
          topicContent: topic.data && typeof topic.data === 'object' ? String((topic.data as { content?: string }).content || '') : '',
          blips: list.filter((b) => !b.deleted).map((b) => ({ ...b, id: String(b.id || b._id) })) as never,
        });
        let base = (t.title || 'topic').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50) || 'topic'; let name = `${base}.html`; let n = 2;
        while (used.has(name)) { name = `${base}_${n}.html`; n += 1; }
        used.add(name); entries.push({ name, content: html });
      }
      const url = URL.createObjectURL(new Blob([buildZip(entries) as unknown as BlobPart], { type: 'application/zip' }));
      const name = `rizzoma-topics-${new Date().toISOString().slice(0, 10)}.zip`;
      const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
      setDone({ count: entries.length, url, name });
    } finally { setBusy(false); }
  };

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal export-popup" data-testid="export-multiple" onClick={(e) => e.stopPropagation()}>
        <div className="export-modal-header"><h3 className="ep-title">Export topics</h3><button className="export-modal-close" onClick={onClose}>&times;</button></div>
        <div className="export-modal-body">
          <label className="ep-select-all-container"><input type="checkbox" className="ep-select-all" data-testid="export-select-all" checked={allChecked} onChange={(e) => setPicked(e.target.checked ? new Set(topics.map((t) => t.id)) : new Set())} /> select all</label>
          <ul className="ep-topics" style={{ maxHeight: 260, overflow: 'auto', listStyle: 'none', padding: 0, margin: '8px 0' }}>
            {topics.map((t) => (
              <li key={t.id} className="ep-topic" data-id={t.id}><label><input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} /> {t.title || <span className="ep-topic-no-title">(no title)</span>}</label></li>
            ))}
          </ul>
          <div>Tip: use the search to narrow down this list.</div>
          <div className="ep-start-container"><button className="ep-start button" data-testid="export-start" disabled={!picked.size || busy} onClick={() => void start()}>{busy ? 'Preparing archive...' : 'Export selected topics'}</button></div>
          {done && (
            <div className="ep-archives-container" data-testid="export-done"><span>Recently exported topics:</span>
              <ul className="ep-archives"><li className="ep-archive"><a className="ep-archive-link" href={done.url} download={done.name}>{done.count} {done.count === 1 ? 'topic' : 'topics'} on {new Date().toLocaleString()}</a></li></ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
