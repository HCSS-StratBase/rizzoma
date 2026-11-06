/**
 * Native fractal-render — React wrapper for WaveView.
 *
 * Thin React component. It does NOT render any of the topic content
 * itself — that is the WaveView's job. This component:
 *   1. Reads `FEATURES.RIZZOMA_NATIVE_RENDER` (from src/shared/featureFlags)
 *   2. If on, instantiates a WaveView with the given content lookup
 *   3. Mounts WaveView's root container into a host <div>
 *   4. Connects Phase 2 native editing: mounts TipTap editors on active blips,
 *      wires Ctrl+Enter for child blip creation at cursor, and auto-saves to CouchDB.
 *   5. Tears down on unmount or topic switch
 *
 * The host page (RizzomaTopicDetail.tsx) chooses between this and the
 * existing React/TipTap-based view via the feature flag.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { WaveView } from '@client/native/wave-view';
import type { BlipView } from '@client/native/blip-view';
import type { ContentArray } from '@client/native/types';
import { FEATURES } from '@shared/featureFlags';
import { WavePlaybackModal } from '../WavePlaybackModal';
import { usePullToRefresh } from '@client/hooks/usePullToRefresh';
import { useSwipe } from '@client/hooks/useSwipe';
import { parseHtmlToContentArray } from '@client/native/parser';
import { getEditorExtensions, defaultEditorProps } from '@client/components/editor/EditorConfig';
import { makeTipTapFactory } from '@client/native/tiptap-adapter';
import { BlipEditorHost } from '@client/native/blip-editor-host';
import { api, ensureCsrf } from '@client/lib/api';
import './NativeWaveView.css';

export interface NativeWaveViewProps {
  /** The blipId to set as the wave's root (the topic-level blip). */
  rootBlipId: string;
  /** Synchronous lookup: blipId → ContentArray (or null if not loaded). */
  contentByBlipId: (id: string) => ContentArray | null;
  /** Optional className for the host div. */
  className?: string;
  /** Optional callback fired once the WaveView has been instantiated. */
  onWaveViewReady?: (wv: WaveView) => void;
}

