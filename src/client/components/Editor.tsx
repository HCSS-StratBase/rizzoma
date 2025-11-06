import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

// Dev-only editor scaffold behind EDITOR_ENABLE flag on the server.
// Avoid hard deps: dynamic import TipTap + Yjs if available.

export function Editor({ waveId, readOnly = true }: { waveId: string; readOnly?: boolean }) {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        // See if server-side editor is enabled
        const r = await api(`/api/editor/${encodeURIComponent(waveId)}/snapshot`);
        if (!r.ok) { setEnabled(false); return; }

        // Attempt dynamic imports; if not installed, show a simple placeholder
        const [tiptap, tiptapStarterKit] = await Promise.all([
          import(/* @vite-ignore */ 'tiptap').catch(() => null),
          import(/* @vite-ignore */ 'tiptap-starter-kit').catch(() => null),
        ]);
        if (!tiptap || !tiptapStarterKit) { setEnabled(false); return; }

        // Placeholder: just render a div; full integration will be added when deps are installed
      } catch (e: any) {
        if (!disposed) setError(e?.message || 'editor_init_error');
      }
    })();
    return () => { disposed = true; };
  }, [waveId]);

  if (!enabled) return <div style={{ opacity: 0.7 }}>(Editor disabled or not installed)</div>;
  if (error) return <div style={{ color: 'red' }}>Editor error: {error}</div>;
  return <div ref={viewRef} style={{ border: '1px solid #ddd', padding: 8, borderRadius: 4 }}>Loading editor…</div>;
}

