import { useEffect, useMemo, useState } from 'react';
import type { Editor as TipTapEditor } from '@tiptap/core';
import { useEditor as useTipTapEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { api } from '../lib/api';
import { subscribeEditor } from '../lib/socket';
import { usePresence } from '../hooks/usePresence';
import { PresenceIndicator } from './PresenceIndicator';

function b64ToUint8Array(b64: string | null | undefined): Uint8Array {
  if (typeof b64 !== 'string' || b64.length === 0) return new Uint8Array();
  try {
    const safe = b64;
    const bin = typeof atob !== 'undefined' ? atob(safe) : Buffer.from(safe, 'base64').toString('binary');
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch {
    return new Uint8Array();
  }
}

type EditorProps = {
  waveId: string;
  blipId?: string;
  readOnly?: boolean;
};

type SnapshotResponse = {
  snapshotB64?: string | null;
  nextSeq?: number;
};

type EditorUpdatePayload = {
  updateB64?: string;
  blipId?: string;
};

export function Editor({ waveId, blipId, readOnly = true }: EditorProps): JSX.Element {
  const yDoc = useMemo(() => new Y.Doc(), [waveId, blipId]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextSeq, setNextSeq] = useState(1);
  const presence = usePresence(waveId, blipId);

  // Bootstrap snapshot + collaboration document
  useEffect(() => {
    let cancelled = false;
    const loadSnapshot = async (): Promise<void> => {
      try {
        const qs = blipId ? `?blipId=${encodeURIComponent(blipId)}` : '';
        const snap = await api(`/api/editor/${encodeURIComponent(waveId)}/snapshot${qs}`);
        if (!snap.ok) {
          if (!cancelled) setEnabled(false);
          return;
        }
        const data = (snap.data || {}) as SnapshotResponse;
        const initialUpdate = b64ToUint8Array(data.snapshotB64);
        if (initialUpdate.length > 0) {
          Y.applyUpdate(yDoc, initialUpdate);
        }
        const seq = Number(data.nextSeq ?? 1);
        if (Number.isFinite(seq)) setNextSeq(seq);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'editor_init_error');
      }
    };
    void loadSnapshot();

    return () => {
      cancelled = true;
      yDoc.destroy();
    };
  }, [waveId, blipId, yDoc]);

  const editor = useTipTapEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({}),
      Collaboration.configure({ document: yDoc }),
    ],
  }) as TipTapEditor | null;

  // Send updates to server when local doc changes
  useEffect(() => {
    if (!editor) return;
    const sendUpdate = async (update: Uint8Array): Promise<void> => {
      const b64 = Buffer.from(update).toString('base64');
      const body: Record<string, unknown> = { seq: nextSeq, updateB64: b64 };
      if (blipId) body['blipId'] = blipId;
      await api(`/api/editor/${encodeURIComponent(waveId)}/updates`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setNextSeq(current => current + 1);
    };
    const onDocUpdate = (update: Uint8Array) => {
      void sendUpdate(update).catch(() => {
        // ignore send failures
      });
    };
    yDoc.on('update', onDocUpdate);
    return () => {
      yDoc.off('update', onDocUpdate);
    };
  }, [editor, waveId, blipId, yDoc, nextSeq]);

  // Periodic snapshot persistence
  useEffect(() => {
    if (!editor) return;
    const interval = window.setInterval(() => {
      try {
        const update = Y.encodeStateAsUpdate(yDoc);
        const b64 = Buffer.from(update).toString('base64');
        const body: Record<string, unknown> = { snapshotB64: b64 };
        const text = editor.getText();
        if (text) body['text'] = text;
        if (blipId) body['blipId'] = blipId;
        void api(`/api/editor/${encodeURIComponent(waveId)}/snapshot`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } catch {
        // ignore snapshot errors
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [editor, waveId, blipId, yDoc]);

  // Remote updates via socket
  useEffect(() => {
    if (!editor) return;
    const handleUpdate = (payload?: EditorUpdatePayload) => {
      const updateB64 = typeof payload?.updateB64 === 'string' ? payload.updateB64 : null;
      if (!updateB64) return;
      if (payload?.blipId && blipId && payload.blipId !== blipId) return;
      try {
        Y.applyUpdate(yDoc, b64ToUint8Array(updateB64));
      } catch {
        // ignore malformed payloads
      }
    };
    const unsubscribe = subscribeEditor(waveId, handleUpdate);
    return () => {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
    };
  }, [editor, waveId, blipId, yDoc]);

  if (!enabled) {
    return <div style={{ opacity: 0.7 }}>(Editor disabled or not installed)</div>;
  }
  if (error) {
    return <div style={{ color: 'red' }}>Editor error: {error}</div>;
  }
  return (
    <div>
      <PresenceIndicator label="Editor" status={presence.status} users={presence.users} />
      <EditorContent editor={editor} />
    </div>
  );
}
