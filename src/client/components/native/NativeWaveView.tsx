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

import React, { useEffect, useRef, useState, useCallback } from 'react';
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
import { TopicDoc } from '@client/native/yjs-binding';
import { TopicAwareness, colorForUserId } from '@client/native/awareness';
import { SocketIOProvider } from '@client/components/editor/CollaborativeProvider';
import { useSocket } from '@client/hooks/useSocket';
import { useAuth } from '@client/hooks/useAuth';
import { api, ensureCsrf } from '@client/lib/api';
import './NativeWaveView.css';

export interface NativeWaveEditController {
  startEdit: () => void;
  finishEdit: () => void;
  toggleEdit: () => void;
}

export interface NativeWaveViewProps {
  /** The blipId to set as the wave's root (the topic-level blip). */
  rootBlipId: string;
  /** Synchronous lookup: blipId → ContentArray (or null if not loaded). */
  contentByBlipId: (id: string) => ContentArray | null;
  /** Author, avatar and date per blip, shown in view mode as in the original Rizzoma. */
  metaByBlipId?: (id: string) => { authorName?: string; authorAvatar?: string; dateText?: string } | null;
  /** Whether the current user is authenticated and allowed to edit/reply. */
  canEdit?: boolean;
  /** Topic title for WavePlaybackModal. */
  topicTitle?: string;
  /** Blips list for WavePlaybackModal. */
  blips?: Array<{ id: string; label: string }>;
  /** Optional handler for per-blip history modal. */
  onOpenHistory?: (blipId: string) => void;
  /** Optional ref populated with start/finish/toggle edit controls for BlipMenu integration. */
  editControllerRef?: React.MutableRefObject<NativeWaveEditController | null>;
  /** Optional callback fired when native editing state changes. */
  onEditingChange?: (editing: boolean) => void;
  /** Hide the standalone native toolbar when hosted inside RizzomaTopicDetail's BlipMenu. */
  hideToolbar?: boolean;
  /** Optional className for the host div. */
  className?: string;
  /** Optional callback fired once the WaveView has been instantiated. */
  onWaveViewReady?: (wv: WaveView) => void;
}

