import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type EditorSearchResult = {
  waveId: string;
  blipId?: string;
  updatedAt?: number;
};

type EditorSearchPayload = {
  waveId?: string;
  blipId?: string;
  updatedAt?: number;
};

type EditorSearchApiResponse = {
  results?: EditorSearchPayload[];
};

export function EditorAdmin(): JSX.Element {
  const [recent, setRecent] = useState<EditorSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const r = await api('/api/editor/search?q=a&limit=10');
        if (!r.ok) {
          setError(`Failed to load editor snapshot sample (${r.status})`);
          return;
        }
        const payload = r.data as EditorSearchApiResponse;
        const list = Array.isArray(payload.results) ? payload.results : [];
        setRecent(
          list.map(item => ({
            waveId: item.waveId ? String(item.waveId) : '',
            blipId: item.blipId ? String(item.blipId) : undefined,
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined,
          })),
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load editor snapshot sample');
      }
    };
    void load();
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