export const NativeWaveView: React.FC<NativeWaveViewProps> = ({
  rootBlipId,
  contentByBlipId,
  className,
  onWaveViewReady,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const waveViewRef = useRef<WaveView | null>(null);
  const [showPlayback, setShowPlayback] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Active editors registry: blipId → BlipEditorHost
  const activeHostsRef = useRef<Map<string, BlipEditorHost>>(new Map());
  // Debounced save timers: blipId → timer
  const saveTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Auto-save helper for blips and root topic
  const autoSaveBlip = useCallback(async (blipId: string, html: string) => {
    try {
      await ensureCsrf();
      if (blipId === rootBlipId) {
        // Extract title: H1 tag or first non-empty line
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        const h1 = tempDiv.querySelector('h1')?.textContent || '';
        const title = h1.trim() || tempDiv.textContent?.split('\n')[0]?.trim() || 'Untitled';
        await api(`/api/topics/${encodeURIComponent(rootBlipId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ title, content: html }),
        });
      } else {
        await api(`/api/blips/${encodeURIComponent(blipId)}`, {
          method: 'PUT',
          body: JSON.stringify({ content: html }),
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[NativeWaveView] autoSave error for', blipId, err);
    }
  }, [rootBlipId]);

  // Forward declaration for handleCreateChild
  const handleCreateChildRef = useRef<((parentBlipId: string) => Promise<void>) | null>(null);

  // Mount TipTap editor into a BlipView
  const mountEditor = useCallback((blipId: string, view: BlipView, explicitInitialHtml?: string): BlipEditorHost => {
    const existing = activeHostsRef.current.get(blipId);
    if (existing && existing.isMounted()) return existing;

    const factory = makeTipTapFactory({
      extensions: () => getEditorExtensions(undefined, undefined, {
        waveId: rootBlipId,
        blipId,
        onCreateInlineChildBlip: async () => {
          if (handleCreateChildRef.current) {
            await handleCreateChildRef.current(blipId);
          }
        },
      }),
      editorProps: defaultEditorProps,
      onUpdate: ({ editor }: { editor: any }) => {
        const html = editor.getHTML();
        const prevTimer = saveTimeoutsRef.current.get(blipId);
        if (prevTimer) clearTimeout(prevTimer);
        const t = setTimeout(() => {
          saveTimeoutsRef.current.delete(blipId);
          autoSaveBlip(blipId, html);
        }, 200);
        saveTimeoutsRef.current.set(blipId, t);
      },
    });

    if (explicitInitialHtml && (!view.getContent() || view.getContent().length === 0)) {
      view.setContent(parseHtmlToContentArray(explicitInitialHtml));
    }

    const host = new BlipEditorHost(view, factory);
    host.mount();
    activeHostsRef.current.set(blipId, host);
    return host;
  }, [rootBlipId, autoSaveBlip]);

  // Handle Ctrl+Enter child creation inside any active editor
  const handleCreateChild = useCallback(async (parentBlipId: string) => {
    try {
      await ensureCsrf();
      const res = await api('/api/blips', {
        method: 'POST',
        body: JSON.stringify({
          waveId: rootBlipId,
          parentId: parentBlipId === rootBlipId ? null : parentBlipId,
          content: '<ul><li><p></p></li></ul>',
          anchorPosition: 0,
        }),
      });

      if (!res.ok || !res.data) {
        // eslint-disable-next-line no-console
        console.error('[NativeWaveView] Failed to create blip:', res);
        return;
      }
      const newBlip = res.data as { id?: string; _id?: string };
      const newBlipId = newBlip.id || newBlip._id;
      if (!newBlipId) return;

      const parentHost = activeHostsRef.current.get(parentBlipId);
      const parentAdapter = parentHost?.getEditor();
      const parentRawEditor = parentAdapter?.raw;

      if (parentRawEditor?.commands?.insertBlipThread) {
        parentRawEditor.commands.insertBlipThread({ threadId: newBlipId });
      }

      const wv = waveViewRef.current;
      if (!wv) return;
      const childView = wv.getOrCreateView(newBlipId);
      childView.setContent(parseHtmlToContentArray('<ul><li><p></p></li></ul>'));

      // Find the portal anchor inserted by BlipThreadNode
      const parentEl = parentAdapter?.element || parentRawEditor?.options?.element;
      const portalAnchor = parentEl?.querySelector(`[data-portal-child="${newBlipId}"]`);
      if (portalAnchor) {
        portalAnchor.appendChild(childView.getContainer());
      } else {
        const parentContainer = parentHost?.getView()?.getContainer();
        if (parentContainer) parentContainer.appendChild(childView.getContainer());
      }

      // Mount editor on the child blip
      mountEditor(newBlipId, childView, '<ul><li><p></p></li></ul>');

      // Focus child editor
      requestAnimationFrame(() => {
        const pm = childView.getContainer().querySelector('.ProseMirror') as HTMLElement;
        if (pm) {
          pm.focus();
        }
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[NativeWaveView] handleCreateChild error:', err);
    }
  }, [rootBlipId, mountEditor]);

  useEffect(() => {
    handleCreateChildRef.current = handleCreateChild;
  }, [handleCreateChild]);

  // Toggle Edit/Done
  const handleToggleEdit = useCallback(() => {
    const wv = waveViewRef.current;
    if (!wv) return;

    if (isEditing) {
      // Done: flush pending auto-saves, unmount all active editors
      saveTimeoutsRef.current.forEach((t) => clearTimeout(t));
      saveTimeoutsRef.current.clear();
      activeHostsRef.current.forEach((host, blipId) => {
        try {
          const html = host.getEditor()?.getHTML() || '';
          if (html) autoSaveBlip(blipId, html);
          host.saveAndUnmount();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[NativeWaveView] error unmounting host for', blipId, e);
        }
      });
      activeHostsRef.current.clear();
      setIsEditing(false);
    } else {
      // Edit: mount editor on topic root
      const rootView = wv.getView(rootBlipId);
      if (rootView) {
        mountEditor(rootBlipId, rootView);
        setIsEditing(true);
        requestAnimationFrame(() => {
          const pm = rootView.getContainer().querySelector('.ProseMirror') as HTMLElement;
          if (pm) pm.focus();
        });
      }
    }
  }, [isEditing, rootBlipId, mountEditor, autoSaveBlip]);

  // Mobile gestures
  usePullToRefresh(hostRef, {
    onRefresh: async () => {},
  });
  useSwipe(hostRef, {
    onSwipe: (dir) => {
      if (dir !== 'left') return;
      const root = hostRef.current;
      if (!root) return;
      root.querySelectorAll('.blip-thread:not(.folded)').forEach((el) => el.classList.add('folded'));
    },
  });

  const stableLookup = useMemo(() => contentByBlipId, [contentByBlipId]);

  useEffect(() => {
    if (!FEATURES.RIZZOMA_NATIVE_RENDER) return;
    const host = hostRef.current;
    if (!host) return;

    const wv = new WaveView({ contentByBlipId: stableLookup });
    waveViewRef.current = wv;
    wv.setRoot(rootBlipId);
    host.appendChild(wv.getRootContainer());
    onWaveViewReady?.(wv);

    return () => {
      // Clean up timers & editors on unmount
      saveTimeoutsRef.current.forEach((t) => clearTimeout(t));
      saveTimeoutsRef.current.clear();
      activeHostsRef.current.forEach((h) => {
        try { h.unmount(); } catch {}
      });
      activeHostsRef.current.clear();

      const rc = wv.getRootContainer();
      if (rc.parentNode) rc.parentNode.removeChild(rc);
      wv.destroy();
      waveViewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootBlipId, stableLookup]);

  if (!FEATURES.RIZZOMA_NATIVE_RENDER) {
    return null;
  }

  return (
    <>
      <div className="rizzoma-native-toolbar">
        <button
          className={`topic-tb-btn ${isEditing ? 'active primary' : ''}`}
          type="button"
          onClick={handleToggleEdit}
          title={isEditing ? 'Done editing (changes auto-saved)' : 'Edit topic content'}
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
        <button
          className="rizzoma-native-toolbar-btn"
          type="button"
          onClick={() => setShowPlayback(true)}
          title="Wave-level playback (timeline)"
        >
          ▷ Playback
        </button>
      </div>
      <div ref={hostRef} className={className ?? 'rizzoma-native-wave-host'} />
      {showPlayback && (
        <WavePlaybackModal
          waveId={rootBlipId}
          topicTitle="Wave playback"
          blips={[]}
          onClose={() => setShowPlayback(false)}
        />
      )}
    </>
  );
};

export default NativeWaveView;
