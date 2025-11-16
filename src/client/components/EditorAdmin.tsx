import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type EditorSearchResult = {
  waveId: string;
  blipId?: string;
  updatedAt?: number;
};

export function EditorAdmin() {
  const [recent, setRecent] = useState<EditorSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // simple dev-only helper: search for any snapshots with a wildcard-ish pattern
        const r = await api('/api/editor/search?q=a&limit=10');
        if (!r.ok) {
          setError(`Failed to load editor snapshot sample (${r.status})`);
          return;
        }
        const list = Array.isArray((r.data as any)?.results) ? (r.data as any).results : [];
        setRecent(
          list.map((d: any) => ({
            waveId: String(d.waveId),
            blipId: d.blipId ? String(d.blipId) : undefined,
            updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : undefined,
          })),
        );
      } catch (e: any) {
        setError(e?.message || 'Failed to load editor snapshot sample');
      }
    })();
  }, []);

  return (
    <section>
      <h2>Editor Admin (Dev)</h2>
      <p style={{ maxWidth: 640, fontSize: 14 }}>
        Dev-only helper for inspecting a few recent editor snapshots via `/api/editor/search`. For full control, use the
        dedicated Editor Search view.
      </p>
      {error ? <div style={{ color: 'red', marginBottom: 8 }}>{error}</div> : null}
      {recent.length > 0 ? (
        <ul>
          {recent.map((r, idx) => {
            const href = r.blipId
              ? `#/wave/${encodeURIComponent(r.waveId)}?focus=${encodeURIComponent(r.blipId)}`
              : `#/wave/${encodeURIComponent(r.waveId)}`;
            return (
              <li key={`${r.waveId}:${r.blipId || idx}`}>
                <a href={href}>
                  Wave <code>{r.waveId}</code>
                  {r.blipId ? (
                    <>
                      {' '}
                      — Blip <code>{r.blipId}</code>
                    </>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      ) : !error ? (
        <div style={{ opacity: 0.7, fontSize: 14 }}>No sample snapshots found yet.</div>
      ) : null}
    </section>
  );
}