export const NativeWaveView: React.FC<NativeWaveViewProps> = ({
  rootBlipId,
  contentByBlipId,
  metaByBlipId,
  canEdit = true,
  topicTitle = 'Wave playback',
  blips = [],
  onOpenHistory,
  editControllerRef,
  onEditingChange,
  hideToolbar = false,
  className,
  onWaveViewReady,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const waveViewRef = useRef<WaveView | null>(null);
  const contentLookupRef = useRef(contentByBlipId);
  contentLookupRef.current = contentByBlipId;
  const metaLookupRef = useRef(metaByBlipId);
  metaLookupRef.current = metaByBlipId;
  const onOpenHistoryRef = useRef(onOpenHistory);
  onOpenHistoryRef.current = onOpenHistory;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const [showPlayback, setShowPlayback] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const socket = useSocket();
  const { user: authUser } = useAuth();
  const topicDocRef = useRef<TopicDoc | null>(null);
  const awarenessRef = useRef<TopicAwareness | null>(null);
  const activeProvidersRef = useRef<Map<string, SocketIOProvider>>(new Map());

  // Active editors registry: blipId → BlipEditorHost
  const activeHostsRef = useRef<Map<string, BlipEditorHost>>(new Map());
  // Debounced save timers: blipId → timer
  const saveTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Optimistic local blipId → server blipId mapping
  const idMapRef = useRef<Map<string, string>>(new Map());
  const pendingCreateRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const resolveBlipId = useCallback((id: string) => idMapRef.current.get(id) ?? id, []);

  // Auto-save helper for blips and root topic
  const autoSaveBlip = useCallback(async (rawBlipId: string, html: string) => {
    const blipId = resolveBlipId(rawBlipId);
    if (blipId.startsWith('local-')) return;
    let cleanHtml = html;
    idMapRef.current.forEach((real, local) => {
      if (cleanHtml.includes(local)) {
        cleanHtml = cleanHtml.split(local).join(real);
      }
    });
    try {
      await ensureCsrf();
      if (blipId === rootBlipId) {
        // Extract title: H1 tag or first non-empty line using inert template parsing
        const tpl = document.createElement('template');
        tpl.innerHTML = cleanHtml;
        const h1 = tpl.content.querySelector('h1')?.textContent || '';
        const title = h1.trim() || tpl.content.textContent?.split('\n')[0]?.trim() || 'Untitled';
        await api(`/api/topics/${encodeURIComponent(rootBlipId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ title, content: cleanHtml }),
        });
      } else {
        await api(`/api/blips/${encodeURIComponent(blipId)}`, {
          method: 'PUT',
          body: JSON.stringify({ content: cleanHtml }),
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[NativeWaveView] autoSave error for', blipId, err);
    }
  }, [rootBlipId, resolveBlipId]);

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
        isTopicRoot: blipId === rootBlipId,
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
  }, [rootBlipId, autoSaveBlip, authUser, socket]);

  // Handle Ctrl+Enter child creation inside any active editor
  // Synchronous optimistic child creation + focus handoff so typing right after Ctrl+Enter lands in the child.
  const handleCreateChild = useCallback(async (rawParentBlipId: string) => {
    const parentBlipId = resolveBlipId(rawParentBlipId);
    const wv = waveViewRef.current;
    if (!wv) return;

    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const parentHost = activeHostsRef.current.get(rawParentBlipId) ?? activeHostsRef.current.get(parentBlipId);
    const parentAdapter = parentHost?.getEditor();
    const parentRawEditor = parentAdapter?.raw;

    if (parentRawEditor?.commands?.insertBlipThread) {
      parentRawEditor.commands.insertBlipThread({ threadId: tempId });
    }

    const childView = wv.getOrCreateView(tempId);
    childView.setContent(parseHtmlToContentArray('<ul><li><p></p></li></ul>'));

    const parentEl = parentAdapter?.element || parentRawEditor?.options?.element;
    const portalAnchor = parentEl?.querySelector(`[data-portal-child="${tempId}"]`);
    if (portalAnchor) {
      portalAnchor.appendChild(childView.getContainer());
    } else {
      const parentContainer = (parentHost?.getView() ?? wv.getView(rawParentBlipId) ?? wv.getView(parentBlipId))?.getContainer();
      if (parentContainer) parentContainer.appendChild(childView.getContainer());
    }

    const childHost = mountEditor(tempId, childView, '<ul><li><p></p></li></ul>');
    const pm = childView.getContainer().querySelector('.ProseMirror') as HTMLElement | null;
    pm?.focus();
    childHost.getEditor()?.raw?.commands?.focus?.('end');

    setIsEditing(true);
    onEditingChange?.(true);

    const createPromise = (async (): Promise<string | null> => {
      try {
        if (rawParentBlipId.startsWith('local-') && pendingCreateRef.current.has(rawParentBlipId)) {
          await pendingCreateRef.current.get(rawParentBlipId);
        }
        const finalParentId = resolveBlipId(rawParentBlipId);
        await ensureCsrf();
        const resolvedParentId = finalParentId === rootBlipId ? null : finalParentId;
        const res = await api('/api/blips', {
          method: 'POST',
          body: JSON.stringify({
            waveId: rootBlipId,
            parentId: resolvedParentId,
            content: '<ul><li><p></p></li></ul>',
            anchorPosition: 0,
          }),
        });

        if (!res.ok || !res.data) {
          // eslint-disable-next-line no-console
          console.error('[NativeWaveView] Failed to create blip:', res);
          return null;
        }
        const rawData = res.data as { id?: string; _id?: string; blip?: { id?: string; _id?: string } };
        const realId = rawData.id || rawData._id || rawData.blip?.id || rawData.blip?._id;
        if (!realId) return null;

        idMapRef.current.set(tempId, realId);
        activeHostsRef.current.set(realId, childHost);
        childView.getContainer().setAttribute('data-blip-id', realId);

        if (parentRawEditor && !parentRawEditor.isDestroyed) {
          void autoSaveBlip(finalParentId, parentRawEditor.getHTML());
        }

        const currentChildHtml = childHost.getEditor()?.getHTML();
        if (currentChildHtml) {
          void autoSaveBlip(realId, currentChildHtml);
        }
        return realId;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[NativeWaveView] handleCreateChild error:', err);
        return null;
      } finally {
        pendingCreateRef.current.delete(tempId);
      }
    })();

    pendingCreateRef.current.set(tempId, createPromise);
    await createPromise;
  }, [rootBlipId, mountEditor, resolveBlipId, autoSaveBlip, onEditingChange]);

  useEffect(() => {
    handleCreateChildRef.current = handleCreateChild;
  }, [handleCreateChild]);

  const startEditRoot = useCallback(() => {
    const wv = waveViewRef.current;
    if (!wv || !canEditRef.current) return;
    const rootView = wv.getView(rootBlipId);
    if (rootView) {
      mountEditor(rootBlipId, rootView);
      setIsEditing(true);
      onEditingChange?.(true);
      requestAnimationFrame(() => {
        const pm = rootView.getContainer().querySelector('.ProseMirror') as HTMLElement | null;
        if (pm) pm.focus();
      });
    }
  }, [rootBlipId, mountEditor, onEditingChange]);

  const finishEditAll = useCallback(() => {
    saveTimeoutsRef.current.forEach((t) => clearTimeout(t));
    saveTimeoutsRef.current.clear();
    activeHostsRef.current.forEach((host, blipId) => {
      try {
        const html = host.getEditor()?.getHTML() || '';
        if (html) void autoSaveBlip(blipId, html);
        host.saveAndUnmount();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[NativeWaveView] error unmounting host for', blipId, e);
      }
    });
    activeHostsRef.current.clear();
    activeProvidersRef.current.forEach((p) => {
      try { p.destroy(); } catch {}
    });
    activeProvidersRef.current.clear();
    setIsEditing(false);
    onEditingChange?.(false);
  }, [autoSaveBlip, onEditingChange]);

  // Toggle Edit/Done
  const handleToggleEdit = useCallback(() => {
    if (isEditing) {
      finishEditAll();
    } else {
      startEditRoot();
    }
  }, [isEditing, finishEditAll, startEditRoot]);

  useEffect(() => {
    if (!editControllerRef) return;
    editControllerRef.current = {
      startEdit: startEditRoot,
      finishEdit: finishEditAll,
      toggleEdit: handleToggleEdit,
    };
    return () => {
      editControllerRef.current = null;
    };
  }, [editControllerRef, startEditRoot, finishEditAll, handleToggleEdit]);

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

  const handleEditBlip = useCallback((blipId: string, view: BlipView) => {
    if (!canEditRef.current) return;
    mountEditor(blipId, view);
    setIsEditing(true);
    requestAnimationFrame(() => {
      const pm = view.getContainer().querySelector('.ProseMirror') as HTMLElement | null;
      pm?.focus();
    });
  }, [mountEditor]);

  const handleEditBlipRef = useRef(handleEditBlip);
  handleEditBlipRef.current = handleEditBlip;

  const handleReplyBlip = useCallback((blipId: string) => {
    if (!canEditRef.current) return;
    void handleCreateChild(blipId);
  }, [handleCreateChild]);

  const handleReplyBlipRef = useRef(handleReplyBlip);
  handleReplyBlipRef.current = handleReplyBlip;

  useEffect(() => {
    if (!FEATURES.RIZZOMA_NATIVE_RENDER) return;
    const host = hostRef.current;
    if (!host) return;

    const topicDoc = new TopicDoc();
    const awareness = new TopicAwareness(topicDoc);
    if (authUser) {
      awareness.setUser({
        id: authUser.id,
        name: authUser.name || authUser.email || 'User',
        color: colorForUserId(authUser.id),
      });
    }
    topicDocRef.current = topicDoc;
    awarenessRef.current = awareness;

    const wv = new WaveView({
      contentByBlipId: (id) => contentLookupRef.current(id),
      metaByBlipId: (id) => metaLookupRef.current?.(id) ?? null,
      onOpenHistory: (id) => onOpenHistoryRef.current?.(id),
      onEditBlip: (id, view) => handleEditBlipRef.current(id, view),
      onReplyBlip: (id) => handleReplyBlipRef.current(id),
    });
    waveViewRef.current = wv;
    wv.setRoot(rootBlipId);
    host.appendChild(wv.getRootContainer());
    onWaveViewReady?.(wv);

    return () => {
      // Clean up timers, editors, providers, and Yjs doc on unmount
      saveTimeoutsRef.current.forEach((t) => clearTimeout(t));
      saveTimeoutsRef.current.clear();
      activeHostsRef.current.forEach((h) => {
        try { h.unmount(); } catch {}
      });
      activeHostsRef.current.clear();
      activeProvidersRef.current.forEach((p) => {
        try { p.destroy(); } catch {}
      });
      activeProvidersRef.current.clear();
      awareness.destroy();
      topicDoc.destroy();
      awarenessRef.current = null;
      topicDocRef.current = null;

      const rc = wv.getRootContainer();
      if (rc.parentNode) rc.parentNode.removeChild(rc);
      wv.destroy();
      waveViewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootBlipId]);

  // Author/date follow the loaded blip data (a blip created or renamed after mount).
  useEffect(() => {
    waveViewRef.current?.refreshMeta();
  }, [blips, metaByBlipId]);

  if (!FEATURES.RIZZOMA_NATIVE_RENDER) {
    return null;
  }

  return (
    <>
      {!hideToolbar && (
        <div className="rizzoma-native-toolbar">
          {canEdit && (
            <>
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
                onClick={() => void handleCreateChild(rootBlipId)}
                title="Write a reply under this topic"
              >
                + Reply
              </button>
            </>
          )}
          <button
            className="rizzoma-native-toolbar-btn"
            type="button"
            onClick={() => setShowPlayback(true)}
            title="Wave-level playback (timeline)"
          >
            ▷ Playback
          </button>
        </div>
      )}
      <div ref={hostRef} className={className ?? 'rizzoma-native-wave-host'} />
      {showPlayback && (
        <WavePlaybackModal
          waveId={rootBlipId}
          topicTitle={topicTitle}
          blips={blips}
          onClose={() => setShowPlayback(false)}
        />
      )}
    </>
  );
};

export default NativeWaveView;
