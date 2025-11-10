import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

function b64ToUint8Array(b64: string): Uint8Array {
  try {
    const bin = typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch { return new Uint8Array(); }
}

export function Editor({ waveId, blipId, readOnly = true }: { waveId: string; blipId?: string; readOnly?: boolean }) {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const viewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let stopTimer: (() => void) | undefined;
    (async () => {
      try {
        // Check server flag
        const snap = await api(`/api/editor/${encodeURIComponent(waveId)}/snapshot${blipId ? `?blipId=${encodeURIComponent(blipId)}` : ''}`);
        if (!snap.ok) { setEnabled(false); return; }

        const [{ EditorContent, useEditor }, StarterKit, Collaboration, Y] = await Promise.all([
          import('@tiptap/react').catch(() => null) as any,
          import('@tiptap/starter-kit').catch(() => null) as any,
          import('@tiptap/extension-collaboration').catch(() => null) as any,
          import('yjs').catch(() => null) as any,
        ]);
        if (!EditorContent || !useEditor || !StarterKit || !Collaboration || !Y) { setEnabled(false); return; }

        const ydoc = new Y.Doc();
        const data: any = snap.data || {};
        const snapshotB64: string | null = data?.snapshotB64 || null;
        if (snapshotB64) {
          try { Y.applyUpdate(ydoc, b64ToUint8Array(snapshotB64)); } catch {}
        }

        const editor = useEditor({
          editable: !readOnly,
          extensions: [StarterKit.default.configure({}), Collaboration.default.configure({ document: ydoc })],
          content: undefined,
        });

        if (viewRef.current) {
          const container = viewRef.current;
          const mount = document.createElement('div');
          container.innerHTML = '';
          container.appendChild(mount);
          const React = await import('react');
          const ReactDOM = await import('react-dom/client');
          const el = (React as any).createElement(EditorContent, { editor });
          (ReactDOM as any).createRoot(mount).render(el);
        }

        const interval = window.setInterval(async () => {
          try {
            const update = (Y as any).encodeStateAsUpdate(ydoc) as Uint8Array;
            const b64 = Buffer.from(update).toString('base64');
            const text = (editor as any)?.getText?.();
            const body: Record<string, unknown> = { snapshotB64: b64 };
            if (typeof text === 'string') body['text'] = text;
            if (typeof blipId === 'string' && blipId.length > 0) body['blipId'] = blipId;
            await api(`/api/editor/${encodeURIComponent(waveId)}/snapshot`, { method: 'POST', body: JSON.stringify(body) });
          } catch {}
        }, 5000);
        stopTimer = () => window.clearInterval(interval);
      } catch (e: any) {
        if (!disposed) setError(e?.message || 'editor_init_error');
      }
    })();
    return () => { disposed = true; if (stopTimer) stopTimer(); };
  }, [waveId, blipId, readOnly]);

  if (!enabled) return <div style={{ opacity: 0.7 }}>(Editor disabled or not installed)</div>;
  if (error) return <div style={{ color: 'red' }}>Editor error: {error}</div>;
  return <div ref={viewRef} style={{ border: '1px solid #ddd', padding: 8, borderRadius: 4 }}>Loading editor…</div>;
}
