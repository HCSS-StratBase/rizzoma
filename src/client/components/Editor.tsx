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
import {
  createSerializedUpdateQueue,
  applyRemoteEditorUpdate,
  shouldPersistEditorUpdate,
} from '../lib/editorPersistence';

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
  yjsGeneration?: number;
};

type EditorUpdatePayload = {
  updateB64?: string;
  blipId?: string;
  yjsGeneration?: number;
};

export function Editor({ waveId, blipId, readOnly = true }: EditorProps): JSX.Element {
  const editorIdentity = `${waveId}:${blipId ?? '__wave__'}`;
  const yDoc = useMemo(() => new Y.Doc({ guid: editorIdentity }), [editorIdentity]);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotAuthority, setSnapshotAuthority] = useState<{ identity: string; yjsGeneration: number } | null>(null);
  const yjsGeneration = snapshotAuthority?.identity === editorIdentity
    ? snapshotAuthority.yjsGeneration
    : null;
  const snapshotReady = yjsGeneration !== null;
  const presence = usePresence(waveId, blipId);

  // Bootstrap snapshot + collaboration document
  useEffect(() => {
    let cancelled = false;
    setSnapshotAuthority(null);
    const loadSnapshot = async (): Promise<void> => {
      try {
        const qs = blipId ? `?blipId=${encodeURIComponent(blipId)}` : '';
        const snap = await api(`/api/editor/${encodeURIComponent(waveId)}/snapshot${qs}`);
        if (!snap.ok) {
          if (!cancelled) setEnabled(false);
          return;
        }
        if (cancelled) return;
        const data = (snap.data || {}) as SnapshotResponse;
        const generation = data.yjsGeneration;
        if (!Number.isSafeInteger(generation) || Number(generation) < 0) {
          if (!cancelled) setError('editor_generation_missing');
          return;
        }
        const initialUpdate = b64ToUint8Array(data.snapshotB64);
        if (initialUpdate.length > 0) {
          applyRemoteEditorUpdate(yDoc, initialUpdate);
        }
        if (!cancelled) setSnapshotAuthority({ identity: editorIdentity, yjsGeneration: Number(generation) });
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'editor_init_error');
      }
    };
    void loadSnapshot();

    return () => {
      cancelled = true;
      yDoc.destroy();
    };
  }, [waveId, blipId, editorIdentity, yDoc]);

  const editor = useTipTapEditor({
    editable: false,
    extensions: [
      StarterKit.configure({}),
      Collaboration.configure({ document: yDoc }),
    ],
  }) as TipTapEditor | null;

  useEffect(() => {
    editor?.setEditable(!readOnly && snapshotReady);
  }, [editor, readOnly, snapshotReady]);

  // Send updates to server when local doc changes
  useEffect(() => {
    if (!editor || !snapshotReady) return;
    let cancelled = false;
    const updateQueue = createSerializedUpdateQueue((sendError) => {
      if (!cancelled) setError(sendError instanceof Error ? sendError.message : 'editor_update_rejected');
    });
    const sendUpdate = async (update: Uint8Array): Promise<void> => {
      const b64 = Buffer.from(update).toString('base64');
      const body: Record<string, unknown> = { updateB64: b64, yjsGeneration };
      if (blipId) body['blipId'] = blipId;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await api(`/api/editor/${encodeURIComponent(waveId)}/updates`, {
            method: 'POST',
            body: JSON.stringify(body),
          });
          if (response.ok) return;
          if (response.status >= 400 && response.status < 500) throw new Error('editor_update_rejected');
        } catch (requestError) {
          if (attempt === 3 || (requestError instanceof Error && requestError.message === 'editor_update_rejected')) throw requestError;
        }
        if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, attempt * 150));
      }
      throw new Error('editor_update_rejected');
    };
    const onDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (!shouldPersistEditorUpdate(origin)) return;
      // Serialize writes so rapid local Y.Doc events cannot race each other.
      // Sequence allocation is server-authoritative; each request is checked
      // before the next queued update is released.
      updateQueue.enqueue(() => sendUpdate(update));
    };
    yDoc.on('update', onDocUpdate);
    return () => {
      cancelled = true;
      yDoc.off('update', onDocUpdate);
    };
  }, [editor, waveId, blipId, yDoc, snapshotReady, yjsGeneration]);

  // Periodic snapshot persistence
  useEffect(() => {
    if (!editor || !snapshotReady) return;
    const interval = window.setInterval(() => {
      try {
        const update = Y.encodeStateAsUpdate(yDoc);
        const b64 = Buffer.from(update).toString('base64');
        const body: Record<string, unknown> = { snapshotB64: b64, yjsGeneration };
        const text = editor.getText();
        if (text) body['text'] = text;
        if (blipId) body['blipId'] = blipId;
        void api(`/api/editor/${encodeURIComponent(waveId)}/snapshot`, {
          method: 'POST',
          body: JSON.stringify(body),
        }).then((response) => {
          if (!response.ok) setError('editor_snapshot_rejected');
        }).catch(() => setError('editor_snapshot_rejected'));
      } catch {
        // ignore snapshot errors
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [editor, waveId, blipId, yDoc, snapshotReady, yjsGeneration]);

  // Remote updates via socket
  useEffect(() => {
    if (!editor || !snapshotReady) return;
    const handleUpdate = (payload?: EditorUpdatePayload) => {
      const updateB64 = typeof payload?.updateB64 === 'string' ? payload.updateB64 : null;
      if (!updateB64) return;
      if (payload?.blipId && blipId && payload.blipId !== blipId) return;
      if (payload?.yjsGeneration !== yjsGeneration) return;
      try {
        applyRemoteEditorUpdate(yDoc, b64ToUint8Array(updateB64));
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
  }, [editor, waveId, blipId, yDoc, snapshotReady, yjsGeneration]);

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
