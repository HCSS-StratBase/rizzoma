import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { isSafeRichUrl, sanitizeRichHtml } from '../lib/sanitizeRichHtml';
import { insertGadget } from '../gadgets/insert';
import type { GadgetInsertDetail } from '../gadgets/types';
import { toast } from './Toast';
import { InviteModal } from './InviteModal';
import { ShareModal } from './ShareModal';
import ExportModal from './ExportModal';
import { WavePlaybackModal } from './WavePlaybackModal';
import './RizzomaTopicDetail.css';
import type { WaveUnreadState } from '../hooks/useWaveUnread';
import { RizzomaBlip, type BlipData, type BlipContributor } from './blip/RizzomaBlip';
import { injectInlineMarkers } from './blip/inlineMarkers';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { getEditorExtensions, defaultEditorProps } from './editor/EditorConfig';
import { EDIT_MODE_EVENT, INSERT_EVENTS } from './RightToolsPanel';
import { useCollaboration } from './editor/useCollaboration';
import { yjsDocManager } from './editor/YjsDocumentManager';
import { FEATURES } from '@shared/featureFlags';
import { NativeWaveView } from './native/NativeWaveView';
import { ActiveBlipProvider, EditSurfaceActiveBridge } from './blip/ActiveBlipContext';
import { parseHtmlToContentArray } from '@client/native/parser';
import type { ContentArray } from '@client/native/types';
import { useAuthenticatedCollaborationUser } from './editor/useAuthenticatedCollaborationUser';
import { useAuth } from '../hooks/useAuth';
import { requestTaskCompletionHydration } from './editor/extensions/TaskWidget';
import { collectBlipPages } from '../lib/blipPagination';
import { subscribeBlipEvents, subscribeTopicDetail } from '../lib/socket';
import { collaborationProjectionHeaders } from '../lib/collaborationProjection';
import {
  EMPTY_BLB_HTML,
  ensureTopicBlbHtml,
  plainTextToBlbHtml,
  topicSeedHtml,
} from '@shared/blbContent';
import {
  currentTopicEditorTitle,
  needsBlbSeedProjection,
  normalizeBlbEditorDocument,
  seedEmptyBlbYdoc,
  selectionIsInTopicHeading,
  setBlbEditorBaseline,
} from './editor/blbEditorInvariant';
import { isCanonicalBlbDocument } from './editor/extensions/BlipKeyboardShortcuts';
import { readCreatedBlip } from '../lib/blipCreateResponse';
import { nextInlineChildHandoffAction } from '../lib/inlineChildHandoff';

// Global state to track loading per topic to prevent infinite loops
// Uses window property to persist across Vite HMR reloads
const LOAD_THROTTLE_MS = 5000; // Minimum time between loads
const SOCKET_COOLDOWN_MS = 10000; // Cooldown period after load to ignore socket events

export function shouldThrottleSocketTopicLoad({
  force,
  fromSocket,
  lastCompleteTime,
  now,
}: {
  force: boolean;
  fromSocket: boolean;
  lastCompleteTime: number;
  now: number;
}): boolean {
  return !force
    && fromSocket
    && lastCompleteTime > 0
    && now - lastCompleteTime < SOCKET_COOLDOWN_MS;
}

type LoadingState = { isLoading: boolean; lastLoadTime: number; lastCompleteTime: number };

function asReadOnlyBlip(blip: BlipData): BlipData {
  return {
    ...blip,
    permissions: { canRead: true, canEdit: false, canComment: false },
    childBlips: blip.childBlips?.map(asReadOnlyBlip),
  };
}
declare global {
  interface Window {
    __rizzomaLoadingState?: Map<string, LoadingState>;
  }
}

function getLoadingState(): Map<string, LoadingState> {
  if (typeof window !== 'undefined') {
    if (!window.__rizzomaLoadingState) {
      window.__rizzomaLoadingState = new Map();
    }
    return window.__rizzomaLoadingState;
  }
  // Fallback for SSR (shouldn't happen)
  return new Map();
}

function getPerfBlipLimit(): number | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  const query = hash.split('?')[1] || '';
  const params = new URLSearchParams(query);
  if (!params.has('perf')) return null;
  const rawLimit = Number(params.get('perfLimit') || '');
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 2000;
  return Math.max(500, Math.min(limit, 5000));
}

function getPerfRenderMode(): 'lite' | 'full' | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  const query = hash.split('?')[1] || '';
  const params = new URLSearchParams(query);
  if (!params.has('perf')) return null;
  const mode = params.get('perfRender');
  return mode === 'lite' ? 'lite' : 'full';
}

type TopicFull = {
  id: string;
  title: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  yjsGeneration?: number;
  authorId: string;
  authorName: string;
  permissions?: {
    role: 'outsider' | 'viewer' | 'commenter' | 'editor' | 'owner';
    canRead: boolean;
    canComment: boolean;
    canEdit: boolean;
    canManage: boolean;
  };
};

export type Participant = {
  id: string;
  userId: string;
  email?: string;
  name?: string;
  avatar?: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
  status: 'pending' | 'accepted' | 'declined';
  invitedAt: number;
  acceptedAt?: number;
};

function getTopicAvatarInitials(name?: string, email?: string): string {
  const source = name?.trim() || email?.split('@')[0]?.trim() || 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function TopicAvatar({
  participant,
  authorName,
  small = false,
  style,
}: {
  participant?: Participant;
  authorName?: string;
  small?: boolean;
  style?: CSSProperties;
}) {
  const label = participant?.name || participant?.email || authorName || 'Author';
  const initials = getTopicAvatarInitials(participant?.name || authorName, participant?.email);
  const avatar = participant?.avatar && isSafeRichUrl(participant.avatar, 'src') ? participant.avatar : undefined;
  const roleClass = participant?.role === 'owner' ? 'owner' : '';
  const pendingClass = participant?.status === 'pending' ? 'pending' : '';
  const className = `${small ? 'topic-avatar-small' : 'participant-avatar'} ${roleClass} ${pendingClass}`.trim();

  return (
    <span
      className={`${className} fallback`}
      style={style}
      title={`${label}${participant?.role === 'owner' ? ' (owner)' : ''}${participant?.status === 'pending' ? ' (invited)' : ''}`}
      aria-label={label}
    >
      <span className="topic-avatar-initials">{initials}</span>
      {avatar && (
        <img
          className="topic-avatar-image"
          src={avatar}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}

function extractTags(html: string): string[] {
  const plainText = html.replace(/<[^>]+>/g, ' ');
  const matches = plainText.match(/#[\w-]+/g) || [];
  return Array.from(new Set(matches));
}

/**
 * Extract title from HTML content (BLB: title is first line with H1/bold styling)
 * Priority: H1 content > first paragraph > first text content
 */
function extractTitleFromContent(html: string): string {
  if (!html || typeof window === 'undefined') {
    // SSR fallback
    const h1Match = html?.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) return h1Match[1].replace(/<[^>]+>/g, '').trim();
    const pMatch = html?.match(/<p[^>]*>(.*?)<\/p>/i);
    if (pMatch) return pMatch[1].replace(/<[^>]+>/g, '').trim();
    return html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split('\n')[0] || '';
  }
  const div = document.createElement('div');
  div.innerHTML = html;

  // Try H1 first
  const h1 = div.querySelector('h1');
  if (h1?.textContent?.trim()) {
    return h1.textContent.trim();
  }

  // Try first paragraph
  const p = div.querySelector('p');
  if (p?.textContent?.trim()) {
    return p.textContent.trim();
  }

  // Fallback to first line of text content
  const text = div.textContent || '';
  return text.trim().split('\n')[0] || '';
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

type RizzomaTopicDetailProps = {
  id: string;
  blipPath?: string | null;
  isAuthed?: boolean;
  unreadState?: WaveUnreadState | null;
};

/**
 * Topic data, editors, participants, and drafts are all owner-scoped. Key the
 * stateful implementation here as well as at the app shell so alternate
 * entry-points and tests cannot accidentally carry a private A-owned tree into
 * a B-owned render.
 */
export function RizzomaTopicDetail(props: RizzomaTopicDetailProps) {
  const { user } = useAuth();
  const ownerKey = user?.id
    ? `authenticated:${user.id}`
    : props.isAuthed
      ? 'authenticated:unresolved'
      : 'anonymous';
  return (
    <RizzomaTopicDetailState
      key={`${ownerKey}:${props.id}`}
      {...props}
      accessOwnerKey={ownerKey}
    />
  );
}

function RizzomaTopicDetailState({
  id,
  blipPath = null,
  isAuthed = false,
  unreadState,
  accessOwnerKey,
}: RizzomaTopicDetailProps & { accessOwnerKey: string }) {
  const collaborationUser = useAuthenticatedCollaborationUser();
  const perfRenderMode = getPerfRenderMode();
  const isPerfLite = perfRenderMode === 'lite';
  const loadingStateKey = `${accessOwnerKey}:${id}`;
  const [topic, setTopic] = useState<TopicFull | null>(null);
  const [blips, setBlips] = useState<BlipData[]>([]);
  const [allBlipsMap, setAllBlipsMap] = useState<Map<string, BlipData>>(new Map());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Server permissions are authoritative. Keep controls and collaboration
  // disabled until the access-checked topic response has arrived.
  const topicCanRead = topic?.permissions?.canRead ?? false;
  const topicCanComment = topic?.permissions?.canComment ?? false;
  const topicCanEdit = topic?.permissions?.canEdit ?? false;
  const topicCanManage = topic?.permissions?.canManage ?? false;

  // BLB: Ref to store newly created blips for immediate access (avoids race condition with state updates)
  const pendingBlipsRef = useRef<Map<string, BlipData>>(new Map());

  // Subblip navigation state (BLB: when viewing a subblip as root)
  const [currentSubblip, setCurrentSubblip] = useState<BlipData | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedBlips, setExpandedBlips] = useState<Set<string>>(new Set());
  const [newBlipContent, setNewBlipContent] = useState('');
  // Topic gear menu state (collab toolbar)
  const [showGearMenu, setShowGearMenu] = useState(false);
  // Topic gear menu state (edit toolbar)
  const [showEditGearMenu, setShowEditGearMenu] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const gearMenuRef = useRef<HTMLDivElement>(null);
  const editGearMenuRef = useRef<HTMLDivElement>(null);

  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showWavePlayback, setShowWavePlayback] = useState(false);
  const [showCommentsPanel, setShowCommentsPanel] = useState(true);

  useEffect(() => {
    if (isAuthed) return;
    setShowInviteModal(false);
    setShowShareModal(false);
    setShowGearMenu(false);
    setShowEditGearMenu(false);
  }, [isAuthed]);

  // Topic content editing state (BLB: topic is meta-blip, title is first line)
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const isEditingTopicRef = useRef(isEditingTopic);
  isEditingTopicRef.current = isEditingTopic;
  const [topicContent, setTopicContent] = useState('');
  const topicSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicProjectionActiveRef = useRef(true);
  const lastSavedContentRef = useRef<string>('');
  const topicYjsGeneration = topic?.yjsGeneration ?? 0;
  const topicProjectionIdentity = `${id}:${topicYjsGeneration}`;
  const topicProjectionIdentityRef = useRef(topicProjectionIdentity);
  if (topicProjectionIdentityRef.current !== topicProjectionIdentity) {
    topicProjectionIdentityRef.current = topicProjectionIdentity;
  }
  const autoSaveTopicContentRef = useRef<(
    content: string,
    attempt?: number,
    force?: boolean,
  ) => Promise<void>>(async () => {});

  // Ref-based callback for creating inline child blips
  // Using a ref so the TipTap extension always gets the latest version
  const createInlineChildBlipRef = useRef<((anchorPosition: number) => Promise<void>) | null>(null);
  // Ref to hold the editor instance (avoids stale closures in callbacks)
  const topicEditorRef = useRef<Editor | null>(null);
  const topicTitleRef = useRef(topic?.title || 'Untitled');
  topicTitleRef.current = topic?.title || 'Untitled';
  const topicBlbNormalizationPendingRef = useRef(false);

  // Stable callback wrapper that delegates to the ref
  const stableCreateInlineChildBlip = useCallback((anchorPosition: number) => {
    if (createInlineChildBlipRef.current) {
      createInlineChildBlipRef.current(anchorPosition);
    }
  }, []);

  // --- Real-time collaboration for topic root blip ---
  // RizzomaBlip skips collab for topic root (isTopicRoot), so this is the sole owner.
  const topicCollabEnabled = !!(FEATURES.REALTIME_COLLAB && FEATURES.LIVE_CURSORS && topicCanEdit);
  const topicYdoc = useMemo(
    () => topicCollabEnabled
      ? yjsDocManager.getDocument(id, collaborationUser?.id, topicYjsGeneration)
      : undefined,
    [collaborationUser?.id, id, topicCollabEnabled, topicYjsGeneration]
  );
  const topicCollabProvider = useCollaboration(
    topicYdoc,
    id,
    topicCollabEnabled,
    collaborationUser,
    topicYjsGeneration,
  );
  const topicCollabActive = topicCollabEnabled && !!topicYdoc && !!topicCollabProvider;
  const [syncedTopicCollabProvider, setSyncedTopicCollabProvider] = useState(
    topicCollabProvider?.synced ? topicCollabProvider : null,
  );
  const topicCollabReady = !topicCollabActive
    || Boolean(topicCollabProvider?.mutationReady && syncedTopicCollabProvider === topicCollabProvider);
  const topicCollabActiveRef = useRef(topicCollabActive);
  const topicCollabProviderRef = useRef(topicCollabProvider);
  topicCollabActiveRef.current = topicCollabActive;
  topicCollabProviderRef.current = topicCollabProvider;

  useEffect(() => {
    if (!topicCollabActive || !topicCollabProvider) {
      setSyncedTopicCollabProvider(null);
      return;
    }
    return topicCollabProvider.onSyncStateChange((synced) => {
      setSyncedTopicCollabProvider(synced ? topicCollabProvider : null);
    });
  }, [topicCollabActive, topicCollabProvider]);

  const canMutateTopicEditorNow = useCallback(() => {
    const editor = topicEditorRef.current;
    if (!isEditingTopicRef.current || !editor || (editor as any).isDestroyed) return false;
    if (!topicCollabActiveRef.current) return true;
    return Boolean(topicCollabProviderRef.current?.mutationReady);
  }, []);
  const seedingTopicYdocRef = useRef(false);
  const acceptedEditorRoster = participants
    .filter((participant) => participant.status === 'accepted' || !participant.status)
    .filter((participant) => !participant.userId.startsWith('invite:'))
    .map((participant) => ({
      id: participant.userId,
      label: participant.name || participant.email || participant.userId,
      email: participant.email,
    }));
  const topicRosterKey = acceptedEditorRoster.map((participant) => `${participant.id}:${participant.label}`).join('|');

  // TipTap editor for topic content (meta-blip editing)
  const useTopicEditorWithDeps = useEditor as unknown as (
    options: Parameters<typeof useEditor>[0],
    deps: unknown[],
  ) => Editor | null;
  const topicEditor = useTopicEditorWithDeps({
    extensions: getEditorExtensions(
      topicCollabActive ? topicYdoc : undefined,
      topicCollabActive ? topicCollabProvider : undefined,
      {
        waveId: id,
        isTopicRoot: true,
        onCreateInlineChildBlip: stableCreateInlineChildBlip,
        currentUser: collaborationUser ? { id: collaborationUser.id, label: collaborationUser.name } : null,
        participants: acceptedEditorRoster,
      }
    ),
    // Collaboration must begin from the server Y.Doc alone. Supplying even an
    // empty local document here can be normalized before sync and then merged
    // beside the authoritative snapshot as a second H1+UL root.
    content: topicCollabActive ? undefined : '',
    editable: false,
    editorProps: defaultEditorProps,
    onUpdate: ({ editor }: { editor: Editor }) => {
      // Skip auto-save during Y.Doc seeding
      if (seedingTopicYdocRef.current) return;
      if (topicBlbNormalizationPendingRef.current) return;
      if (topicCollabActive && !topicCollabProvider?.synced) return;

      const html = editor.getHTML();
      if (!isCanonicalBlbDocument(editor.state.doc, true)) {
        topicBlbNormalizationPendingRef.current = true;
        queueMicrotask(() => {
          if ((editor as any).isDestroyed) {
            topicBlbNormalizationPendingRef.current = false;
            return;
          }
          const repairTitle = currentTopicEditorTitle(editor, topicTitleRef.current);
          const repaired = normalizeBlbEditorDocument(editor, {
            kind: 'topic',
            title: repairTitle,
          }).html;
          topicBlbNormalizationPendingRef.current = false;
          setTopicContent(repaired);
          if (topicSaveTimeoutRef.current) clearTimeout(topicSaveTimeoutRef.current);
          topicSaveTimeoutRef.current = setTimeout(() => {
            // A nonempty invalid collaborative snapshot needs a forced Couch
            // materialization; local equality may reflect only lazy rendering.
            void autoSaveTopicContent(repaired, 0, true);
          }, 300);
        });
        return;
      }
      setTopicContent(html);

      // Materialize both local and remote convergence. The callback reads the
      // latest editor HTML and full-state Yjs digest when the timer fires, and the
      // server rejects a projection that raced a newer CRDT update.
      if (topicSaveTimeoutRef.current) {
        clearTimeout(topicSaveTimeoutRef.current);
      }
      topicSaveTimeoutRef.current = setTimeout(() => {
        const latestHtml = topicEditorRef.current?.getHTML() || html;
        void autoSaveTopicContent(latestHtml);
      }, 300);
    },
  }, [id, topicCollabActive, topicYdoc, topicCollabProvider, stableCreateInlineChildBlip, collaborationUser?.id, collaborationUser?.name, topicRosterKey]);

  // Keep editor ref updated for use in callbacks
  topicEditorRef.current = topicEditor;

  // Track if we've set initial content for current edit session
  const hasSetInitialContentRef = useRef(false);

  // Reset the ref when exiting edit mode
  useEffect(() => {
    if (!isEditingTopic) {
      hasSetInitialContentRef.current = false;
    }
  }, [isEditingTopic]);

  // Notify RightToolsPanel of edit mode changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EDIT_MODE_EVENT, {
      detail: { isEditing: isEditingTopic && topicCollabReady, blipId: id },
    }));
  }, [id, isEditingTopic, topicCollabReady]);

  // Connectivity is folded into `isAuthed` by RizzomaLayout. If it drops
  // while this editor is active, freeze the surface without issuing a REST
  // save. The Y.Doc/provider retains and retries any acknowledged-pending
  // local state after the authorized reconnect.
  useEffect(() => {
    if (isAuthed || !isEditingTopic) return;
    if (topicSaveTimeoutRef.current) {
      clearTimeout(topicSaveTimeoutRef.current);
      topicSaveTimeoutRef.current = null;
    }
    setIsEditingTopic(false);
    topicEditor?.setEditable(false);
  }, [isAuthed, isEditingTopic, topicEditor]);

  // Handle insert events from RightToolsPanel when topic editor is active
  useEffect(() => {
    if (!isEditingTopic || !topicEditor || !topicCollabReady) return;

    // Helper: insert trigger char with space prefix if needed (suggestion plugins require allowedPrefixes=[' '])
    const insertTrigger = (char: string) => {
      if (!canMutateTopicEditorNow()) return;
      topicEditor.commands['focus']();
      const { from } = topicEditor.state.selection;
      const $from = topicEditor.state.doc.resolve(from);
      const charBefore = from > $from.start() ? topicEditor.state.doc.textBetween(from - 1, from) : '';
      const prefix = charBefore && charBefore !== ' ' ? ' ' : '';
      document.execCommand('insertText', false, prefix + char);
    };
    const handleInsertMention = () => insertTrigger('@');
    const handleInsertTask = () => insertTrigger('~');
    const handleInsertTag = () => insertTrigger('#');
    const handleInsertReply = () => {
      if (!canMutateTopicEditorNow()) return;
      const { from } = topicEditor.state.selection;
      createInlineChildBlipRef.current?.(from);
    };
    const handleInsertGadget = (e: Event) => {
      if (!canMutateTopicEditorNow()) return;
      const detail = (e as CustomEvent<GadgetInsertDetail>).detail;
      try {
        insertGadget(topicEditor as any, detail || null);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Invalid gadget source', 'error');
      }
    };

    window.addEventListener(INSERT_EVENTS.MENTION, handleInsertMention);
    window.addEventListener(INSERT_EVENTS.TASK, handleInsertTask);
    window.addEventListener(INSERT_EVENTS.TAG, handleInsertTag);
    window.addEventListener(INSERT_EVENTS.REPLY, handleInsertReply);
    window.addEventListener(INSERT_EVENTS.GADGET, handleInsertGadget);
    return () => {
      window.removeEventListener(INSERT_EVENTS.MENTION, handleInsertMention);
      window.removeEventListener(INSERT_EVENTS.TASK, handleInsertTask);
      window.removeEventListener(INSERT_EVENTS.TAG, handleInsertTag);
      window.removeEventListener(INSERT_EVENTS.REPLY, handleInsertReply);
      window.removeEventListener(INSERT_EVENTS.GADGET, handleInsertGadget);
    };
  }, [canMutateTopicEditorNow, isEditingTopic, topicCollabReady, topicEditor]);

  // Sync editor content and editable state when entering edit mode.
  // With Collaboration, wait for server sync before seeding — only seed if Y.Doc is empty.
  useEffect(() => {
    if (topicEditor && isEditingTopic && topicContent && !hasSetInitialContentRef.current) {
      const setContentAndFocus = () => {
        if ((topicEditor as any).isDestroyed || !canMutateTopicEditorNow()) return;
        topicEditor.setEditable(true);
        setTimeout(() => {
          if (canMutateTopicEditorNow()) topicEditor.commands['focus']('end');
        }, 50);
      };

      if (topicCollabActive && topicYdoc && topicCollabProvider) {
        // Collab: wait for server sync, only seed if Y.Doc fragment is empty
        hasSetInitialContentRef.current = true;
        topicCollabProvider.onSynced(() => {
          if ((topicEditor as any).isDestroyed) return;
          if (topicCollabProvider.shouldSeed) {
            if (topicYdoc.getXmlFragment('default').length > 0) {
              setContentAndFocus();
              return;
            }
            const durableSeedContent = sanitizeRichHtml(
              topicCollabProvider.seedContent ?? topic?.content ?? topicContent,
            );
            const authoritativeSeed = sanitizeRichHtml(ensureTopicBlbHtml(
              topicTitleRef.current,
              durableSeedContent,
            ));
            const needsMigration = needsBlbSeedProjection(durableSeedContent, authoritativeSeed);
            seedingTopicYdocRef.current = true;
            try {
              seedEmptyBlbYdoc(topicEditor, topicYdoc, authoritativeSeed);
            } finally {
              seedingTopicYdocRef.current = false;
            }
            setTopicContent(authoritativeSeed);
            if (needsMigration) {
              if (topicSaveTimeoutRef.current) clearTimeout(topicSaveTimeoutRef.current);
              // Seeding suppresses onUpdate; explicitly migrate only a changed
              // canonical shared document through the digest-backed projection.
              topicSaveTimeoutRef.current = setTimeout(() => {
                void autoSaveTopicContentRef.current(authoritativeSeed, 0, true);
              }, 0);
            }
          }
          setContentAndFocus();
        });
      } else {
        // No collab: set content directly
        hasSetInitialContentRef.current = true;
        setBlbEditorBaseline(topicEditor, sanitizeRichHtml(ensureTopicBlbHtml(
          topicTitleRef.current,
          topicContent,
        )));
        setContentAndFocus();
      }
    } else if (topicEditor && !isEditingTopic) {
      topicEditor.setEditable(false);
    }
  }, [canMutateTopicEditorNow, topicEditor, isEditingTopic, topicContent, topic?.content, topicCollabActive, topicYdoc, topicCollabProvider]);

  useEffect(() => {
    if (!topicEditor || (topicEditor as any).isDestroyed) return;
    const editable = isEditingTopic && topicCollabReady;
    topicEditor.setEditable(editable);
  }, [isEditingTopic, topicCollabReady, topicEditor]);

  // Use refs to avoid dependency issues in callbacks
  const unreadStateRef = useRef(unreadState);
  const isAuthedRef = useRef(isAuthed);
  useEffect(() => { unreadStateRef.current = unreadState; }, [unreadState]);
  useEffect(() => { isAuthedRef.current = isAuthed; }, [isAuthed]);

  // BLB: Sync unread state into blip tree when unread set changes
  useEffect(() => {
    if (!unreadState?.unreadSet || blips.length === 0) return;
    const unreadSet = unreadState.unreadSet;
    let changed = false;

    const updateBlip = (blip: BlipData): BlipData => {
      const nextRead = !unreadSet.has(blip.id);
      const nextChildren = blip.childBlips?.map(updateBlip) ?? [];
      const childChanged = nextChildren.some((child, idx) => child !== blip.childBlips?.[idx]);
      if (blip.isRead !== nextRead || childChanged) {
        changed = true;
        return { ...blip, isRead: nextRead, childBlips: nextChildren };
      }
      return blip;
    };

    const nextBlips = blips.map(updateBlip);
    if (!changed) return;

    const nextMap = new Map(allBlipsMap);
    nextBlips.forEach((root) => {
      const walk = (node: BlipData) => {
        nextMap.set(node.id, node);
        node.childBlips?.forEach(walk);
      };
      walk(root);
    });
    setBlips(nextBlips);
    setAllBlipsMap(nextMap);
  }, [unreadState?.version, blips, allBlipsMap]);

  const clearLoadedTopicState = useCallback(() => {
    if (topicSaveTimeoutRef.current) {
      clearTimeout(topicSaveTimeoutRef.current);
      topicSaveTimeoutRef.current = null;
    }
    const mountedEditor = topicEditorRef.current;
    if (mountedEditor && !mountedEditor.isDestroyed) {
      mountedEditor.setEditable(false);
    }
    pendingBlipsRef.current.clear();
    lastSavedContentRef.current = '';
    setTopic(null);
    setBlips([]);
    setAllBlipsMap(new Map());
    setParticipants([]);
    setCurrentSubblip(null);
    setExpandedBlips(new Set());
    setNewBlipContent('');
    setTopicContent('');
    setIsEditingTopic(false);
    setShowInviteModal(false);
    setShowShareModal(false);
    setShowExportModal(false);
    setShowWavePlayback(false);
    setShowGearMenu(false);
    setShowEditGearMenu(false);
  }, []);

  // Loading/throttle state is owner-partitioned. An in-flight request from A
  // must never suppress B's first access-checked request for the same topic.
  useEffect(() => {
    const loadingState = getLoadingState();
    if (!loadingState.has(loadingStateKey)) {
      loadingState.set(loadingStateKey, { isLoading: false, lastLoadTime: 0, lastCompleteTime: 0 });
    }
  }, [loadingStateKey]);

  const load = useCallback(async (force = false, fromSocket = false): Promise<void> => {
    // Get or create global state for this owner + topic pair.
    const loadingState = getLoadingState();
    let state = loadingState.get(loadingStateKey);
    if (!state) {
      state = { isLoading: false, lastLoadTime: 0, lastCompleteTime: 0 };
      loadingState.set(loadingStateKey, state);
    }

    // Prevent concurrent loads — UNLESS force=true. The Ctrl+Enter create
    // handler relies on `await load(true)` actually fetching the new blip
    // before dispatching the inline-expand event; if we silently early-
    // returned here, the UI's `inlineChildren` would still hold the
    // pre-create snapshot when the toggle fires → handler matches by
    // parentId but renderer can't find the new child in inlineChildren →
    // portal never mounts → no editor → typing falls back to parent.
    if (state.isLoading && !force) {
      return;
    }

    const now = Date.now();

    // Socket-triggered loads have a longer cooldown after the last completed load
    // This breaks the feedback loop where load -> socket event -> load
    if (shouldThrottleSocketTopicLoad({ force, fromSocket, lastCompleteTime: state.lastCompleteTime, now })) {
      return;
    }

    // Time-based throttling for all loads
    if (!force && state.lastLoadTime > 0 && (now - state.lastLoadTime) < LOAD_THROTTLE_MS) {
      return;
    }

    state.isLoading = true;
    state.lastLoadTime = now;

    try {
      // Bug A perf fix (2026-05-11): parallelize the 3 independent fetches.
      // Was 3 sequential awaits (~90-250ms total); now ~max of the three
      // (~30-100ms). Saves ~100ms on every load(), including the one
      // gating Ctrl+Enter latency.
      const perfBlipLimit = getPerfBlipLimit();
      const blipPageSize = Math.min(perfBlipLimit || 500, 500);
      const [r, participantsResponse, blipsResponse] = await Promise.all([
        api(`/api/topics/${encodeURIComponent(id)}`),
        api(`/api/waves/${encodeURIComponent(id)}/participants`),
        api(`/api/blips?waveId=${encodeURIComponent(id)}&limit=${blipPageSize}`),
      ]);
      if (r.ok) {
        const loadedTopic = r.data as TopicFull;
        setTopic(loadedTopic);

        let loadedParticipants: Participant[] = [];
        if (participantsResponse.ok && participantsResponse.data?.participants) {
          loadedParticipants = participantsResponse.data.participants as Participant[];
        }
        // A demotion can make the participant endpoint inaccessible while the
        // topic itself remains readable. Never retain the earlier roster.
        setParticipants(loadedParticipants);

        // Convert participants to contributor format for blips
        const contributors: BlipContributor[] = loadedParticipants
          .filter((participant) => participant.status === 'accepted' || !participant.status)
          .filter((participant) => !participant.userId.startsWith('invite:'))
          .map(p => ({
          id: p.userId,
          email: p.email || '',
          name: p.name || (p.email || p.userId).split('@')[0],
          avatar: p.avatar,
          role: p.role,
          }));

        if (blipsResponse.ok && blipsResponse.data?.blips) {
          const rawBlips = await collectBlipPages<any>(
            blipsResponse.data as { blips?: any[]; nextBookmark?: string | null },
            async (bookmark) => {
              const next = await api(
                `/api/blips?waveId=${encodeURIComponent(id)}&limit=${blipPageSize}&bookmark=${encodeURIComponent(bookmark)}`,
              );
              if (!next.ok || !next.data) throw new Error('blip_page_load_failed');
              return next.data as { blips?: any[]; nextBookmark?: string | null };
            },
            { maxItems: perfBlipLimit ?? Number.POSITIVE_INFINITY },
          );
          const unreadSet = unreadStateRef.current?.unreadSet ?? new Set<string>();
          const blipMap = new Map<string, BlipData>();
          rawBlips.forEach(raw => {
            // Generate blipPath from id (e.g., "waveId:b1234567" -> "b1234567")
            const rawId = raw._id || raw.id;
            const blipPathSegment = rawId.includes(':') ? rawId.split(':')[1] : rawId;
            blipMap.set(rawId, {
              id: rawId,
              blipPath: blipPathSegment, // BLB: path segment for URL navigation
              content: raw.content || '',
              authorId: raw.authorId || '',
              authorName: raw.authorName || 'Unknown',
              createdAt: raw.createdAt || Date.now(),
              updatedAt: raw.updatedAt || raw.createdAt || Date.now(),
              yjsGeneration: raw.yjsGeneration ?? 0,
              isRead: !unreadSet.has(rawId),
              parentBlipId: raw.parentId || null,
              childBlips: [],
              isFoldedByDefault: typeof raw.isFoldedByDefault === 'boolean' ? raw.isFoldedByDefault : undefined,
              permissions: raw.permissions || {
                canEdit: loadedTopic.permissions?.canEdit ?? false,
                canComment: loadedTopic.permissions?.canComment ?? false,
                canRead: loadedTopic.permissions?.canRead ?? false,
              },
              // Attach topic participants as contributors to each blip
              contributors: contributors,
              // BLB: If blip has anchorPosition, it's inline (shown as [+] marker, not in list)
              anchorPosition: raw.anchorPosition,
            });
          });
          const rootBlips: BlipData[] = [];
          blipMap.forEach((blip) => {
            if (blip.parentBlipId) {
              const parent = blipMap.get(blip.parentBlipId);
              if (parent) {
                parent.childBlips = parent.childBlips || [];
                parent.childBlips.push(blip);
              } else {
                rootBlips.push(blip);
              }
            } else {
              rootBlips.push(blip);
            }
          });
          const sortBlips = (items: BlipData[]) => {
            items.sort((a, b) => a.createdAt - b.createdAt);
            items.forEach(blip => { if (blip.childBlips?.length) sortBlips(blip.childBlips); });
          };
          sortBlips(rootBlips);
          setBlips(rootBlips);
          setAllBlipsMap(blipMap); // Store for subblip navigation
        } else {
          // Fail closed if a partial access check denies the blip collection.
          setBlips([]);
          setAllBlipsMap(new Map());
          setCurrentSubblip(null);
        }

        // DISABLED: Refreshing unread state here was contributing to infinite loop
        // The useWaveUnread hook has its own refresh mechanism
        // if (unreadStateRef.current?.refresh) {
        //   try { await unreadStateRef.current.refresh(); } catch {}
        // }
        setError(null);
      } else {
        if (r.status === 401 || r.status === 403) {
          clearLoadedTopicState();
          setError(r.status === 401 ? 'Sign in to view this topic' : 'You do not have access to this topic');
        } else {
          setError('Failed to load topic');
        }
      }
    } catch {
      // The response may have failed after an auth transition or mid-page
      // revocation. The error UI already replaces the topic; erase the backing
      // private state too so Retry can only repopulate it through a fresh,
      // access-checked response.
      clearLoadedTopicState();
      setError('Failed to load topic');
    } finally {
      state.isLoading = false;
      state.lastCompleteTime = Date.now();
    }
  }, [clearLoadedTopicState, id, loadingStateKey]);

  // Initial load + reload when the owner-scoped implementation is remounted.
  useEffect(() => { load(); }, [load]);

  // BLB: Find and set the current subblip when blipPath changes
  useEffect(() => {
    // Check if hash indicates a subblip path (may be ahead of prop due to timing)
    const hash = window.location.hash || '';
    const hashMatch = hash.match(/^#\/topic\/[^/]+\/(.+?)(?:\?.*)?$/);
    const hashBlipPath = hashMatch ? hashMatch[1].replace(/\/$/, '') : null;

    // Use prop first, but fall back to hash if prop is null but hash has a path
    // This handles the race condition where hash is updated before parent re-renders
    const effectiveBlipPath = blipPath || hashBlipPath;

    if (!effectiveBlipPath) {
      setCurrentSubblip(null);
      return;
    }

    // Find blip by blipPath segment
    // blipPath can be a single segment like "b1234567" or multiple "b123/b456"
    const pathSegment = effectiveBlipPath.replace(/\/$/, ''); // Remove trailing slash

    // Search through all blips to find one matching this path
    // First check pendingBlipsRef for newly created blips (avoids race condition)
    let foundInPending: BlipData | undefined;
    for (const [, blip] of pendingBlipsRef.current) {
      if (blip.blipPath === pathSegment) {
        foundInPending = blip;
        break;
      }
    }

    // Then check allBlipsMap if not found in pending
    let foundInMap: BlipData | undefined;
    if (!foundInPending) {
      for (const [, blip] of allBlipsMap) {
        if (blip.blipPath === pathSegment) {
          foundInMap = blip;
          break;
        }
      }
    }

    const foundBlip = foundInPending || foundInMap;
    if (foundBlip) {
      setCurrentSubblip(foundBlip);
      // Clean up from pending ref if found in main map
      if (allBlipsMap.has(foundBlip.id)) {
        pendingBlipsRef.current.delete(foundBlip.id);
      }
    } else {
      // Blip not found - maybe still loading
      setCurrentSubblip(null);
    }
  }, [blipPath, allBlipsMap]);

  // BLB: Navigation helper to go back to parent
  const navigateToParent = useCallback(() => {
    if (currentSubblip?.parentBlipId) {
      // Find the parent blip
      const parent = allBlipsMap.get(currentSubblip.parentBlipId);
      if (parent?.blipPath) {
        window.location.hash = `#/topic/${id}/${parent.blipPath}/`;
      } else {
        // Parent is the topic root
        window.location.hash = `#/topic/${id}`;
      }
    } else {
      // No parent - go to topic root
      window.location.hash = `#/topic/${id}`;
    }
  }, [currentSubblip, allBlipsMap, id]);

  // BLB: Navigation helper to navigate into a subblip
  const navigateToSubblip = useCallback((blip: BlipData) => {
    if (blip.blipPath) {
      window.location.hash = `#/topic/${id}/${blip.blipPath}/`;
    }
  }, [id]);

  // Update the ref with the actual createInlineChildBlip implementation
  // BLB: Creates a subblip and navigates into it
  useEffect(() => {
    createInlineChildBlipRef.current = async (anchorPosition: number) => {
      const editor = topicEditorRef.current;
      if (!canMutateTopicEditorNow()) return;
      if (editor && selectionIsInTopicHeading(editor)) {
        toast('Create a child from a bulleted label, not the topic title', 'error');
        return;
      }
      if (!topicCanComment) {
        toast(isAuthed ? 'You do not have permission to comment' : 'Sign in to create comments', 'error');
        return;
      }
      await ensureCsrf();
      const requestBody = {
        waveId: id,
        // BLB: new blips default to a bulleted list (every blip body is BLB-shaped).
        // Matches original Rizzoma where Ctrl+Enter created a bulleted thread.
        content: EMPTY_BLB_HTML,
        parentId: null, // This is a child of the topic/wave itself (root-level blip)
        anchorPosition: anchorPosition, // The cursor position where this inline comment is anchored
      };
      try {
        const response = await api('/api/blips', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });
        if (response.ok && response.data) {
          const createdBlip = readCreatedBlip(response.data);
          const newBlipId = createdBlip?.id;

          if (createdBlip && newBlipId) {
            // BLB: Insert [+] marker at cursor position in the topic content.
            // No setTextSelection: anchorPosition is now a TEXT-character offset
            // (not a PM doc position). The cursor is still at the original
            // selection from the Ctrl+Enter keypress, which is the correct
            // structural anchor — matches original Rizzoma's blip-thread
            // positioning model (renderer.coffee:107-113).
            if (editor && canMutateTopicEditorNow()) {
              (editor.commands as any)['insertBlipThread']({ threadId: newBlipId, hasUnread: false });
            } else {
              // The durable child already records its anchor. Preserve it and
              // let the authoritative reload attach it after collaboration
              // resynchronizes; never mutate the disconnected topic Y.Doc.
              window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
              toast('Child created; reconnecting before attaching it.', 'info');
              return;
            }

            // BLB: Extract blipPath and navigate to the new subblip
            const blipPathSegment = newBlipId.includes(':') ? newBlipId.split(':')[1] : newBlipId;

            // BLB: Create the blip data object
            const newBlipData: BlipData = {
              id: newBlipId,
              blipPath: blipPathSegment,
              content: createdBlip.content,
              authorId: createdBlip.authorId,
              authorName: createdBlip.authorName,
              createdAt: createdBlip.createdAt,
              updatedAt: createdBlip.updatedAt,
              yjsGeneration: 0,
              isRead: true,
              parentBlipId: undefined,
              childBlips: [],
              permissions: { canEdit: topicCanEdit, canComment: topicCanComment, canRead: topicCanRead },
              contributors: [],
            };

            // BLB: Add to pendingBlipsRef for IMMEDIATE access
            pendingBlipsRef.current.set(newBlipId, newBlipData);

            // BLB: Also add to allBlipsMap state
            setAllBlipsMap(prev => {
              const updated = new Map(prev);
              updated.set(newBlipId, newBlipData);
              return updated;
            });

            // OPTIMISTIC: also add to `blips` so `inlineChildren` includes
            // the new child IMMEDIATELY on next render — without this the
            // portal expansion fires before `load(true)` finishes, and the
            // renderer's filter can't find the child (the bug exposed by
            // the depth-10 side-by-side: child blips created on server but
            // never expanded inline → typing fell back to parent editor).
            const optimisticBlip: BlipData = {
              ...newBlipData,
              anchorPosition: anchorPosition,
            };
            setBlips(prev => {
              if (prev.some(b => b.id === newBlipId)) return prev;
              return [...prev, optimisticBlip];
            });

            // BLB: Expand the new child inline + auto-enter edit mode so user
            // can type immediately. Order matters and timing is tricky:
            //
            //   1. AWAIT load(true) so the parent's `inlineChildren` state
            //      contains the new blip BEFORE we dispatch the toggle event.
            //      Without this await, the toggle handler at
            //      RizzomaBlip.tsx:803 silently dropped the event because
            //      `inlineChildren.find(c => c.id === threadId)` returned
            //      undefined → child stayed collapsed → no inline editor
            //      mounted → keystrokes went back to the parent's editor.
            //      That was the root cause of the "Ctrl+Enter doesn't open
            //      child editor" bug visible in the depth-10 side-by-side.
            //   2. Dispatch toggle (immediate) — handler can now find the
            //      blip in `inlineChildren` and expand it.
            //   3. RAF + dispatch enter-edit — the inline editor needs one
            //      paint cycle to mount before we can focus it.
            try {
              await load(true);
            } catch {
              // load() rarely fails; if it does the optimistic state above
              // still lets the toggle render.
            }
            window.dispatchEvent(new CustomEvent('rizzoma:ensure-inline-blip-expanded', {
              detail: { threadId: newBlipId, parentId: id }
            }));
            // Robust edit-entry (2026-07-09): under the single-active model the
            // child's claim closes the TOPIC editor, which unmounts the child's
            // first mount (it lived inside the editor's BlipThreadNode portal).
            // Keep re-driving until the child's editor is actually editable.
            // Claiming the child closes the topic editor, which temporarily
            // removes the portal container. The topic-root RizzomaBlip may also
            // remount and lose its local expanded-child state, so retries must
            // re-assert expansion idempotently. They must never toggle.
            const tryEnterEdit = (attempt: number) => {
              const container = document.querySelector(`[data-blip-id="${newBlipId}"]`);
              const editable = container?.querySelector('.ProseMirror[contenteditable="true"]');
              const action = nextInlineChildHandoffAction(Boolean(container), Boolean(editable));
              if (action === 'done') return;
              if (action === 'ensure-expanded' || !editable) {
                window.dispatchEvent(new CustomEvent('rizzoma:ensure-inline-blip-expanded', {
                  detail: { threadId: newBlipId, parentId: id }
                }));
                // The state event can race the topic-root RizzomaBlip's first
                // listener/effect commit. Once the durable marker is present,
                // fall back to the exact user path (marker click) to force the
                // inline thread open instead of silently timing out with a
                // saved but invisible child.
                const marker = document.querySelector<HTMLElement>(
                  `[data-blip-thread="${CSS.escape(newBlipId)}"]`
                );
                if (marker && marker.textContent !== '−') {
                  marker.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
              }
              if (action === 'enter-edit') {
                window.dispatchEvent(new CustomEvent('rizzoma:enter-edit-blip', {
                  detail: { blipId: newBlipId }
                }));
              }
              if (attempt < 60) setTimeout(() => tryEnterEdit(attempt + 1), attempt < 2 ? 150 : 400);
            };
            requestAnimationFrame(() => requestAnimationFrame(() => tryEnterEdit(0)));
          } else {
            toast('Subblip created');
            load(true); // Fallback: reload to show the new blip
          }
        } else {
          toast('Failed to create comment', 'error');
        }
      } catch (err) {
        console.error('[TopicDetail] Error creating blip:', err);
        toast('Failed to create comment', 'error');
      }
    };
  }, [canMutateTopicEditorNow, isAuthed, topicCanRead, topicCanComment, topicCanEdit, id, load]);

  // Debounced load for socket/event-triggered reloads
  // These pass fromSocket=true so they respect the longer socket cooldown period
  const debouncedLoadRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debouncedLoadRef.current) clearTimeout(debouncedLoadRef.current);
    debouncedLoadRef.current = setTimeout(() => {
      debouncedLoadRef.current = null;
      load(true, true); // force=true, fromSocket=true
    }, 500);
  }, [load]);

  // Reload from authoritative storage when collaborators change this topic.
  // GET-only reloads do not emit mutation events; the debounce and socket
  // cooldown coalesce bursts without disabling collaboration updates.
  useEffect(() => {
    if (!id) return;
    const unsubscribeTopic = subscribeTopicDetail(id, () => debouncedLoad());
    const unsubscribeBlips = subscribeBlipEvents(id, (event) => {
      if (event.action !== 'read') debouncedLoad();
    });
    return () => {
      unsubscribeTopic();
      unsubscribeBlips();
      if (debouncedLoadRef.current) {
        clearTimeout(debouncedLoadRef.current);
        debouncedLoadRef.current = null;
      }
    };
  }, [id, debouncedLoad]);

  // Listen for refresh events from RizzomaBlip (e.g., after duplicate/paste)
  // Using direct load with throttle instead of debounced to avoid feedback loop
  useEffect(() => {
    const handleRefresh = () => {
      // Use direct load with force=true but fromSocket=true for throttling
      load(true, true);
    };
    window.addEventListener('rizzoma:refresh-topics', handleRefresh);
    return () => window.removeEventListener('rizzoma:refresh-topics', handleRefresh);
  }, [load]);

  useEffect(() => {
    const handleAccessChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ waveId?: string }>).detail;
      if (!detail?.waveId || detail.waveId !== id) return;
      void load(true);
    };
    window.addEventListener('rizzoma:access-changed', handleAccessChanged);
    return () => window.removeEventListener('rizzoma:access-changed', handleAccessChanged);
  }, [id, load]);

  // Bug A perf fix (2026-05-07): expose an awaitable reload so child blips
  // can do `await window.__rizzomaTopicReload()` instead of dispatching
  // refresh-topics + sleeping 600ms blindly. Saves ~350ms on Ctrl+Enter at
  // depth 1 (load completes in 90-250ms vs 600ms timer).
  //
  // Bug A last-mile (Task #191, 2026-05-11): profile showed the remaining
  // 271ms of 432ms total Ctrl+Enter wallclock IS the load() round-trip
  // (POST is only 54ms, TipTap mount only 6ms). Re-exposing
  // __rizzomaTopicAddBlip for optimistic mount — the earlier revert
  // (321fd29a + 299b50b8) was actually caused by the autosave-on-mount
  // bug that wrote <p></p> over the new blip's content, not by the
  // optimistic mount itself. Now that the autosave fix is in (65e2a11c),
  // optimistic mount should work cleanly.
  useEffect(() => {
    const w = window as unknown as {
      __rizzomaTopicReload?: () => Promise<void>;
      __rizzomaTopicAddBlip?: (blip: BlipData) => void;
    };
    w.__rizzomaTopicReload = () => load(true);
    w.__rizzomaTopicAddBlip = (blip: BlipData) => {
      setBlips((prev) => {
        // Dedup — if already in the flat top-level list, no-op.
        if (prev.some((b) => b.id === blip.id)) return prev;
        // Try to attach as a child of an existing blip's childBlips. Track
        // whether we found the parent in the tree so we can fall back to
        // top-level append if not.
        let foundParent = false;
        const walk = (items: BlipData[]): BlipData[] => items.map((b) => {
          if (b.id === blip.parentBlipId) {
            foundParent = true;
            const exists = (b.childBlips || []).some((c) => c.id === blip.id);
            if (exists) return b;
            return { ...b, childBlips: [...(b.childBlips || []), blip] };
          }
          if (b.childBlips?.length) {
            return { ...b, childBlips: walk(b.childBlips) };
          }
          return b;
        });
        const updated = walk(prev);
        if (foundParent) return updated;
        // Parent not in the in-memory tree → must be the topic itself (or a
        // not-yet-loaded blip). For topic-root parented blips, append at the
        // top level of `blips` — load() does the same in its parentless
        // branch (rootBlips.push).
        return [...prev, blip];
      });
    };
    return () => {
      if (w.__rizzomaTopicReload) delete w.__rizzomaTopicReload;
      if (w.__rizzomaTopicAddBlip) delete w.__rizzomaTopicAddBlip;
    };
  }, [load]);

  // BLB: Update inline marker unread state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unreadSet = unreadStateRef.current?.unreadSet ?? new Set<string>();
    const updateMarkers = () => {
      const markers = Array.from(document.querySelectorAll<HTMLElement>('.blip-thread-marker'));
      markers.forEach((marker) => {
        const threadId = marker.getAttribute('data-blip-thread') || '';
        const hasUnread = !!(threadId && unreadSet.has(threadId));
        marker.classList.toggle('has-unread', hasUnread);
        marker.textContent = '+';
      });
    };
    const raf = window.requestAnimationFrame(updateMarkers);
    return () => window.cancelAnimationFrame(raf);
  }, [unreadState?.version, allBlipsMap.size]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debouncedLoadRef.current) clearTimeout(debouncedLoadRef.current);
    };
  }, []);

  const createRootBlip = useCallback(async () => {
    if (!newBlipContent.trim() || busy) return;
    if (!topicCanComment) { toast(isAuthed ? 'You do not have permission to comment' : 'Sign in to create blips', 'error'); return; }
    await ensureCsrf();
    setBusy(true);
    try {
      const r = await api('/api/blips', {
        method: 'POST',
        body: JSON.stringify({ waveId: id, content: plainTextToBlbHtml(newBlipContent) })
      });
      if (r.ok) { toast('Blip created'); setNewBlipContent(''); load(true); }
      else { toast('Failed to create blip', 'error'); }
    } catch { toast('Failed to create blip', 'error'); }
    setBusy(false);
  }, [newBlipContent, busy, isAuthed, topicCanComment, id, load]);

  // Handlers for RizzomaBlip component
  const handleBlipUpdate = useCallback((_blipId: string, _content: string) => {
    // Blip was updated - reload to get fresh data
    load(true);
  }, [load]);

  const handleAddReply = useCallback((_parentBlipId: string, _content: string) => {
    // Reply was added - reload to get fresh data
    load(true);
  }, [load]);

  const handleDeleteBlip = useCallback(async (blipId: string) => {
    await ensureCsrf();
    const r = await api(`/api/blips/${encodeURIComponent(blipId)}`, { method: 'DELETE' });
    if (r.ok) {
      toast('Deleted');
      load(true);
    } else {
      toast('Delete failed', 'error');
      throw new Error('Delete failed');
    }
  }, [load]);

  const handleBlipRead = useCallback(async (blipId: string) => {
    // Mark blip as read
    try {
      await api(`/api/waves/${encodeURIComponent(id)}/blips/${encodeURIComponent(blipId)}/read`, { method: 'POST' });
    } catch {
      // Silent fail for read status
    }
  }, [id]);

  const handleExpand = useCallback((blipId: string) => {
    setExpandedBlips(prev => {
      const next = new Set(prev);
      next.add(blipId);
      return next;
    });
  }, []);

  const handleToggleCollapse = useCallback((blipId: string) => {
    setExpandedBlips(prev => {
      const next = new Set(prev);
      if (next.has(blipId)) {
        next.delete(blipId);
      } else {
        next.add(blipId);
      }
      return next;
    });
  }, []);

  // Global fold-all / unfold-all event listeners (from RightToolsPanel ▲/▼ buttons)
  useEffect(() => {
    const collectAllBlipIds = (blipList: BlipData[]): string[] => {
      const ids: string[] = [];
      const walk = (list: BlipData[]) => {
        for (const b of list) {
          ids.push(b.id);
          if (b.childBlips) walk(b.childBlips);
        }
      };
      walk(blipList);
      return ids;
    };

    const handleFoldAll = () => {
      setExpandedBlips(new Set());
    };

    const handleUnfoldAll = () => {
      const allIds = collectAllBlipIds(blips);
      setExpandedBlips(new Set(allIds));
    };

    window.addEventListener('rizzoma:fold-all', handleFoldAll);
    window.addEventListener('rizzoma:unfold-all', handleUnfoldAll);
    return () => {
      window.removeEventListener('rizzoma:fold-all', handleFoldAll);
      window.removeEventListener('rizzoma:unfold-all', handleUnfoldAll);
    };
  }, [blips]);

  // Close gear menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gearMenuRef.current && !gearMenuRef.current.contains(event.target as Node)) {
        setShowGearMenu(false);
      }
      if (editGearMenuRef.current && !editGearMenuRef.current.contains(event.target as Node)) {
        setShowEditGearMenu(false);
      }
    };
    if (showGearMenu || showEditGearMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGearMenu, showEditGearMenu]);

  // Topic gear menu handlers (used by both collab and edit toolbars)
  const closeGearMenus = () => {
    setShowGearMenu(false);
    setShowEditGearMenu(false);
  };

  const handleMarkTopicRead = async () => {
    closeGearMenus();
    try {
      await ensureCsrf();
      await api(`/api/waves/${encodeURIComponent(id)}/read`, { method: 'POST' });
      toast('Topic marked as read');
      if (unreadState?.refresh) {
        unreadState.refresh();
      }
    } catch {
      toast('Failed to mark topic as read', 'error');
    }
  };

  const handleToggleFollow = async () => {
    closeGearMenus();
    setIsFollowing(!isFollowing);
    toast(isFollowing ? 'Unfollowed topic' : 'Following topic');
  };

  const handlePrint = () => {
    closeGearMenus();
    window.print();
  };

  const handleExportTopic = () => {
    closeGearMenus();
    setShowExportModal(true);
  };

  const handleCopyEmbedCode = () => {
    closeGearMenus();
    const embedUrl = `${window.location.origin}/embed/topic/${id}`;
    const embedCode = `<iframe src="${embedUrl}" width="600" height="400" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(embedCode).then(() => {
      toast('Embed code copied to clipboard');
    }).catch(() => {
      toast('Failed to copy embed code', 'error');
    });
  };

  const handleWavePlayback = () => {
    closeGearMenus();
    setShowWavePlayback(true);
  };

  // Auto-save topic content (BLB: extracts title from first H1/line)
  const autoSaveTopicContent = useCallback(async (
    content: string,
    attempt = 0,
    force = false,
  ): Promise<void> => {
    if (
      !topicProjectionActiveRef.current
      || topicProjectionIdentityRef.current !== topicProjectionIdentity
    ) return;
    try {
      await ensureCsrf();
      if (
        !topicProjectionActiveRef.current
        || topicProjectionIdentityRef.current !== topicProjectionIdentity
      ) return;
      const latestContent = topicEditorRef.current?.getHTML() || content;
      if (!force && latestContent === lastSavedContentRef.current) return;
      const extractedTitle = extractTitleFromContent(latestContent);
      if (!extractedTitle) return;
      const headers = topicCollabActive
        ? await collaborationProjectionHeaders(topicYdoc, topicYjsGeneration)
        : undefined;
      if (
        !topicProjectionActiveRef.current
        || topicProjectionIdentityRef.current !== topicProjectionIdentity
      ) return;
      const response = await api(`/api/topics/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ title: extractedTitle, content: latestContent })
      });
      if (response.ok) {
        if (
          !topicProjectionActiveRef.current
          || topicProjectionIdentityRef.current !== topicProjectionIdentity
        ) return;
        lastSavedContentRef.current = latestContent;
        setTopic(prev => prev ? { ...prev, title: extractedTitle, content: latestContent } : prev);
        // Topic-root task side-documents are derived by this successful save,
        // never by the client. Refresh so a newly inserted task becomes
        // interactable in the same edit session when canToggle permits it.
        requestTaskCompletionHydration(topicEditorRef.current);
        // No toast for auto-save - it's real-time
      } else if (
        topicProjectionActiveRef.current
        && topicProjectionIdentityRef.current === topicProjectionIdentity
        && (
          response.status === 408
          || response.status === 409
          || response.status === 425
          || response.status === 429
          || response.status >= 500
        )
        && attempt < 8
      ) {
        topicSaveTimeoutRef.current = setTimeout(() => {
          const latestContent = topicEditorRef.current?.getHTML() || content;
          void autoSaveTopicContent(latestContent, attempt + 1, force);
        }, Math.min(2_000, 150 * (2 ** attempt)));
      }
    } catch {
      if (
        topicProjectionActiveRef.current
        && topicProjectionIdentityRef.current === topicProjectionIdentity
        && attempt < 8
      ) {
        topicSaveTimeoutRef.current = setTimeout(() => {
          const latestContent = topicEditorRef.current?.getHTML() || content;
          void autoSaveTopicContent(latestContent, attempt + 1, force);
        }, Math.min(2_000, 150 * (2 ** attempt)));
      }
    }
  }, [id, topicCollabActive, topicProjectionIdentity, topicYdoc, topicYjsGeneration]);
  autoSaveTopicContentRef.current = autoSaveTopicContent;

  useEffect(() => {
    topicProjectionActiveRef.current = true;
    return () => {
      topicProjectionActiveRef.current = false;
      if (topicSaveTimeoutRef.current) {
        clearTimeout(topicSaveTimeoutRef.current);
        topicSaveTimeoutRef.current = null;
      }
    };
  }, [id]);

  // Start editing topic (BLB: topic is meta-blip)
  const startEditingTopic = useCallback(() => {
    if (!topicCanEdit) {
      toast(isAuthed ? 'You do not have permission to edit this topic' : 'Sign in to edit', 'error');
      return;
    }
    // Seed the editor with the canonical title plus an outer bullet list. This
    // also lazily migrates legacy flat topic bodies before any local/Yjs edit.
    const initialContent = sanitizeRichHtml(ensureTopicBlbHtml(
      topic?.title || 'Untitled',
      sanitizeRichHtml(topic?.content || ''),
    ));
    const inlineRootBlips = blips.filter((b) => typeof b.anchorPosition === 'number');
    const nextContent = injectInlineMarkers(initialContent, inlineRootBlips);
    setTopicContent(nextContent);
    // Track the actual durable REST projection, not its lazy canonicalization,
    // so entering edit mode can migrate a flat legacy topic even before typing.
    lastSavedContentRef.current = injectInlineMarkers(
      sanitizeRichHtml(topic?.content || ''),
      inlineRootBlips,
    );
    // The topic editor is created empty and survives view mode. Requesting
    // before setContent is intentionally request-free on first entry; the
    // plugin hydrates when task nodes arrive. Later entries refresh existing
    // task IDs after any confirmed parity-view toggle.
    requestTaskCompletionHydration(topicEditor);
    setIsEditingTopic(true);
    // The useEffect will handle syncing the editor content when isEditingTopic changes
  }, [isAuthed, topicCanEdit, topic?.title, topic?.content, blips, topicEditor]);

  // Finish editing topic
  const finishEditingTopic = useCallback(() => {
    // Clear any pending save timeout
    if (topicSaveTimeoutRef.current) {
      clearTimeout(topicSaveTimeoutRef.current);
      topicSaveTimeoutRef.current = null;
    }
    // Final save if content changed
    const currentContent = topicEditor?.getHTML() || topicContent;
    if (canMutateTopicEditorNow() && currentContent !== lastSavedContentRef.current) {
      void autoSaveTopicContent(currentContent);
    }
    setIsEditingTopic(false);
    if (topicEditor) {
      topicEditor.setEditable(false);
    }
  }, [autoSaveTopicContent, canMutateTopicEditorNow, topicContent, topicEditor]);

  if (error) {
    return (
      <div className="rizzoma-topic-detail">
        <div className="error-message">{error}<button onClick={() => load(true)}>Retry</button></div>
      </div>
    );
  }

  if (!topic) {
    return <div className="rizzoma-topic-detail loading">Loading...</div>;
  }

  // ========================================
  // Native fractal-render path (Phase 2 of the port).
  //
  // ON when FEATURES.RIZZOMA_NATIVE_RENDER is enabled (default on this
  // VPS via FEAT_RIZZOMA_NATIVE_RENDER=1 in docker-compose). Opt OUT
  // for one session via `?render=react` URL flag (kept for A/B
  // comparison until the React/TipTap path is fully decommissioned in
  // Phase 5).
  //
  // Renders the new ContentArray + renderer + BlipThread chain via a
  // thin React wrapper — structurally identical to original Rizzoma's
  // blip_thread.coffee, never uses React.createPortal.
  // ========================================
  const useNativeRender = (() => {
    if (!FEATURES.RIZZOMA_NATIVE_RENDER) return false;
    if (typeof window === 'undefined') return false;
    // Opt-IN ONLY via `?render=native` — the native path is still read-only
    // (no Edit button, no per-blip toolbars, no Write-a-reply input).
    // Default stays on the React/TipTap path until Phases 2-4 finish wiring
    // edit/collab into the native render.
    return new URLSearchParams(window.location.search).get('render') === 'native';
  })();

  if (useNativeRender) {
    const nativeBlips: Array<{ id: string; content: string }> = [];
    const collectNativeBlips = (items: BlipData[]) => {
      for (const blip of items) {
        nativeBlips.push({ id: blip.id, content: blip.content || '' });
        if (blip.childBlips?.length) collectNativeBlips(blip.childBlips);
      }
    };
    collectNativeBlips(blips);
    const allBlips: Array<{ id: string; content: string }> = [
      { id: topic.id, content: topic.content || topicSeedHtml(topic.title || 'Untitled') },
      ...nativeBlips,
    ];
    const contentMap = new Map<string, ContentArray>(
      allBlips.map((b) => [b.id, parseHtmlToContentArray(sanitizeRichHtml(b.content))])
    );
    const lookup = (id: string): ContentArray | null => contentMap.get(id) ?? null;

    return (
      <div className="rizzoma-topic-detail rizzoma-native-mode">
        <NativeWaveView rootBlipId={topic.id} contentByBlipId={lookup} />
      </div>
    );
  }

  const tags = extractTags(topic.content || '');
  // Revoke the already-loaded tree synchronously when auth/connectivity drops;
  // waiting for the async reload would leave a brief editable window.
  const renderedBlips = isAuthed ? blips : blips.map(asReadOnlyBlip);
  const renderedCurrentSubblip = currentSubblip && !isAuthed
    ? asReadOnlyBlip(currentSubblip)
    : currentSubblip;
  const inlineRootBlips = renderedBlips.filter(b => typeof b.anchorPosition === 'number');
  const listBlips = renderedBlips.filter(b => b.anchorPosition === undefined || b.anchorPosition === null);
  const topicContentHtmlBase = sanitizeRichHtml(ensureTopicBlbHtml(
    topic.title || 'Untitled',
    sanitizeRichHtml(topic.content || ''),
  ));
  // Don't inject markers here — let RizzomaBlip handle it with expanded state tracking
  const topicBlip: BlipData = {
    id: topic.id,
    content: topicContentHtmlBase,
    authorId: topic.authorId,
    authorName: topic.authorName,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    yjsGeneration: topicYjsGeneration,
    isRead: true,
    permissions: {
      canEdit: topicCanEdit,
      canComment: topicCanComment,
      canRead: topicCanRead,
    },
    childBlips: [...listBlips, ...inlineRootBlips],
  };
  const topicContentOverride = isEditingTopic ? (
    <div className="topic-content-edit">
      <EditorContent editor={topicEditor} />
    </div>
  ) : null;
  const topicContentFooter = tags.length > 0 ? (
    <div className="topic-tags">
      {tags.map((tag, i) => <span key={i} className="topic-tag">{tag}</span>)}
    </div>
  ) : null;
  const topicChildFooter = topicCanComment ? (
    <div className="write-reply-section">
      <input
        type="text"
        className="write-reply-input"
        placeholder="Write a reply..."
        value={newBlipContent}
        onChange={(e) => setNewBlipContent(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && newBlipContent.trim()) { e.preventDefault(); createRootBlip(); } }}
      />
    </div>
  ) : null;

  return (
    <ActiveBlipProvider>
    <EditSurfaceActiveBridge
      editing={isEditingTopic && topicCollabReady}
      surfaceId={`topic-editor:${id}`}
      hostBlipId={id}
      onRelease={finishEditingTopic}
    />
    <div className="rizzoma-topic-detail">
      {/* ========================================
          TOPIC COLLABORATION BAR (outside meta-blip)
          Original Rizzoma: Invite | avatars | +N | Share | gear
      ======================================== */}
      <div className="topic-collab-toolbar">
        {topicCanManage && (
          <button
            className="collab-btn invite-btn"
            title="Invite participants"
            onClick={() => setShowInviteModal(true)}
          >
            Invite
          </button>
        )}
        <div className="collab-participants">
          {/* Participant avatars */}
          {participants.length > 0 ? (
            <>
              {participants.slice(0, 5).map((p) => (
                <TopicAvatar
                  key={p.id}
                  participant={p}
                />
              ))}
              {participants.length > 5 && (
                <span className="participant-overflow" title={participants.slice(5).map(p => p.name || p.email || p.userId).join(', ')}>
                  +{participants.length - 5}
                </span>
              )}
            </>
          ) : (
            <TopicAvatar authorName={topic.authorName} />
          )}
        </div>
        {topicCanManage && (
          <button
            className="collab-btn share-btn"
            title="Share settings"
            onClick={() => setShowShareModal(true)}
          >
            🔒 Share
          </button>
        )}
        <div className="gear-menu-container" ref={gearMenuRef}>
          <button
            className={`collab-btn gear-btn ${showGearMenu ? 'active' : ''}`}
            title="Topic settings"
            onClick={() => setShowGearMenu(!showGearMenu)}
          >
            ⚙️
          </button>
          {showGearMenu && (
            <div className="gear-dropdown">
              <button className="gear-menu-item" onClick={handleMarkTopicRead} disabled={!isAuthed}>
                Mark topic as read
              </button>
              <button className="gear-menu-item" onClick={handleToggleFollow} disabled={!isAuthed}>
                {isFollowing ? 'Unfollow topic' : 'Follow topic'}
              </button>
              <div className="gear-menu-divider" />
              <button className="gear-menu-item" onClick={handlePrint}>
                Print
              </button>
              <button className="gear-menu-item" onClick={handleExportTopic}>
                Export topic
              </button>
              <button className="gear-menu-item" onClick={handleCopyEmbedCode}>
                Get embed code
              </button>
              {FEATURES.WAVE_PLAYBACK && (
                <>
                  <div className="gear-menu-divider" />
                  <button className="gear-menu-item" onClick={handleWavePlayback}>
                    Wave Timeline
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================
          BLB SUBBLIP VIEW - When navigated into a subblip
          Shows: Hide button + subblip content + child blips
      ======================================== */}
      {renderedCurrentSubblip && (
        <div className="subblip-view">
          {/* Subblip navigation bar */}
          <div className="subblip-nav-bar">
            <button
              className="subblip-hide-btn"
              onClick={navigateToParent}
              title="Return to parent (Hide)"
            >
              Hide
            </button>
            <span className="subblip-breadcrumb">
              <a href={`#/topic/${id}`} onClick={(e) => { e.preventDefault(); window.location.hash = `#/topic/${id}`; }}>
                {topic.title}
              </a>
              {' → '}
              <span className="current-blip-label">
                {extractTitleFromContent(renderedCurrentSubblip.content) || 'Subblip'}
              </span>
            </span>
          </div>

          {/* Subblip content rendered as root */}
          <div className="subblip-content">
            <RizzomaBlip
              key={renderedCurrentSubblip.id}
              blip={renderedCurrentSubblip}
              isRoot={true}
              depth={0}
              onBlipUpdate={handleBlipUpdate}
              onAddReply={handleAddReply}
              onToggleCollapse={handleToggleCollapse}
              onDeleteBlip={handleDeleteBlip}
              onBlipRead={handleBlipRead}
              onExpand={handleExpand}
              expandedBlips={expandedBlips}
              onNavigateToSubblip={navigateToSubblip}
              forceExpanded={true}
            />
          </div>
        </div>
      )}

      {/* ========================================
          UNIFIED TOPIC META-BLIP CONTAINER
          BLB Philosophy: Topic IS the root blip
          Contains: toolbar + content + child blips + reply input
          Only shown when NOT viewing a subblip
      ======================================== */}
      {!currentSubblip && (<div className="topic-meta-blip">
        {/* Meta-blip toolbar (like BlipMenu for regular blips) */}
        <div className={`topic-blip-toolbar ${isEditingTopic ? 'editing' : ''}`}>
          {topicCanEdit && (
            <button
              className={`topic-tb-btn ${isEditingTopic ? 'active primary' : ''}`}
              title={isEditingTopic ? 'Done editing (changes auto-saved)' : 'Edit topic content'}
              onClick={() => {
                if (isEditingTopic) {
                  finishEditingTopic();
                } else {
                  startEditingTopic();
                }
              }}
            >
              {isEditingTopic ? 'Done' : 'Edit'}
            </button>
          )}
          <button
            className={`topic-tb-btn ${showCommentsPanel ? 'active' : ''}`}
            title={showCommentsPanel ? 'Hide inline comments' : 'Show inline comments'}
            onClick={() => {
              setShowCommentsPanel(!showCommentsPanel);
              toast(showCommentsPanel ? 'Comments hidden' : 'Comments shown');
            }}
          >
            💬
          </button>
          {/* Insert inline comment button - only visible in edit mode */}
          {isEditingTopic && topicCollabReady && (
            <button
              className="topic-tb-btn insert-comment-btn"
              title="Insert inline comment at cursor (Ctrl+Enter)"
              onClick={() => {
                console.log('[TopicDetail] Insert comment button clicked');
                console.log('[TopicDetail] topicEditor:', topicEditor);
                console.log('[TopicDetail] createInlineChildBlipRef.current:', createInlineChildBlipRef.current);
                // Get cursor position from the editor
                if (topicEditor && canMutateTopicEditorNow()) {
                  const { from } = topicEditor.state.selection;
                  console.log('[TopicDetail] Cursor position:', from);
                  if (createInlineChildBlipRef.current) {
                    console.log('[TopicDetail] Calling createInlineChildBlipRef.current with:', from);
                    createInlineChildBlipRef.current(from);
                  } else {
                    console.error('[TopicDetail] createInlineChildBlipRef.current is not set!');
                    toast('Comment function not ready', 'error');
                  }
                } else {
                  toast('Editor not ready', 'error');
                }
              }}
            >
              💬+
            </button>
          )}
          <button
            className="topic-tb-btn"
            title="Copy topic link"
            onClick={() => {
              const url = `${window.location.origin}/#/topic/${id}`;
              navigator.clipboard.writeText(url).then(() => {
                toast('Topic link copied');
              }).catch(() => {
                toast('Failed to copy link', 'error');
              });
            }}
          >
            🔗
          </button>
          {/* Topic edit toolbar gear menu - "Other" options */}
          <div className="gear-menu-container" ref={editGearMenuRef}>
            <button
              className={`topic-tb-btn ${showEditGearMenu ? 'active' : ''}`}
              title="Other options"
              onClick={() => setShowEditGearMenu(!showEditGearMenu)}
            >
              ⚙️
            </button>
            {showEditGearMenu && (
              <div className="gear-dropdown">
                <button className="gear-menu-item" onClick={handleMarkTopicRead} disabled={!isAuthed}>
                  Mark topic as read
                </button>
                <button className="gear-menu-item" onClick={handleToggleFollow} disabled={!isAuthed}>
                  {isFollowing ? 'Unfollow topic' : 'Follow topic'}
                </button>
                <div className="gear-menu-divider" />
                <button className="gear-menu-item" onClick={handlePrint}>
                  Print
                </button>
                <button className="gear-menu-item" onClick={handleExportTopic}>
                  Export topic
                </button>
                <button className="gear-menu-item" onClick={handleCopyEmbedCode}>
                  Get embed code
                </button>
                {FEATURES.WAVE_PLAYBACK && (
                  <>
                    <div className="gear-menu-divider" />
                    <button className="gear-menu-item" onClick={handleWavePlayback}>
                      Wave Timeline
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <span className="topic-toolbar-spacer" />
          {/* Meta info on right side of toolbar */}
          <div className="topic-meta-info">
            <div className="topic-avatars-stack-small">
              {(() => {
                const owner = participants.find(p => p.role === 'owner');
                const others = participants.filter(p => p.role !== 'owner').slice(0, 2);
                const allToShow = owner ? [owner, ...others] : participants.slice(0, 3);
                if (allToShow.length === 0) {
                  return (
                    <TopicAvatar authorName={topic.authorName} small />
                  );
                }
                return allToShow.map((p, idx) => (
                  <TopicAvatar
                    key={p.id}
                    participant={p}
                    small
                    style={{ zIndex: allToShow.length - idx, marginLeft: idx > 0 ? '-8px' : '0' }}
                  />
                ));
              })()}
            </div>
            <span className="topic-date-small">{formatDate(topic.updatedAt)}</span>
          </div>
        </div>

        {/* Meta-blip body: topic content + child blips in ONE scrollable container */}
        <div className="topic-blip-body">
          {isPerfLite ? (
            <>
              <div className="topic-blip-content">
                {isEditingTopic ? (
                  <div className="topic-content-edit">
                    <EditorContent editor={topicEditor} />
                  </div>
                ) : (
                  <div className="topic-content-view">
                    {topicContentHtmlBase ? (
                      <div dangerouslySetInnerHTML={{ __html: topicContentHtmlBase }} />
                    ) : (
                      <h1 className="topic-title">{topic.title || 'Untitled'}</h1>
                    )}
                  </div>
                )}
                {tags.length > 0 && (
                  <div className="topic-tags">
                    {tags.map((tag, i) => <span key={i} className="topic-tag">{tag}</span>)}
                  </div>
                )}
              </div>
              <div className="topic-blip-children">
                {(() => {
                  if (!listBlips.length) return null;
                  return (
                    <div className="blip-list">
                      {listBlips.map((blip) => {
                        const text = blip.content
                          ? blip.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                          : '';
                        const label = text
                          ? text.length > 80
                            ? `${text.slice(0, 80)}…`
                            : text
                          : (blip.authorName || 'Blip');
                        const hasUnread = !blip.isRead;
                        return (
                          <div key={blip.id} className="rizzoma-blip perf-blip-row" data-blip-id={blip.id}>
                            <div className={`blip-collapsed-row perf-collapsed ${hasUnread ? 'has-unread' : ''}`}>
                              <span className="blip-bullet">•</span>
                              <span className="blip-collapsed-label-text">{label}</span>
                              <span className={`blip-expand-icon ${hasUnread ? 'has-unread' : ''}`}>+</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {topicChildFooter}
              </div>
            </>
          ) : (
            <RizzomaBlip
              key={topicBlip.id}
              blip={topicBlip}
              isRoot={true}
              depth={0}
              onBlipUpdate={handleBlipUpdate}
              onAddReply={handleAddReply}
              onToggleCollapse={handleToggleCollapse}
              onDeleteBlip={handleDeleteBlip}
              onBlipRead={handleBlipRead}
              onExpand={handleExpand}
              expandedBlips={expandedBlips}
              forceExpanded={true}
              renderMode="topic-root"
              contentContainerClassName="topic-blip-content"
              childContainerClassName="topic-blip-children"
              contentClassName="topic-content-view"
              contentTitle={undefined}
              onContentClick={undefined}
              contentOverride={topicContentOverride}
              contentFooter={topicContentFooter}
              childFooter={topicChildFooter}
              // BLB: NO navigation - expand/collapse INLINE like original Rizzoma
            />
          )}
        </div>
      </div>)}

      {/* Modals */}
      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        topicId={id}
        topicTitle={topic.title}
      />
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        topicId={id}
        topicTitle={topic.title}
      />
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        topicTitle={topic?.title || 'Untitled'}
        topicId={id}
        topicContent={topic?.content || ''}
        blips={blips}
      />
      {showWavePlayback && (
        <WavePlaybackModal
          waveId={id}
          topicTitle={topic?.title || 'Untitled'}
          blips={blips.map(b => ({ id: b.id, label: b.content ? b.content.replace(/<[^>]+>/g, '').trim().slice(0, 60) || `Blip ${b.id.slice(0, 8)}` : `Blip ${b.id.slice(0, 8)}` }))}
          onClose={() => setShowWavePlayback(false)}
        />
      )}
    </div>
    </ActiveBlipProvider>
  );
}
