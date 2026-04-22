import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { BlipMenu } from './BlipMenu';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { getEditorExtensions, defaultEditorProps } from '../editor/EditorConfig';
import { toast } from '../Toast';
import { copyBlipLink } from './copyBlipLink';
import { FEATURES } from '@shared/featureFlags';
import { BlipHistoryModal } from './BlipHistoryModal';
import { api, ensureCsrf } from '../../lib/api';
import {
  getInlineCommentsVisibility,
  getInlineCommentsVisibilityFromStorage,
  getInlineCommentsVisibilityMetadata,
  setInlineCommentsVisibility,
  subscribeInlineCommentsVisibility
} from '../editor/inlineCommentsVisibility';
import {
  getCollapsePreference,
  getCollapsePreferenceMetadata,
  setCollapsePreference,
  subscribeCollapsePreference
} from './collapsePreferences';
import {
  getBlipClipboardPayload,
  setBlipClipboardPayload,
  getGlobalClipboard,
  clearCutState,
} from './clipboardStore';
import { createUploadTask, type UploadResult, type UploadTask } from '../../lib/upload';
import { INSERT_EVENTS, EDIT_MODE_EVENT, EDITOR_FOCUS_EVENT, EDITOR_BLUR_EVENT, BLIP_ACTIVE_EVENT } from '../RightToolsPanel';
import './RizzomaBlip.css';
import { injectInlineMarkers } from './inlineMarkers';
import { LazyBlipSlot, LAZY_MOUNT_THRESHOLD } from './LazyBlipSlot';
import { useCollaboration } from '../editor/useCollaboration';
import { yjsDocManager } from '../editor/YjsDocumentManager';
import { useAuth } from '../../hooks/useAuth';
import { insertGadget } from '../../gadgets/insert';
import type { GadgetInsertDetail } from '../../gadgets/types';
// Performance measurement is available via import { measureRender } from '../../lib/performance'

let globalActiveBlipId: string | null = null;

// Exported for use by other modules (e.g. RizzomaTopicDetail's gadget-insert
// handler) that need to scope window-broadcast events to the most-recently-
// active blip rather than firing on every editor that's currently in edit
// mode. Without this scoping, gadgets like YouTube embed land in BOTH the
// topic root and any active deep blip simultaneously (discovered during the
// 2026-04-22 depth audit).
export function getGlobalActiveBlipId(): string | null {
  return globalActiveBlipId;
}

function setGlobalActiveBlipId(blipId: string | null) {
  globalActiveBlipId = blipId;
  if (typeof window !== 'undefined') {
    const blips = document.querySelectorAll<HTMLElement>('.rizzoma-blip[data-blip-id]');
    blips.forEach((node) => {
      node.dataset['activeBlip'] = blipId && node.dataset['blipId'] === blipId ? 'true' : 'false';
    });
    window.dispatchEvent(new CustomEvent('rizzoma:active-blip-changed', { detail: { blipId } }));
  }
}

function summarizeAppFrameData(raw: string) {
  try {
    const data = JSON.parse(raw || '{}');
    if (Array.isArray(data?.columns)) {
      const totalCards = data.columns.reduce(
        (sum: number, column: any) => sum + (Array.isArray(column?.cards) ? column.cards.length : 0),
        0
      );
      return `${data.columns.length} columns · ${totalCards} cards`;
    }
    if (Array.isArray(data?.milestones)) {
      const tail = data.milestones[data.milestones.length - 1];
      return tail?.title ? `Latest: ${tail.title}` : `${data.milestones.length} milestones`;
    }
    if (data?.session) {
      return data.session.label ? `Focus: ${data.session.label}` : `${data.session.duration ?? 0} min · ${data.session.state ?? 'ready'}`;
    }
  } catch {
    // Fall back to generic label.
  }
  return 'Sandbox preview';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hydrateAppFrameFigures(html: string) {
  if (!html || typeof window === 'undefined') {
    return html;
  }

  const container = window.document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('figure[data-gadget-type="app-frame"]').forEach((node) => {
    const figure = node as HTMLElement;
    if (figure.querySelector('iframe')) {
      return;
    }
    const title = figure.getAttribute('data-app-title') || 'Sandboxed app';
    const appId = figure.getAttribute('data-app-id') || 'app-frame';
    const src = figure.getAttribute('data-app-src') || '';
    const height = figure.getAttribute('data-app-height') || '430';
    const rawData = figure.getAttribute('data-app-data') || '{}';
    const summary = summarizeAppFrameData(rawData);
    const className = figure.getAttribute('class') || 'gadget-block gadget-app-frame';

    figure.outerHTML = `
      <figure
        data-gadget-type="app-frame"
        data-app-id="${escapeHtml(appId)}"
        data-app-instance-id="${escapeHtml(figure.getAttribute('data-app-instance-id') || 'app-frame')}"
        data-app-title="${escapeHtml(title)}"
        data-app-src="${escapeHtml(src)}"
        data-app-height="${escapeHtml(height)}"
        data-app-data="${escapeHtml(rawData)}"
        data-app-summary="${escapeHtml(summary)}"
        class="${escapeHtml(className)}"
      >
        <iframe
          src="${escapeHtml(src)}"
          title="${escapeHtml(title)}"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          allow="clipboard-read; clipboard-write; fullscreen"
          style="width: 100%; min-height: ${escapeHtml(height)}px; border: 0; border-radius: 16px; background: white; box-shadow: inset 0 0 0 1px rgba(136,156,178,0.18);"
        ></iframe>
      </figure>
    `.trim();
  });

  return container.innerHTML;
}

export type BlipContributor = {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: 'owner' | 'editor' | 'viewer';
};

export interface BlipData {
  id: string;
  blipPath?: string; // BLB: URL path segment for subblip navigation (e.g., "b1234567")
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: number;
  updatedAt: number;
  isRead: boolean;
  deletedAt?: number;
  deleted?: boolean;
  isFoldedByDefault?: boolean;
  childBlips?: BlipData[];
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canRead: boolean;
  };
  isCollapsed?: boolean;
  parentBlipId?: string;
  contributors?: BlipContributor[];
  anchorPosition?: number; // BLB: If set, this blip is anchored inline at this position (not shown in list)
}

// BlipContributorsStack - stacked avatars with owner on top, click to expand
function BlipContributorsStack({
  contributors,
  fallbackAuthor,
  fallbackAvatar
}: {
  contributors?: BlipContributor[];
  fallbackAuthor?: string;
  fallbackAvatar?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // Deduplicate and sort contributors with owner first
  const sortedContributors = contributors && contributors.length > 0
    ? [...new Map(contributors.map(c => [c.id, c])).values()].sort((a, b) => {
        if (a.role === 'owner' && b.role !== 'owner') return -1;
        if (a.role !== 'owner' && b.role === 'owner') return 1;
        return 0;
      })
    : null;

  if (!sortedContributors || sortedContributors.length === 0) {
    // Fallback to single author avatar
    return (
      <div className="blip-contributors-stack">
        <img
          className="blip-contributor-avatar"
          src={fallbackAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackAuthor || 'U')}&size=24&background=random`}
          alt={fallbackAuthor || 'Unknown'}
          title={fallbackAuthor || 'Author'}
        />
      </div>
    );
  }

  const toShow = expanded ? sortedContributors : sortedContributors.slice(0, 4);
  const overflow = !expanded && sortedContributors.length > 4 ? sortedContributors.length - 4 : 0;

  return (
    <div
      className={`blip-contributors-stack ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
      title={expanded ? 'Click to collapse' : 'Click to see all contributors'}
    >
      {toShow.map((contributor, idx) => (
        <img
          key={`${contributor.id}-${idx}`}
          className={`blip-contributor-avatar ${contributor.role === 'owner' ? 'owner' : ''}`}
          style={!expanded ? {
            zIndex: toShow.length - idx,
            transform: `translate(${idx * 4}px, ${idx * 4}px)`,
          } : undefined}
          src={contributor.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.name || contributor.email?.split('@')[0] || 'U')}&size=24&background=${contributor.role === 'owner' ? '4EA0F1' : 'random'}`}
          alt={contributor.name || contributor.email || 'Contributor'}
          title={contributor.email || contributor.name || 'Contributor'}
        />
      ))}
      {overflow > 0 && (
        <span
          className="blip-contributors-overflow"
          title={sortedContributors.slice(4).map(c => c.email || c.name).join(', ')}
          style={{ zIndex: 0 }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

const htmlToPlainText = (html: string): string => {
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const div = window.document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || div.innerText || '';
  return text.replace(/\u00a0/g, ' ').trim();
};

interface RizzomaBlipProps {
  blip: BlipData;
  isRoot?: boolean;
  depth?: number;
  onBlipUpdate?: (blipId: string, content: string) => void;
  onAddReply?: (parentBlipId: string, content: string) => void;
  onToggleCollapse?: (blipId: string) => void;
  onDeleteBlip?: (blipId: string) => Promise<void> | void;
  onBlipRead?: (blipId: string) => Promise<unknown> | void;
  onExpand?: (blipId: string) => void;
  expandedBlips?: Set<string>;
  // BLB: Navigation callback for subblip drill-down
  onNavigateToSubblip?: (blip: BlipData) => void;
  // BLB: Force expanded state (used when viewing subblip as root)
  forceExpanded?: boolean;
  // Topic rendering: tweak layout for topic root
  renderMode?: 'default' | 'topic-root';
  // Allow external render overrides for content or footers
  contentOverride?: ReactNode;
  contentFooter?: ReactNode;
  childFooter?: ReactNode;
  contentContainerClassName?: string;
  childContainerClassName?: string;
  contentClassName?: string;
  contentTitle?: string;
  onContentClick?: () => void;
  // BLB: When true, this blip is rendered as an inline-expanded child — hide toolbar, show minimal UI
  isInlineChild?: boolean;
  // Performance: When true, render a minimal version of the blip for large-wave optimization
  isPerfLite?: boolean;
  // BLB: When true, suppress recursive child rendering and the "Write a reply..." input.
  // Used by the subblip view's parent preview to avoid duplicating the focused subblip
  // and its siblings inside the parent context strip.
  hideChildBlips?: boolean;
}

type UploadUiState = {
  kind: 'attachment' | 'image';
  fileName: string;
  progress: number;
  status: 'uploading' | 'error';
  previewUrl?: string;
  error?: string | null;
};

export function RizzomaBlip({
  blip,
  isRoot = false,
  depth = 0,
  onBlipUpdate,
  onAddReply,
  onToggleCollapse,
  onDeleteBlip,
  onBlipRead,
  onExpand,
  expandedBlips,
  onNavigateToSubblip: _onNavigateToSubblip,
  forceExpanded = false,
  renderMode = 'default',
  contentOverride,
  contentFooter,
  childFooter,
  contentContainerClassName,
  childContainerClassName,
  contentClassName,
  contentTitle,
  onContentClick,
  isInlineChild = false,
  isPerfLite = false,
  hideChildBlips = false,
}: RizzomaBlipProps) {
  void _onNavigateToSubblip;
  const isPerfMode = typeof window !== 'undefined' && (window.location.hash || '').includes('perf=');
  const [isHovered, setIsHovered] = useState(false);
  const initialCollapsePreference = typeof blip.isFoldedByDefault === 'boolean'
    ? blip.isFoldedByDefault
    : typeof blip.isCollapsed === 'boolean'
      ? blip.isCollapsed
      : getCollapsePreference(blip.id);
  const [collapseByDefault, setCollapseByDefault] = useState(initialCollapsePreference);
  // BLB: ALL blips start COLLAPSED by default (original Rizzoma behavior)
  // Users must click [+] to expand and see content
  // But if forceExpanded is true (subblip view), always show expanded
  const isTopicRoot = renderMode === 'topic-root';
  const initialExpanded = forceExpanded
    ? true
    : typeof blip.isCollapsed === 'boolean'
      ? !blip.isCollapsed
      : false;
  const [isExpanded, setIsExpanded] = useState(() => initialExpanded);
  const [isEditing, setIsEditing] = useState(() => (
    forceExpanded &&
    !isTopicRoot &&
    !!blip.permissions.canEdit &&
    htmlToPlainText(blip.content || '').trim().length === 0
  ));
  // Root blips start expanded by default, but can be collapsed
  // Non-root blips follow the collapse preference
  const effectiveExpanded = isTopicRoot ? true : isExpanded;

  // Listen for global fold-all / unfold-all events (from ▲/▼ buttons)
  useEffect(() => {
    if (isTopicRoot || forceExpanded) return; // Topic root and forced-expanded blips don't fold
    const handleFoldAll = () => setIsExpanded(false);
    const handleUnfoldAll = () => setIsExpanded(true);
    window.addEventListener('rizzoma:fold-all', handleFoldAll);
    window.addEventListener('rizzoma:unfold-all', handleUnfoldAll);
    return () => {
      window.removeEventListener('rizzoma:fold-all', handleFoldAll);
      window.removeEventListener('rizzoma:unfold-all', handleUnfoldAll);
    };
  }, [isTopicRoot, forceExpanded]);

  // Dispatch edit mode event to RightToolsPanel
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EDIT_MODE_EVENT, { detail: { isEditing } }));
  }, [isEditing]);

  // BLB: Toolbar visibility — inline children start inactive (no toolbar on [+] expand),
  // regular blips that are force-expanded start active. Toolbar appears on click into content.
  const [isActive, setIsActive] = useState(forceExpanded && !isInlineChild);
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(globalActiveBlipId);
  const effectiveIsActive = isTopicRoot || isInlineChild
    ? isActive
    : isEditing || forceExpanded || activeOwnerId === blip.id;
  const lastEditableActiveRef = useRef(false);
  const autoOpenedEmptyBlipRef = useRef(false);

  // Dispatch blip-active-editable event so RightToolsPanel shows insert buttons
  // even before entering edit mode (enables auto-enter-edit on insert click)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isEditableActive = effectiveIsActive && blip.permissions.canEdit;
    if (isEditableActive) {
      window.dispatchEvent(new CustomEvent(BLIP_ACTIVE_EVENT, {
        detail: { active: true, blipId: blip.id },
      }));
    } else if (lastEditableActiveRef.current) {
      window.dispatchEvent(new CustomEvent(BLIP_ACTIVE_EVENT, {
        detail: { active: false, blipId: blip.id },
      }));
    }
    lastEditableActiveRef.current = isEditableActive;
  }, [effectiveIsActive, blip.permissions.canEdit]);

  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [editedContent, setEditedContent] = useState(blip.content);
  const [clipboardAvailable, setClipboardAvailable] = useState(() => !!getBlipClipboardPayload(blip.id) || !!getGlobalClipboard());
  const [isCutMode, setIsCutMode] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [uploadState, setUploadState] = useState<UploadUiState | null>(null);
  const uploadTaskRef = useRef<UploadTask | null>(null);
  const lastUploadRef = useRef<{
    file: File;
    kind: UploadUiState['kind'];
    onSuccess: (result: UploadResult) => void;
    successToast: string;
    failureToast: string;
  } | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [isSavingEdit] = useState(false); // Auto-save handles saving now
  const [isDeleting, setIsDeleting] = useState(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>(blip.content);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const blipContainerRef = useRef<HTMLDivElement>(null);
  const [areCommentsVisible, setAreCommentsVisible] = useState(() => getInlineCommentsVisibility(blip.id));
  const inlineVisibilityMetadata = getInlineCommentsVisibilityMetadata(blip.id);
  const inlineVisibilityUpdatedAtRef = useRef(inlineVisibilityMetadata?.updatedAt ?? 0);
  const collapsePreferenceMetadata = getCollapsePreferenceMetadata(blip.id);
  const collapsePreferenceUpdatedAtRef = useRef(collapsePreferenceMetadata?.updatedAt ?? 0);
  const pendingInsertRef = useRef<string | null>(null);
  const pendingGadgetDetailRef = useRef<GadgetInsertDetail | null>(null);
  const executeGadgetInsert = useCallback((editor: any, detail: GadgetInsertDetail | null) => {
    insertGadget(editor, detail);
  }, []);

  // Auto-save blip content (debounced, silent)
  const autoSaveBlip = useCallback(async (content: string) => {
    if (isTopicRoot) return;
    if (content === lastSavedContentRef.current) return;
    try {
      const response = await fetch(`/api/blips/${blip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (response.ok) {
        lastSavedContentRef.current = content;
        onBlipUpdate?.(blip.id, content);
        // No toast - auto-save is silent for real-time experience
      }
    } catch {
      // Silent fail for auto-save
    }
  }, [blip.id, isTopicRoot, onBlipUpdate]);

  // Ref to suppress auto-save during Y.Doc seeding (setContent triggers onUpdate)
  const seedingYdocRef = useRef(false);

  // Refs to hold current editor and callback (avoids stale closures in useEditor)
  const createChildBlipRef = useRef<(anchorPosition: number) => Promise<void>>();
  const inlineEditorRef = useRef<Editor | null>(null);

  // Stable callback that reads from ref (never goes stale)
  const stableCreateInlineChildBlip = useCallback((anchorPosition: number) => {
    createChildBlipRef.current?.(anchorPosition);
  }, []);

  // Refs for hide/show comments callbacks (avoids used-before-declaration issue)
  const hideCommentsRef = useRef<() => void>();
  const showCommentsRef = useRef<() => void>();
  const stableHideComments = useCallback(() => { hideCommentsRef.current?.(); }, []);
  const stableShowComments = useCallback(() => { showCommentsRef.current?.(); }, []);

  // --- Real-time collaboration (awareness + document sync) ---
  // Activate based on canEdit (NOT isEditing or authUser) so the Collaboration extension
  // is present from editor creation. canEdit already gates unauthenticated users.
  // authUser is only needed for setUser() which updates cursor name/color later.
  const { user: authUser } = useAuth();
  // Skip collab for topic root — RizzomaTopicDetail.tsx owns the collab-enabled topicEditor.
  // Performance: In perf-lite mode, only enable collab if hovered/active to save memory/sockets.
  // Collab must be enabled from the FIRST render of the blip, not on
  // demand when the user expands it. TipTap's useEditor creates the
  // ProseMirror view exactly once with whatever extensions exist on
  // first render, and setOptions() does NOT reinitialize plugins
  // afterwards — so if the Collaboration extension isn't in the
  // initial list, the ySyncPlugin never wires up and Y.Doc updates
  // never flow over the socket. (Cursors / awareness still work
  // because SocketIOProvider handles them directly; and HTTP PUT
  // persistence still works via onUpdate, which is why the bug was
  // invisible for weeks — user edits saved, just didn't propagate
  // live.) We therefore omit `effectiveExpanded` from the guard and
  // accept the cost of allocating one Y.Doc (cheap, in-memory CRDT
  // state) per editable non-root blip at mount time. The socket
  // join still happens synchronously via SocketIOProvider's
  // constructor, so it's effectively the same connection footprint
  // as before. 2026-04-15 task #57.
  const collabEnabled = !!(FEATURES.REALTIME_COLLAB && FEATURES.LIVE_CURSORS && blip.permissions.canEdit && !isTopicRoot && (!isPerfLite || isHovered || effectiveIsActive || isEditing));
  const ydoc = useMemo(
    () => collabEnabled ? yjsDocManager.getDocument(blip.id) : undefined,
    [blip.id, collabEnabled]
  );
  const collabProvider = useCollaboration(ydoc, blip.id, collabEnabled);

  // collabActive = all collab deps are ready (enabled + ydoc + provider).
  // Used as useEditor dep to force editor recreation with the Collaboration extension.
  // Without this, useEditor's setOptions() doesn't properly reinitialize ProseMirror
  // plugins, leaving the visible editor without ySyncPlugin.
  const collabActive = collabEnabled && !!ydoc && !!collabProvider;

  // Set real user info on the collaboration provider
  useEffect(() => {
    if (collabProvider && authUser) {
      const colors = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4'];
      collabProvider.setUser({
        id: authUser.id,
        name: authUser.name || authUser.email,
        color: colors[parseInt(authUser.id, 36) % colors.length]
      });
    }
  }, [collabProvider, authUser]);

  // Stabilize onToggleInlineComments callback for extensions memoization
  const stableToggleInlineComments = useCallback(
    (visible: boolean) => setInlineCommentsVisibility(blip.id, visible),
    [blip.id]
  );

  // Memoize extensions to prevent TipTap from recreating ProseMirror plugins on every render.
  // Without this, ySyncPlugin gets destroyed/recreated each render, preventing Y.Doc sync.
  const waveIdForTask = (blip.id || '').split(':')[0] || '';
  const currentUserForEditor = useMemo(() => {
    // Pick from blip.contributors if available — the current user is the
    // one whose id matches the session. In this scope we don't have direct
    // session access, so fall back to the first contributor labelled "me".
    const me = blip.contributors?.find(c => (c as any).isMe);
    if (me) return { id: me.id, label: me.name || me.email || 'You' };
    return null;
  }, [blip.contributors]);
  const participantsForEditor = useMemo(
    () => (blip.contributors || []).map(c => ({
      id: c.id,
      label: (c.name || c.email || c.id) as string,
    })),
    [blip.contributors],
  );
  const extensions = useMemo(
    () => getEditorExtensions(
      collabActive ? ydoc : undefined,
      collabActive ? collabProvider : undefined,
      {
        blipId: blip.id,
        waveId: waveIdForTask,
        onToggleInlineComments: stableToggleInlineComments,
        onCreateInlineChildBlip: stableCreateInlineChildBlip,
        onHideComments: stableHideComments,
        onShowComments: stableShowComments,
        currentUser: currentUserForEditor,
        participants: participantsForEditor,
      }
    ),
    [blip.id, waveIdForTask, collabActive, ydoc, collabProvider, stableToggleInlineComments, stableCreateInlineChildBlip, stableHideComments, stableShowComments, currentUserForEditor, participantsForEditor]
  );

  // Create inline editor for editing mode.
  //
  // Because `collabEnabled` no longer gates on `effectiveExpanded`,
  // collab is wired up on the FIRST render of every editable blip,
  // which means the Collaboration extension is guaranteed to be in
  // the initial extensions array. TipTap's useEditor creates the
  // ProseMirror view once and does not reinitialize plugins via
  // setOptions(), so "extensions present on first render" is the
  // only reliable way to enable ySyncPlugin without a disruptive
  // editor destroy/recreate cycle. See task #57 comment above
  // (near `const collabEnabled`) for the full rationale.
  const inlineEditor = useEditor({
    extensions,
    content: editedContent,
    editable: isEditing,
    editorProps: defaultEditorProps,
    onUpdate: ({ editor, transaction }: { editor: Editor; transaction: any }) => {
      // Skip auto-save during Y.Doc seeding (setContent triggers onUpdate)
      if (seedingYdocRef.current) return;
      if (!isEditing || isTopicRoot) return;

      const html = editor.getHTML();
      setEditedContent(html);

      // When collab is active, only auto-save for local edits (not remote Y.Doc sync).
      // Remote updates have transaction.origin set to the ySyncPlugin binding.
      const isRemoteSync = transaction?.origin != null && typeof transaction.origin === 'object';
      if (isRemoteSync) return;

      // Debounced auto-save (300ms delay)
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        autoSaveBlip(html);
      }, 300);
    },
  });

  // Keep editor ref updated for use in callbacks
  inlineEditorRef.current = inlineEditor;

  // Seed Y.Doc from blip HTML content after the server sync response arrives.
  // TipTap's Collaboration extension renders from Y.Doc fragment 'default'
  // (ignoring the `content` prop passed to useEditor), so without this
  // seeding step a collab-enabled blip would render empty for the first
  // client even when the underlying blip document has HTML content.
  //
  // Only ONE client per blip is allowed to seed — the server grants seed
  // authority to the first joiner via the `shouldSeed` field on the
  // blip:sync response. This prevents the pre-task-#57 bug where two
  // tabs joining simultaneously both received an empty state from the
  // server, both seeded their local Y.Doc from HTML, and ended up with
  // divergent CRDT histories that y.applyUpdate couldn't merge cleanly
  // (symptom: tab A's cursor showed in tab B via awareness, but tab A's
  // typing never appeared in tab B's editor text). If this client is
  // NOT the seeder, we wait for the actual y.Doc update to arrive from
  // the seeder and the Collaboration extension renders it automatically.
  useEffect(() => {
    if (!inlineEditor || (inlineEditor as any).isDestroyed || !collabEnabled || !ydoc || !collabProvider) return;

    const trySeed = () => {
      if ((inlineEditor as any).isDestroyed) return;
      if (!collabProvider.shouldSeed) return; // server didn't grant seed authority
      const frag = ydoc.getXmlFragment('default');
      if (frag.length === 0 && blip.content) {
        seedingYdocRef.current = true;
        inlineEditor.commands.setContent(blip.content);
        seedingYdocRef.current = false;
      }
    };

    if (collabProvider.synced) {
      trySeed();
      return;
    }

    // Wait for server sync before seeding; timeout fallback if server never responds
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      trySeed();
    }, 2000);

    collabProvider.onSynced(() => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      trySeed();
    });

    return () => { done = true; clearTimeout(timer); };
  }, [inlineEditor, collabEnabled, ydoc, collabProvider, blip.content]);

  // Cleanup auto-save timeout on unmount to prevent stale saves to wrong topic
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, []);

  // Reset editor state when blip.id changes (guards against stale content on prop changes)
  const prevBlipIdRef = useRef(blip.id);
  useEffect(() => {
    if (prevBlipIdRef.current === blip.id) return;
    prevBlipIdRef.current = blip.id;
    autoOpenedEmptyBlipRef.current = false;
    // Cancel any pending auto-save for the old blip
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    // Reset state to new blip's content
    setEditedContent(blip.content);
    lastSavedContentRef.current = blip.content;
    setIsEditing(false);
    // Hard Gap #12 (2026-04-13): also clear any unconsumed pending insert
    // state when switching to a different blip — see handleFinishEdit for
    // the rationale (deterministic Edit semantics, no phantom gadget inserts
    // leaking across edit sessions or blip switches).
    pendingInsertRef.current = null;
    pendingGadgetDetailRef.current = null;
    if (inlineEditor && !(inlineEditor as any).isDestroyed) {
      inlineEditor.commands.setContent(blip.content);
    }
  }, [blip.id, blip.content, inlineEditor]);

  // Dispatch editor focus/blur events for RightToolsPanel insert button visibility
  useEffect(() => {
    if (!inlineEditor || !isEditing) return;
    const handleFocus = () => {
      window.dispatchEvent(new CustomEvent(EDITOR_FOCUS_EVENT));
    };
    const handleBlur = () => {
      window.dispatchEvent(new CustomEvent(EDITOR_BLUR_EVENT));
    };
    inlineEditor.on('focus', handleFocus);
    inlineEditor.on('blur', handleBlur);
    // If editor is already focused, dispatch immediately
    try { if ((inlineEditor as any).isFocused) handleFocus(); } catch { /* ignore */ }
    return () => {
      inlineEditor.off('focus', handleFocus);
      inlineEditor.off('blur', handleBlur);
    };
  }, [inlineEditor, isEditing]);

  // Handler for creating child blip from keyboard shortcut (Ctrl+Enter)
  // BLB: Creates a SUBBLIP with inline [+] marker, then navigates into it
  // This is defined after inlineEditor so we can use it via ref
  useEffect(() => {
    createChildBlipRef.current = async (anchorPosition: number) => {
        if (!blip.permissions.canComment) return;

      try {
        // Extract waveId from the blip id (format: waveId:blipId)
        const waveId = blip.id.split(':')[0];
        console.log(`[BLB] Creating inline child: parent=${blip.id}, waveId=${waveId}, anchor=${anchorPosition}, depth=${depth}`);

        const response = await fetch('/api/blips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            waveId,
            parentId: blip.id,
            // Streamlined workflow: seed with an empty bulleted line
            // so fractal grandchildren start with a `<li>` ready to
            // type into. Matches the topic-root child creation path.
            content: '<ul><li><p></p></li></ul>',
            anchorPosition, // Store the position where the [+] marker was created
          }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error(`[BLB] Create inline child failed: ${response.status} ${errText}`);
          throw new Error(`Failed to create child blip: ${response.status}`);
        }

        const newBlip = await response.json();
        const newBlipId = newBlip.id || newBlip._id;

        // BLB: Insert [+] marker at cursor position in the parent content
        // This makes the marker PART of the content (like original Rizzoma)
        const editor = inlineEditorRef.current;
        if (editor) {
          (editor.commands as any)['insertBlipThread']({ threadId: newBlipId, hasUnread: false });
          // The content is auto-saved, so the [+] marker will persist
        }

        // Refresh topic data so the new child appears in the parent
        // content as an inlineChild. Then toggle it open IN PLACE by
        // dispatching rizzoma:toggle-inline-blip with the new blip's
        // id — the topic root's RizzomaBlip listens for this event
        // and expands the child inside the parent blip's content
        // surface (using its local `localExpandedInline` Set), which
        // is the legacy BLB behavior the user expects.
        //
        // Previously we set `window.location.hash = #/topic/.../<blipPath>/`
        // which took the user into the subblip drill-down surface —
        // correct for "focus on this reply" but wrong for "peek at
        // the comment I just created." The drill-down remains
        // available by clicking the marker a second time once the
        // inline expansion is visible.
        // Stash the new blip id in a global pending-expansion slot
        // so the nearest RizzomaBlip that picks up this new child
        // in its `inlineChildren` auto-expands + auto-edits it,
        // producing a fractal grandchild ready for typing.
        if (newBlipId) {
          (window as any).__rizzomaPendingInlineExpand = newBlipId;
        }
        window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
      } catch (error) {
        console.error('Error creating child blip:', error);
        toast('Failed to create child blip', 'error');
      }
    };
  }, [blip.id, blip.permissions.canComment]);

  const hasUnreadChildren = blip.childBlips?.some(child => !child.isRead) ?? false;
  const childCount = blip.childBlips?.length ?? 0;
  const hasUnread = !blip.isRead || hasUnreadChildren;
  const unreadMarkerActive = hasUnread;
  const inlineChildren = (blip.childBlips || []).filter((child) => typeof child.anchorPosition === 'number');
  const listChildren = (blip.childBlips || []).filter((child) => child.anchorPosition === undefined || child.anchorPosition === null);
  // Track which inline children are expanded locally (for this blip's inline children)
  const [localExpandedInline, setLocalExpandedInline] = useState<Set<string>>(new Set());

  const toggleInlineChild = useCallback((childId: string) => {
    setLocalExpandedInline(prev => {
      const next = new Set(prev);
      if (next.has(childId)) {
        next.delete(childId);
      } else {
        next.add(childId);
      }
      return next;
    });
  }, []);

  const rawViewContentHtml = !isEditing && inlineChildren.length > 0
    ? injectInlineMarkers(blip.content || '', inlineChildren, localExpandedInline)
    : (blip.content || '');
  const viewContentHtml = !isEditing ? hydrateAppFrameFigures(rawViewContentHtml) : rawViewContentHtml;

  // Portal containers for rendering expanded inline children at their marker positions
  const portalContainers = useRef<Map<string, HTMLElement>>(new Map());
  const [, setPortalTick] = useState(0);

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const map = new Map<string, HTMLElement>();
    contentRef.current.querySelectorAll('.inline-child-portal').forEach(el => {
      const id = el.getAttribute('data-portal-child');
      if (id) map.set(id, el as HTMLElement);
    });
    portalContainers.current = map;
    if (map.size > 0 || localExpandedInline.size > 0) setPortalTick(t => t + 1);
  }, [viewContentHtml, !!contentOverride]);

  // Listen for [+] marker clicks (both view mode and edit mode)
  // The custom event is dispatched by setupBlipThreadClickHandler
  useEffect(() => {
    const handleToggleInline = (e: Event) => {
      const { threadId } = (e as CustomEvent).detail || {};
      if (!threadId) return;
      // Check if this threadId matches one of our inline children
      const match = inlineChildren.find(child => child.id === threadId);
      if (match) {
        toggleInlineChild(threadId);
      }
    };
    window.addEventListener('rizzoma:toggle-inline-blip', handleToggleInline);
    return () => window.removeEventListener('rizzoma:toggle-inline-blip', handleToggleInline);
  }, [inlineChildren, toggleInlineChild]);

  // Listen for activation-only events (from Follow-the-Green) — activates blip without triggering mark-read
  useEffect(() => {
    if (isTopicRoot) return;

    const syncActiveState = (targetId: string | null) => {
      setActiveOwnerId(targetId);
      setIsActive(targetId === blip.id);
    };

    syncActiveState(globalActiveBlipId);

    const handleActivate = (e: Event) => {
      const { blipId: targetId } = (e as CustomEvent).detail || {};
      if (!targetId) return;
      setGlobalActiveBlipId(targetId);
    };

    const handleActiveChanged = (e: Event) => {
      const { blipId: targetId } = (e as CustomEvent).detail || {};
      syncActiveState(targetId ?? null);
    };

    window.addEventListener('rizzoma:activate-blip', handleActivate);
    window.addEventListener('rizzoma:active-blip-changed', handleActiveChanged);
    return () => {
      window.removeEventListener('rizzoma:activate-blip', handleActivate);
      window.removeEventListener('rizzoma:active-blip-changed', handleActiveChanged);
    };
  }, [blip.id, isTopicRoot]);

  // Collapse-only for list children (from Follow-the-Green — collapse previous before jumping to next)
  useEffect(() => {
    if (isTopicRoot) return; // never collapse root
    const handle = (e: Event) => {
      if ((e as CustomEvent).detail?.blipId === blip.id) setIsExpanded(false);
    };
    window.addEventListener('rizzoma:collapse-blip', handle);
    return () => window.removeEventListener('rizzoma:collapse-blip', handle);
  }, [blip.id, isTopicRoot]);

  // Collapse-only for inline children (NOT toggle — only removes from expanded set)
  useEffect(() => {
    const handle = (e: Event) => {
      const { threadId } = (e as CustomEvent).detail || {};
      if (!threadId) return;
      if (inlineChildren.some(c => c.id === threadId)) {
        setLocalExpandedInline(prev => {
          if (!prev.has(threadId)) return prev;
          const next = new Set(prev);
          next.delete(threadId);
          return next;
        });
      }
    };
    window.addEventListener('rizzoma:collapse-inline-blip', handle);
    return () => window.removeEventListener('rizzoma:collapse-inline-blip', handle);
  }, [inlineChildren]);

  // Streamlined workflow (task #39): when a new inline comment child
  // is created via Ctrl+Enter (or the Insert comment button), the
  // creator fires `rizzoma:start-editing-blip` with the new id after
  // the child has mounted + its inline editor has initialized. The
  // target RizzomaBlip responds by entering edit mode and focusing
  // the cursor at the end of the seeded `<li>` content so the user
  // starts typing immediately — no "click Edit again" step.
  useEffect(() => {
    const handle = (e: Event) => {
      const { blipId } = (e as CustomEvent).detail || {};
      if (blipId !== blip.id) return;
      if (isTopicRoot) return;
      if (!blip.permissions.canEdit) return;
      if (isEditing) return;
      handleStartEdit();
      // Focus the editor + move cursor to the end on the next frame
      // so the seeded bullet item is the active cursor position.
      requestAnimationFrame(() => {
        if (inlineEditor && !(inlineEditor as any).isDestroyed) {
          inlineEditor.commands.focus('end');
        }
      });
    };
    window.addEventListener('rizzoma:start-editing-blip', handle);
    return () => window.removeEventListener('rizzoma:start-editing-blip', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blip.id, isEditing, inlineEditor, blip.permissions.canEdit]);

  // Pending-expansion watcher: when a new inline comment child is
  // created, its creator stashes the new id in
  // `window.__rizzomaPendingInlineExpand`. This effect checks for
  // that flag on every `inlineChildren` update (which happens right
  // after load() finishes) and, if the pending id matches one of
  // our children, auto-expands it + fires the start-editing-blip
  // event. The flag is cleared the moment it's consumed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pending = (window as any).__rizzomaPendingInlineExpand as string | undefined;
    if (!pending) return;
    if (!inlineChildren.some((c) => c.id === pending)) return;
    // Consume the pending flag first so concurrent RizzomaBlips
    // don't race each other into double-expansion.
    (window as any).__rizzomaPendingInlineExpand = undefined;
    setLocalExpandedInline((prev) => {
      if (prev.has(pending)) return prev;
      const next = new Set(prev);
      next.add(pending);
      return next;
    });
    // After the mounted child has had a chance to mount its inline
    // editor, fire start-editing-blip so it auto-enters edit mode.
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('rizzoma:start-editing-blip', {
          detail: { blipId: pending },
        }),
      );
    }, 300);
  }, [inlineChildren]);

  // Deactivate blip (hide toolbar) — from Follow-the-Green collapse-before-jump
  useEffect(() => {
    const handle = (e: Event) => {
      if ((e as CustomEvent).detail?.blipId === blip.id) setIsActive(false);
    };
    window.addEventListener('rizzoma:deactivate-blip', handle);
    return () => window.removeEventListener('rizzoma:deactivate-blip', handle);
  }, [blip.id]);

  // Handle clicks on [+] markers in view mode (inside
  // dangerouslySetInnerHTML content).
  //
  // BLB behavior: [+] click expands the anchored child INLINE at the
  // marker's line — it does NOT navigate to a subblip drill-down.
  // Previously this called `navigateToThread` which took the user
  // out of the topic surface, surprising them when they expected a
  // local peek. Now the local handler toggles the matching child in
  // `localExpandedInline` directly.
  //
  // If the click isn't on a marker, fall through to the parent's
  // `onContentClick` (which the topic-root path uses for
  // click-to-edit). Also skip propagation for anchor clicks so
  // plain hyperlinks in the content still navigate naturally.
  const handleViewContentClick = useCallback((e: React.MouseEvent) => {
    const markerTarget = (e.target as HTMLElement).closest('.blip-thread-marker') as HTMLElement | null;
    if (markerTarget) {
      const threadId = markerTarget.getAttribute('data-blip-thread');
      if (threadId && inlineChildren.some((child) => child.id === threadId)) {
        e.preventDefault();
        e.stopPropagation();
        toggleInlineChild(threadId);
        return;
      }
    }
    const anchor = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
    if (anchor && anchor.getAttribute('href') && anchor.getAttribute('href') !== '#') {
      // Real link — let the browser handle it, don't fire edit-mode.
      return;
    }
    // Fall through to parent click handler (click-to-edit on topic
    // root, no-op for inline children without an onContentClick).
    onContentClick?.();
  }, [inlineChildren, toggleInlineChild, onContentClick]);

  const handleToggleExpand = () => {
    const next = !isExpanded;

    if (next && onExpand) {
      onExpand(blip.id);
    }
    if (next) {
      if (isTopicRoot) {
        setIsActive(true);
      } else {
        setGlobalActiveBlipId(blip.id);
      }
    }
    setIsExpanded(next);
    onToggleCollapse?.(blip.id);
    if (!blip.isRead) {
      onBlipRead?.(blip.id);
    }
  };

  const handleCollapse = () => {
    if (isInlineChild) {
      // Inline children: tell parent to toggle expansion (removes portal, reverts [+] marker)
      window.dispatchEvent(new CustomEvent('rizzoma:toggle-inline-blip', {
        detail: { threadId: blip.id }
      }));
      return;
    }
    if (!isExpanded) return;
    handleToggleExpand();
  };

  const handleExpand = () => {
    if (isExpanded) return;
    handleToggleExpand();
  };

  const handleStartEdit = () => {
    if (isTopicRoot) return;
    if (blip.permissions.canEdit) {
      const nextContent = injectInlineMarkers(blip.content || '', inlineChildren, localExpandedInline);
      setEditedContent(nextContent);
      setIsEditing(true);
      setIsActive(true);
      // Update inline editor content and make it editable
      if (inlineEditor) {
        inlineEditor.commands.setContent(nextContent);
        inlineEditor.setEditable(true);
      }
    }
  };

  const handleFinishEdit = useCallback(() => {
    if (isTopicRoot) return;
    // Clear any pending auto-save and do a final save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    // Final save if content changed
    const currentContent = inlineEditor?.getHTML() || editedContent;
    setEditedContent(currentContent);
    if (currentContent !== lastSavedContentRef.current) {
      autoSaveBlip(currentContent);
    }
    setIsEditing(false);
    if (inlineEditor) {
      inlineEditor.setEditable(false);
    }
    // Hard Gap #12 (2026-04-13): clear any unconsumed pending insert state
    // when exiting edit mode. Without this, if the user clicked an Insert
    // button (e.g. gadget palette) but the editor never became ready before
    // exit, pendingInsertRef would persist across edit sessions and the
    // NEXT Edit click would auto-fire a phantom gadget insert. Original
    // Rizzoma's Edit semantics are deterministic: clicking Edit opens
    // editing for that blip and nothing else. Clearing here closes the
    // leak path on every exit.
    pendingInsertRef.current = null;
    pendingGadgetDetailRef.current = null;
    // Streamlined workflow (task #39, 2026-04-14): Done on an inline
    // child blip should save AND auto-collapse the child back into
    // its `[+]` marker in the parent. This removes the "now I have
    // to click [−] too" step from the write-comment loop. The
    // parent's localExpandedInline listener picks up the collapse
    // event and removes this blip from its expanded set.
    if (isInlineChild) {
      window.dispatchEvent(
        new CustomEvent('rizzoma:collapse-inline-blip', {
          detail: { threadId: blip.id },
        }),
      );
    }
  }, [autoSaveBlip, editedContent, inlineEditor, isInlineChild, blip.id]);

  // handleSaveEdit now just finishes editing - auto-save handles the actual saving
  const handleSaveEdit = useCallback(async () => {
    handleFinishEdit();
  }, [handleFinishEdit]);

  const handleAddReply = async () => {
    if (!replyContent.trim()) return;

    try {
      // Extract waveId from the blip id (format: waveId:blipId)
      const waveId = blip.id.split(':')[0];
      const htmlContent = replyContent.startsWith('<') ? replyContent : `<p>${replyContent}</p>`;
      console.log(`[BLB] Creating reply: parent=${blip.id}, waveId=${waveId}, depth=${depth}`);

      const response = await fetch('/api/blips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          waveId,
          parentId: blip.id,
          content: htmlContent,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error(`[BLB] Create reply failed: ${response.status} ${errText}`);
        throw new Error(`Failed to create reply: ${response.status}`);
      }

      await response.json();
      console.log(`[BLB] Reply created at depth ${depth + 1}`);

      onAddReply?.(blip.id, replyContent);
      setReplyContent('');
      setShowReplyForm(false);
      setIsExpanded(true);
    } catch (error) {
      console.error('[BLB] Error creating reply:', error);
      toast('Failed to create reply. Please try again.', 'error');
    }
  };

  const handleSendFromToolbar = async () => {
    await handleSaveEdit();
  };

  const handleCancelReply = () => {
    setReplyContent('');
    setShowReplyForm(false);
  };

  const handleDelete = async () => {
    if (isRoot || !blip.permissions.canEdit || isDeleting) return;
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Delete this blip and its replies?')
      : true;
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      if (onDeleteBlip) {
        await onDeleteBlip(blip.id);
      } else {
        toast('Delete handler is not wired', 'error');
      }
    } catch (error) {
      console.error('Failed to delete blip', error);
      toast('Failed to delete blip', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const beginUpload = useCallback(
    (
      kind: UploadUiState['kind'],
      file: File,
      handlers: { onSuccess: (result: UploadResult) => void; successToast: string; failureToast: string },
    ) => {
      if (uploadTaskRef.current) {
        uploadTaskRef.current.cancel();
      }
      const previewUrl = kind === 'image' ? URL.createObjectURL(file) : undefined;
      setUploadState({
        kind,
        fileName: file.name,
        progress: 0,
        status: 'uploading',
        previewUrl,
        error: null,
      });
      lastUploadRef.current = { file, kind, ...handlers };
      const task = createUploadTask(file, {
        onProgress: (percent) => {
          setUploadState((prev) => (prev ? { ...prev, progress: percent } : prev));
        },
      });
      uploadTaskRef.current = task;
      task.promise
        .then((result) => {
          uploadTaskRef.current = null;
          lastUploadRef.current = null;
          setUploadState(null);
          handlers.onSuccess(result);
          toast(handlers.successToast);
        })
        .catch((error) => {
          uploadTaskRef.current = null;
          if ((error as Error)?.message === 'upload_aborted') {
            setUploadState(null);
            return;
          }
          setUploadState((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'error',
                  error: handlers.failureToast,
                }
              : prev,
          );
          toast(handlers.failureToast, 'error');
        });
    },
    [toast],
  );

  const handleCancelUpload = useCallback(() => {
    if (uploadTaskRef.current) {
      uploadTaskRef.current.cancel();
      uploadTaskRef.current = null;
    }
    lastUploadRef.current = null;
    setUploadState(null);
    toast('Upload canceled', 'info');
  }, [toast]);

  const handleRetryUpload = useCallback(() => {
    const last = lastUploadRef.current;
    if (!last) return;
    beginUpload(last.kind, last.file, last);
  }, [beginUpload]);

  const dismissUpload = useCallback(() => {
    setUploadState(null);
  }, []);

  const pickFile = (accept: string): Promise<File> => new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        resolve(file);
      } else {
        reject(new Error('no_file_selected'));
      }
    };
    input.onerror = () => reject(new Error('file_picker_error'));
    input.click();
  });

  const insertAttachment = (name: string, url: string, size: number) => {
    if (!inlineEditor) return;
    inlineEditor
      .chain()
      .focus()
      .insertContent({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: name,
            marks: [
              {
                type: 'link',
                attrs: {
                  href: url,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                },
              },
            ],
          },
          { type: 'text', text: ` (${formatBytes(size)})` },
        ],
      })
      .run();
  };

  const handleAttachmentUpload = async () => {
    if (!inlineEditor) {
      toast('Enter edit mode to insert attachments', 'error');
      return;
    }
    try {
      const file = await pickFile('*/*');
      beginUpload('attachment', file, {
        onSuccess: (result) => insertAttachment(result.originalName || file.name, result.url, result.size),
        successToast: 'Attachment uploaded',
        failureToast: 'Failed to upload attachment',
      });
    } catch (error) {
      if ((error as Error)?.message === 'no_file_selected') return;
      console.error('Failed to upload attachment', error);
      toast('Failed to upload attachment', 'error');
    }
  };

  const handleImageUpload = async () => {
    if (!inlineEditor) {
      toast('Enter edit mode to insert images', 'error');
      return;
    }
    try {
      const file = await pickFile('image/*');
      if (!file.type.startsWith('image/')) {
        toast('Please choose an image file', 'error');
        return;
      }
      beginUpload('image', file, {
        onSuccess: (result) => {
          inlineEditor.chain().focus().setImage({ src: result.url, alt: result.originalName || file.name }).run();
        },
        successToast: 'Image uploaded',
        failureToast: 'Failed to upload image',
      });
    } catch (error) {
      if ((error as Error)?.message === 'no_file_selected') return;
      console.error('Failed to upload image', error);
      toast('Failed to upload image', 'error');
    }
  };

  useEffect(() => {
    const metadata = getCollapsePreferenceMetadata(blip.id);
    if (metadata) {
      collapsePreferenceUpdatedAtRef.current = metadata.updatedAt;
    }
    const current = getCollapsePreference(blip.id);
    setCollapseByDefault(current);
    // BLB: Do NOT auto-expand based on collapseByDefault
    // All blips start collapsed - user must click to expand
    // The "Hidden" checkbox only affects whether the blip STAYS collapsed
    const unsubscribe = subscribeCollapsePreference(({ blipId: targetId, isCollapsed, updatedAt }) => {
      if (targetId === blip.id) {
        collapsePreferenceUpdatedAtRef.current = updatedAt;
        setCollapseByDefault(isCollapsed);
        // Don't auto-expand here either
      }
    });
    return unsubscribe;
  }, [blip.id]);

  // Note: Keyboard shortcuts are now handled by BlipKeyboardShortcuts TipTap extension:
  // - Tab: Indent list item
  // - Shift+Tab: Outdent list item
  // - Ctrl/Cmd+Enter: Create child blip
  // - Plain Enter: TipTap handles naturally (new line/bullet)
  // The Done button is used to finish editing.

  useEffect(() => {
    setClipboardAvailable(!!getBlipClipboardPayload(blip.id));
  }, [blip.id]);

  useEffect(() => {
    if (isPerfMode) return undefined;
    let cancelled = false;
    const requestStartedAt = Date.now();
    const syncPreference = async () => {
      try {
        const response = await api<{ collapseByDefault?: boolean }>(
          `/api/blips/${encodeURIComponent(blip.id)}/collapse-default`
        );
        if (!response.ok || cancelled) return;
        if (collapsePreferenceUpdatedAtRef.current > requestStartedAt) return;
        const payload = response.data && typeof response.data === 'object'
          ? (response.data as { collapseByDefault?: unknown })
          : null;
        if (payload && typeof payload.collapseByDefault === 'boolean') {
          const updatedAt = setCollapsePreference(blip.id, payload.collapseByDefault);
          collapsePreferenceUpdatedAtRef.current = updatedAt;
          setCollapseByDefault(payload.collapseByDefault);
          // BLB: Do NOT auto-expand based on server preference
          // All blips stay collapsed until user clicks to expand
        }
      } catch (error) {
        console.error('Failed to load collapse preference:', error);
      }
    };
    syncPreference();
    return () => {
      cancelled = true;
    };
  }, [blip.id, isPerfMode]);

  // Handle click to make blip active (show menu)
  const handleBlipClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const closestBlip = (event.target as HTMLElement | null)?.closest('.rizzoma-blip[data-blip-id]');
    if (closestBlip && closestBlip !== event.currentTarget) {
      return;
    }
    if (isTopicRoot) {
      setIsActive(true);
    } else {
      setGlobalActiveBlipId(blip.id);
    }
    if (!blip.isRead) {
      onBlipRead?.(blip.id);
    }
  };

  // Inline children: hide toolbar when clicking outside
  useEffect(() => {
    if (!isInlineChild || !isActive || isEditing) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (blipContainerRef.current && !blipContainerRef.current.contains(e.target as Node)) {
        setIsActive(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isInlineChild, isActive, isEditing]);

  useEffect(() => {
    if (isPerfMode) return undefined;
    const metadata = getInlineCommentsVisibilityMetadata(blip.id);
    if (metadata) {
      inlineVisibilityUpdatedAtRef.current = metadata.updatedAt;
    }
    setAreCommentsVisible(getInlineCommentsVisibility(blip.id));
    const unsubscribe = subscribeInlineCommentsVisibility(({ blipId: targetId, isVisible, updatedAt }) => {
      if (targetId === blip.id) {
        inlineVisibilityUpdatedAtRef.current = updatedAt;
        setAreCommentsVisible(isVisible);
      }
    });
    return unsubscribe;
  }, [blip.id, isPerfMode]);

  useEffect(() => {
    // Skip visibility preference fetch in perf mode to avoid N+1 API calls
    if (isPerfMode) return undefined;

    let cancelled = false;
    const requestStartedAt = Date.now();

    const backfillVisibilityPreference = async (isVisible: boolean) => {
      try {
        await ensureCsrf();
        await api(`/api/blips/${encodeURIComponent(blip.id)}/inline-comments-visibility`, {
          method: 'PATCH',
          body: JSON.stringify({ isVisible }),
        });
      } catch (error) {
        console.error('Failed to persist inline comment visibility', error);
      }
    };

    const applyVisibility = (nextValue: boolean) => {
      const updatedAt = setInlineCommentsVisibility(blip.id, nextValue);
      inlineVisibilityUpdatedAtRef.current = updatedAt;
      if (!cancelled) {
        setAreCommentsVisible(nextValue);
      }
    };

    const fetchVisibility = async () => {
      try {
        const localValue = getInlineCommentsVisibilityFromStorage(blip.id);
        const response = await api<{ isVisible?: boolean; source?: 'user' | 'default' }>(
          `/api/blips/${encodeURIComponent(blip.id)}/inline-comments-visibility`
        );
        if (!response.ok || cancelled) return;
        if (inlineVisibilityUpdatedAtRef.current > requestStartedAt) return;
        const payload = response.data && typeof response.data === 'object'
          ? (response.data as { isVisible?: boolean; source?: 'user' | 'default' })
          : null;
        const value = payload?.isVisible;
        const source = payload?.source;
        if (typeof value !== 'boolean') return;
        if (source === 'default' && typeof localValue === 'boolean') {
          applyVisibility(localValue);
          void backfillVisibilityPreference(localValue);
          return;
        }
        applyVisibility(value);
      } catch (error) {
        console.error('Failed to load inline comment visibility preference:', error);
      }
    };
    fetchVisibility();
    return () => {
      cancelled = true;
    };
  }, [blip.id, isPerfMode]);

  // Handle Ctrl+Enter to create child blip when active (not editing)
  useEffect(() => {
    if (!effectiveIsActive || isEditing || !blip.permissions.canComment) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Enter: Create child subblip (reply)
      if (event.key === 'Enter' && event.ctrlKey && !event.shiftKey) {
        // Check if this blip container is focused or contains focus
        if (blipContainerRef.current?.contains(document.activeElement) ||
            blipContainerRef.current === document.activeElement) {
          event.preventDefault();
          setShowReplyForm(true);
          setIsExpanded(true);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [effectiveIsActive, isEditing, blip.permissions.canComment]);

  // Streamlined workflow (task #39, 2026-04-14): Escape inside an
  // inline-child blip's edit mode = save + collapse, mirroring the
  // Done button. This lets the user write a comment and close it
  // with a single keypress instead of reaching for the Done button
  // then the `[−]` marker. Only fires on isInlineChild blips in
  // editing mode so it doesn't interfere with TipTap's own Escape
  // handling inside the topic-root editor or non-inline contexts.
  useEffect(() => {
    if (!isInlineChild || !isEditing) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!blipContainerRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      handleFinishEdit();
    };
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [isInlineChild, isEditing, handleFinishEdit]);

  // Handle insert events from RightToolsPanel
  // Listen when isActive (not just isEditing) so clicks from right panel auto-enter edit mode
  useEffect(() => {
    if (!effectiveIsActive) return;

    // Helper: execute an insert action immediately when editor is ready
    const executeInsert = (action: string, editor: any) => {
      const insertTrigger = (char: string) => {
        editor.commands['focus']();
        const { from } = editor.state.selection;
        const $from = editor.state.doc.resolve(from);
        const charBefore = from > $from.start() ? editor.state.doc.textBetween(from - 1, from) : '';
        const prefix = charBefore && charBefore !== ' ' ? ' ' : '';
        document.execCommand('insertText', false, prefix + char);
      };

      switch (action) {
        case INSERT_EVENTS.MENTION: insertTrigger('@'); break;
        case INSERT_EVENTS.TASK: insertTrigger('~'); break;
        case INSERT_EVENTS.TAG: insertTrigger('#'); break;
        case INSERT_EVENTS.REPLY: {
          const { from } = editor.state.selection;
          stableCreateInlineChildBlip(from);
          break;
        }
      }
    };

    const handleInsert = (action: string) => {
      if (isTopicRoot) {
        return;
      }
      if (isEditing && inlineEditor) {
        // Editor ready → execute immediately
        executeInsert(action, inlineEditor);
      } else if (blip.permissions.canEdit) {
        // Not editing → queue and enter edit mode
        pendingInsertRef.current = action;
        handleStartEdit();
      }
    };

    const handleInsertMention = () => handleInsert(INSERT_EVENTS.MENTION);
    const handleInsertTask = () => handleInsert(INSERT_EVENTS.TASK);
    const handleInsertTag = () => handleInsert(INSERT_EVENTS.TAG);
    const handleInsertReply = () => handleInsert(INSERT_EVENTS.REPLY);

    const handleInsertGadget = (e: Event) => {
      const detail = (e as CustomEvent<GadgetInsertDetail>).detail;
      if (isTopicRoot) {
        return;
      }
      // BUG (2026-04-22 audit): without this scoping, the gadget palette
      // window-broadcasts to every active editor — so a YouTube insert from
      // the right-panel button lands in BOTH the topic root AND any non-root
      // blip currently in edit mode. Only the most-recently-active blip
      // should receive the insert.
      if (globalActiveBlipId !== blip.id) {
        return;
      }
      if (isEditing && inlineEditor) {
        executeGadgetInsert(inlineEditor, detail || null);
      } else if (blip.permissions.canEdit) {
        pendingInsertRef.current = INSERT_EVENTS.GADGET;
        pendingGadgetDetailRef.current = detail || null;
        handleStartEdit();
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
  }, [executeGadgetInsert, effectiveIsActive, isEditing, inlineEditor, blip.permissions.canEdit, isTopicRoot]);

  // Consume pending insert when editor becomes ready after auto-entering edit mode
  useEffect(() => {
    if (!isEditing || !inlineEditor || !pendingInsertRef.current) return;

    const action = pendingInsertRef.current;
    pendingInsertRef.current = null;

    // Small delay to let editor fully initialize and become focusable
    requestAnimationFrame(() => {
      if (action === INSERT_EVENTS.GADGET) {
        const detail = pendingGadgetDetailRef.current;
        pendingGadgetDetailRef.current = null;
        executeGadgetInsert(inlineEditor, detail);
      } else {
        // Trigger chars: @, ~, #, ↵
        const insertTrigger = (char: string) => {
          inlineEditor.commands['focus']();
          const { from } = inlineEditor.state.selection;
          const $from = inlineEditor.state.doc.resolve(from);
          const charBefore = from > $from.start() ? inlineEditor.state.doc.textBetween(from - 1, from) : '';
          const prefix = charBefore && charBefore !== ' ' ? ' ' : '';
          document.execCommand('insertText', false, prefix + char);
        };

        switch (action) {
          case INSERT_EVENTS.MENTION: insertTrigger('@'); break;
          case INSERT_EVENTS.TASK: insertTrigger('~'); break;
          case INSERT_EVENTS.TAG: insertTrigger('#'); break;
          case INSERT_EVENTS.REPLY: {
            const { from } = inlineEditor.state.selection;
            stableCreateInlineChildBlip(from);
            break;
          }
        }
      }
    });
  }, [executeGadgetInsert, isEditing, inlineEditor]);

  useEffect(() => {
    if (isRoot && !blip.isRead) {
      onBlipRead?.(blip.id);
    }
  }, [isRoot, blip.id, blip.isRead, onBlipRead]);

  const handleCopyLink = async () => {
    try {
      await copyBlipLink(blip.id);
      toast('Blip link copied');
    } catch (error) {
      console.error('Failed to copy blip link', error);
      toast('Failed to copy link', 'error');
    }
  };

  const handleCopyComment = () => {
    const html = isEditing ? (inlineEditor?.getHTML() || '') : blip.content;
    const plainText = isEditing
      ? (inlineEditor?.getText() || htmlToPlainText(html))
      : htmlToPlainText(blip.content);
    if (!plainText.trim()) {
      toast('Nothing to copy', 'error');
      return;
    }
    setBlipClipboardPayload(blip.id, { html, text: plainText });
    setClipboardAvailable(true);
    toast('Copied comment to inline clipboard');
  };

  const handlePasteAsReplyFromClipboard = () => {
    if (!blip.permissions.canComment) {
      toast('You cannot reply to this blip', 'error');
      return;
    }
    const payload = getBlipClipboardPayload(blip.id);
    if (!payload) {
      toast('Copy a comment first', 'error');
      return;
    }
    setShowReplyForm(true);
    setIsExpanded(true);
    setReplyContent((prev) => {
      if (!prev.trim()) return payload.text;
      return `${prev}\n\n${payload.text}`;
    });
  };

  const handlePasteAtCursorFromClipboard = () => {
    const payload = getBlipClipboardPayload(blip.id);
    if (!payload) {
      toast('Copy a comment first', 'error');
      return;
    }
    if (!inlineEditor || !isEditing) {
      toast('Enter edit mode to paste', 'error');
      return;
    }
    inlineEditor.chain().focus().insertContent(payload.html).run();
    toast('Pasted clipboard content');
  };

  const handleDuplicate = async () => {
    if (!blip.permissions.canEdit || isDuplicating) return;
    setIsDuplicating(true);
    try {
      const response = await fetch(`/api/blips/${encodeURIComponent(blip.id)}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Failed to duplicate blip');
      }
      toast('Blip duplicated');
      // Trigger refresh to show the new blip
      window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
    } catch (error) {
      console.error('Failed to duplicate blip', error);
      toast('Failed to duplicate blip', 'error');
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleCut = () => {
    if (!blip.permissions.canEdit) {
      toast('You cannot cut this blip', 'error');
      return;
    }
    const html = blip.content;
    const plainText = htmlToPlainText(html);
    const waveId = blip.id.split(':')[0];
    setBlipClipboardPayload(blip.id, {
      html,
      text: plainText,
      isCut: true,
      waveId,
      parentId: blip.parentBlipId || null,
    });
    setIsCutMode(true);
    setClipboardAvailable(true);
    toast('Blip cut - select destination to paste');
  };

  const handlePasteAsNewBlip = async () => {
    if (!blip.permissions.canComment) {
      toast('You cannot add blips here', 'error');
      return;
    }
    const globalClipboard = getGlobalClipboard();
    const localClipboard = getBlipClipboardPayload(blip.id);
    const payload = globalClipboard || localClipboard;
    if (!payload) {
      toast('Copy or cut a blip first', 'error');
      return;
    }
    try {
      const waveId = blip.id.split(':')[0];
      const response = await fetch('/api/blips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waveId,
          parentId: blip.id, // Paste as child of current blip
          content: payload.html,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to create blip');
      }
      // If this was a cut operation, delete the original
      if (payload.isCut && payload.blipId) {
        try {
          await fetch(`/api/blips/${encodeURIComponent(payload.blipId)}`, {
            method: 'DELETE',
          });
          clearCutState(payload.blipId);
        } catch (deleteError) {
          console.warn('Failed to delete cut blip', deleteError);
        }
      }
      toast(payload.isCut ? 'Blip moved' : 'Blip pasted');
      setIsCutMode(false);
      window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
    } catch (error) {
      console.error('Failed to paste blip', error);
      toast('Failed to paste blip', 'error');
    }
  };

  const handleToggleCollapsePreference = async () => {
    if (!blip.permissions.canEdit) return;
    const previous = collapseByDefault;
    const next = !previous;
    setCollapseByDefault(next);
    if (next) {
      setIsExpanded(false);
    }
    const changeToken = setCollapsePreference(blip.id, next);
    collapsePreferenceUpdatedAtRef.current = changeToken;
    try {
      await ensureCsrf();
      const response = await api(`/api/blips/${encodeURIComponent(blip.id)}/collapse-default`, {
        method: 'PATCH',
        body: JSON.stringify({ collapseByDefault: next })
      });
      if (!response.ok) {
        throw new Error(typeof response.data === 'string' ? response.data : 'Failed to save collapse preference');
      }
    } catch (error) {
      console.error('Error saving collapse preference:', error);
      toast('Failed to save collapse preference', 'error');
      if (collapsePreferenceUpdatedAtRef.current !== changeToken) return;
      const revertToken = setCollapsePreference(blip.id, previous);
      collapsePreferenceUpdatedAtRef.current = revertToken;
      setCollapseByDefault(previous);
      if (previous) {
        setIsExpanded(false);
      }
    }
  };

  const handleToggleCommentsVisibility = () => {
    const previous = areCommentsVisible;
    const next = !previous;
    setAreCommentsVisible(next);
    const changeToken = setInlineCommentsVisibility(blip.id, next);
    inlineVisibilityUpdatedAtRef.current = changeToken;
    const persist = async () => {
      try {
        await ensureCsrf();
        const response = await api(`/api/blips/${encodeURIComponent(blip.id)}/inline-comments-visibility`, {
          method: 'PATCH',
          body: JSON.stringify({ isVisible: next }),
        });
        if (!response.ok) {
          throw new Error(typeof response.data === 'string' ? response.data : 'Failed to save inline comment visibility');
        }
      } catch (error) {
        console.error('Failed to save inline comment visibility', error);
        toast('Failed to save inline comment visibility', 'error');
        if (inlineVisibilityUpdatedAtRef.current !== changeToken) return;
        const revertToken = setInlineCommentsVisibility(blip.id, previous);
        inlineVisibilityUpdatedAtRef.current = revertToken;
        setAreCommentsVisible(previous);
      }
    };
    void persist();
  };

  const handleShowComments = () => {
    if (areCommentsVisible) return;
    handleToggleCommentsVisibility();
  };

  const handleHideComments = () => {
    if (!areCommentsVisible) return;
    handleToggleCommentsVisibility();
  };

  // Wire refs so stable callbacks delegate to latest handlers
  hideCommentsRef.current = handleHideComments;
  showCommentsRef.current = handleShowComments;

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const nextPreview = uploadState?.previewUrl ?? null;
    if (previewUrlRef.current && previewUrlRef.current !== nextPreview) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = nextPreview;
  }, [uploadState?.previewUrl]);

  const isUploading = uploadState?.status === 'uploading';
  const uploadProgress = uploadState ? uploadState.progress : null;

  const rootStyle = isRoot && effectiveExpanded ? { display: 'block' as const, opacity: 1, visibility: 'visible' as const } : {};

  // Extract label (first line) for collapsed view
  const blipLabel = (() => {
    const text = blip.content
      ? blip.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
    if (!text) return 'Untitled blip';
    return text.length > 100 ? `${text.slice(0, 100)}…` : text;
  })();

  // Determine if this blip should show as collapsed (label only)
  // BLB: ALL blips (including root) can be collapsed
  const showCollapsedView = !effectiveExpanded && !isTopicRoot;

  useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  useEffect(() => {
    if (!forceExpanded || isTopicRoot || !blip.permissions.canEdit || isEditing) return;
    if (autoOpenedEmptyBlipRef.current) return;
    const localPlain = htmlToPlainText(editedContent || '').trim();
    if (localPlain.length > 0) return;
    const plain = htmlToPlainText(blip.content || '').trim();
    if (plain.length > 0) return;
    autoOpenedEmptyBlipRef.current = true;
    setEditedContent(blip.content || '<p></p>');
    setIsEditing(true);
  }, [blip.content, blip.permissions.canEdit, editedContent, forceExpanded, isEditing, isTopicRoot]);

  useEffect(() => {
    if (isInlineChild) {
      // Inline children: only auto-activate when entering edit mode.
      // On initial [+] expand, toolbar stays hidden until user clicks into content.
      if (isEditing) setIsActive(true);
      return;
    }

    if (isEditing) {
      setIsActive(true);
      return;
    }

    if (!effectiveExpanded) {
      setIsActive(false);
      return;
    }

    if (forceExpanded) {
      setIsActive(true);
    }
  }, [effectiveExpanded, isEditing, isInlineChild, forceExpanded]);


  return (
    <div
      ref={blipContainerRef}
      className={`rizzoma-blip blip-container ${isRoot ? 'root-blip' : 'nested-blip'} ${isInlineChild ? 'inline-child' : ''} ${isTopicRoot ? 'topic-root' : ''} ${!blip.isRead ? 'unread' : ''} ${effectiveIsActive ? 'active' : ''} ${effectiveExpanded ? 'expanded' : 'collapsed'}`}
      data-active-blip={effectiveIsActive ? 'true' : 'false'}
      data-blip-id={blip.id}
      style={{ marginLeft: isRoot ? 0 : depth * 24, position: 'relative', ...rootStyle }}
      onClick={handleBlipClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Collapsed View - Simple like live Rizzoma: bullet + label + [+] + author */}
      {/* Parity fix (2026-04-13): the legacy Rizzoma reference renders each
          reply row with an author avatar + date on the right edge even when
          collapsed (see screenshots/rizzoma-live/feature/rizzoma-core-features/
          rizzoma-blips-nested.png). Previously the .blip-contributors-info
          column only rendered inside .blip-view-mode (expanded state), so
          collapsed reply rows had no author metadata at all. Rendering the
          contributors column on the collapsed row too gives every visible
          reply a consistent author column, matching the legacy surface. */}
      {showCollapsedView && (
        <div
          className="blip-collapsed-row"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleExpand();
          }}
        >
          <span className="blip-bullet">•</span>
          <span className="blip-collapsed-label-text">{blipLabel}</span>
          {listChildren.length > 0 && (
            <span className={`blip-expand-icon ${hasUnread ? 'has-unread' : ''}`}>+</span>
          )}
          {!isTopicRoot && (
            <div className="blip-contributors-info blip-contributors-info-collapsed">
              <BlipContributorsStack
                contributors={blip.contributors}
                fallbackAuthor={blip.authorName}
                fallbackAvatar={blip.authorAvatar}
              />
              <span className="blip-author-date">
                {new Date(blip.updatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Expanded View - Full blip with toolbar */}
      {!showCollapsedView && (
        <>
          {/* Expand/Collapse control - shows [−] when expanded (hidden for inline children) */}
          {!isTopicRoot && !isInlineChild && (
            <div
              className={`blip-expander ${unreadMarkerActive ? 'unread' : 'read'}`}
              onClick={handleToggleExpand}
              role="button"
              aria-label="Collapse"
              data-testid="blip-expander"
            >
              <span className="blip-expander-icon">−</span>
            </div>
          )}
          {/* Inline Blip Menu - shown for all non-root blips including inline children */}
          {!isTopicRoot && (!isPerfLite || isHovered || effectiveIsActive || isEditing) && (
            <BlipMenu
              isActive={effectiveIsActive}
              isEditing={isEditing}
              isInlineChild={isInlineChild}
              canEdit={blip.permissions.canEdit}
              canComment={blip.permissions.canComment}
              editor={inlineEditor || undefined}
              isExpanded={effectiveExpanded}
              onStartEdit={handleStartEdit}
              onFinishEdit={handleFinishEdit}
              onCollapse={typeof blip.anchorPosition === 'number' ? handleCollapse : undefined}
              onExpand={handleExpand}
              onSend={handleSendFromToolbar}
              onGetLink={handleCopyLink}
              onToggleComments={handleToggleCommentsVisibility}
              onShowComments={handleShowComments}
              onHideComments={handleHideComments}
              areCommentsVisible={areCommentsVisible}
              collapseByDefault={collapseByDefault}
              onToggleCollapseByDefault={blip.permissions.canEdit && typeof blip.anchorPosition === 'number' ? handleToggleCollapsePreference : undefined}
              onCopyComment={handleCopyComment}
              onPasteAsReply={blip.permissions.canComment ? handlePasteAsReplyFromClipboard : undefined}
              onPasteAtCursor={isEditing ? handlePasteAtCursorFromClipboard : undefined}
              clipboardAvailable={clipboardAvailable}
              onShowHistory={() => setShowHistoryModal(true)}
              onInsertAttachment={isEditing ? handleAttachmentUpload : undefined}
              onInsertImage={isEditing ? handleImageUpload : undefined}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              onDelete={!isRoot && blip.permissions.canEdit ? handleDelete : undefined}
              isSending={isSavingEdit}
              isDeleting={isDeleting}
              onDuplicate={!isRoot && blip.permissions.canEdit ? handleDuplicate : undefined}
              onCut={!isRoot && blip.permissions.canEdit ? handleCut : undefined}
              onPasteAsNew={blip.permissions.canComment ? handlePasteAsNewBlip : undefined}
              isCut={isCutMode}
              isDuplicating={isDuplicating}
            />
          )}
      {uploadState && (
        <div className={`upload-status ${uploadState.status}`} data-testid="upload-status">
          <div className="upload-preview">
            {uploadState.previewUrl ? (
              <img src={uploadState.previewUrl} alt="Upload preview" />
            ) : (
              <span className="upload-file-icon" aria-hidden="true">📎</span>
            )}
            <div className="upload-details">
              <div className="upload-file-name">{uploadState.fileName}</div>
              <div className="upload-progress-track" role="progressbar" aria-valuenow={uploadState.progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="upload-progress-fill" style={{ width: `${uploadState.progress}%` }} />
              </div>
              {uploadState.status === 'error' && (
                <div className="upload-error">{uploadState.error || 'Upload failed'}</div>
              )}
            </div>
          </div>
          <div className="upload-actions">
            {uploadState.status === 'uploading' ? (
              <button type="button" className="upload-cancel-btn" onClick={handleCancelUpload}>
                Cancel
              </button>
            ) : (
              <>
                <button type="button" className="upload-retry-btn" onClick={handleRetryUpload}>
                  Retry
                </button>
                <button type="button" className="upload-dismiss-btn" onClick={dismissUpload}>
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* Blip Content */}
      <div 
        className={`blip-content ${effectiveExpanded ? 'expanded force-expanded' : 'collapsed'}${contentContainerClassName ? ` ${contentContainerClassName}` : ''}`}
        style={{
          marginTop: isRoot && !isTopicRoot ? '2px' : '0',
          minHeight: isRoot && !isTopicRoot ? 100 : 24,
          ...(isRoot && effectiveExpanded ? { display: 'block', opacity: 1, visibility: 'visible' } : {}),
        }}
        data-expanded={effectiveExpanded ? '1' : '0'}
      >
        {contentOverride ? (
          contentOverride
        ) : isEditing ? (
          <div className="blip-editor-container" ref={editorRef}>
            {inlineEditor && (
              <div style={{ position: 'relative' }}>
                <EditorContent editor={inlineEditor} />
              </div>
            )}
          </div>
        ) : (
          <div className="blip-view-mode">
            <div className="blip-content-row">
              {/* Bullet point - original Rizzoma style */}
              {!isTopicRoot && <span className="blip-bullet">•</span>}
              <div className="blip-main-content">
                <div
                  ref={contentRef}
                  className={`blip-text${contentClassName ? ` ${contentClassName}` : ''}`}
                  dangerouslySetInnerHTML={{ __html: viewContentHtml }}
                  data-testid="blip-view-content"
                  onClick={handleViewContentClick}
                  title={contentTitle}
                  style={onContentClick ? { cursor: 'pointer' } : undefined}
                />
                {/* Expanded inline children rendered via portals at their marker positions */}
                {inlineChildren
                  .filter(child => localExpandedInline.has(child.id) && portalContainers.current.has(child.id))
                  .map(child => createPortal(
                    <div className="inline-child-expanded">
                      <RizzomaBlip
                        blip={{ ...child, isCollapsed: false }}
                        isRoot={false}
                        isInlineChild={true}
                        depth={depth + 1}
                        onBlipUpdate={onBlipUpdate}
                        onAddReply={onAddReply}
                        onToggleCollapse={onToggleCollapse}
                        onDeleteBlip={onDeleteBlip}
                        onBlipRead={onBlipRead}
                        onExpand={onExpand}
                        expandedBlips={expandedBlips}
                        isPerfLite={isPerfLite}
                      />
                    </div>,
                    portalContainers.current.get(child.id)!,
                    `inline-${child.id}`
                  ))}
              </div>
              {/* Contributors avatars on right side - stacked with owner on top, expandable */}
              {!isTopicRoot && (
                <div className="blip-contributors-info">
                  {(!isPerfLite || isHovered || effectiveIsActive || isEditing) ? (
                    <BlipContributorsStack contributors={blip.contributors} fallbackAuthor={blip.authorName} fallbackAvatar={blip.authorAvatar} />
                  ) : (
                    <div className="blip-contributors-stack-placeholder" style={{ width: 24, height: 24 }} />
                  )}
                  <span className="blip-author-date">
                    {new Date(blip.updatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {contentFooter}

        {/* Child Blips (Replies) - BEFORE "Write a reply..." per BLB structure */}
        {/* Suppress entirely when hideChildBlips is set (used by subblip parent preview). */}
        {!hideChildBlips && ((listChildren && listChildren.length > 0) || childFooter) ? (
          <div className={`child-blips${childContainerClassName ? ` ${childContainerClassName}` : ''}`}>
            {listChildren && listChildren.length > 0 && (isTopicRoot ? (
              // Perf fix (2026-04-13 task #15): when the topic has many
              // root children, wrap each in a LazyBlipSlot so only
              // children near the viewport pay the full-mount cost.
              // Small waves (<LAZY_MOUNT_THRESHOLD children) keep the
              // eager path so mount behavior is unchanged for the
              // common case.
              listChildren.length > LAZY_MOUNT_THRESHOLD ? (
                listChildren.map((childBlip) => {
                  const text = childBlip.content
                    ? childBlip.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                    : '';
                  const label = text
                    ? (text.length > 80 ? `${text.slice(0, 80)}…` : text)
                    : (childBlip.authorName || 'Reply');
                  return (
                    <LazyBlipSlot
                      key={childBlip.id}
                      blipId={childBlip.id}
                      label={label}
                      hasUnread={!childBlip.isRead}
                      hasChildren={(childBlip.childBlips?.length ?? 0) > 0}
                      onExpand={onExpand}
                      renderFull={() => (
                        <RizzomaBlip
                          blip={childBlip}
                          isRoot={false}
                          depth={depth + 1}
                          onBlipUpdate={onBlipUpdate}
                          onAddReply={onAddReply}
                          onToggleCollapse={onToggleCollapse}
                          onDeleteBlip={onDeleteBlip}
                          onBlipRead={onBlipRead}
                          onExpand={onExpand}
                          expandedBlips={expandedBlips}
                          isPerfLite={isPerfLite}
                        />
                      )}
                    />
                  );
                })
              ) : (
                listChildren.map((childBlip) => (
                  <RizzomaBlip
                    key={childBlip.id}
                    blip={childBlip}
                    isRoot={false}
                    depth={depth + 1}
                    onBlipUpdate={onBlipUpdate}
                    onAddReply={onAddReply}
                    onToggleCollapse={onToggleCollapse}
                    onDeleteBlip={onDeleteBlip}
                    onBlipRead={onBlipRead}
                    onExpand={onExpand}
                    expandedBlips={expandedBlips}
                    isPerfLite={isPerfLite}
                  />
                ))
              )
            ) : (
              listChildren.map((childBlip) => {
                const childExpanded = expandedBlips?.has(childBlip.id);
                const childHasUnread = !childBlip.isRead || (childBlip.childBlips?.some((grandchild) => !grandchild.isRead) ?? false);
                // Extract label from content - strip HTML tags and get first line
                const text = childBlip.content
                  ? childBlip.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                  : '';
                const label = text
                  ? text.length > 80
                    ? `${text.slice(0, 80)}…`
                    : text
                  : (childBlip.authorName || 'Reply');
                // Format date like parent blips (available for future use)
                void new Date(childBlip.updatedAt || childBlip.createdAt);

                return (
                  <div
                    key={childBlip.id}
                    className="child-blip-wrapper"
                    data-blip-id={childExpanded ? undefined : childBlip.id}
                  >
                    {/* Collapsed child blip - simple like live Rizzoma: • Label [+] */}
                    {!childExpanded && (
                      <div
                        className={`blip-collapsed-row child-blip-collapsed ${childHasUnread ? 'has-unread' : ''}`}
                        data-testid="blip-label-child"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGlobalActiveBlipId(childBlip.id);
                          onExpand?.(childBlip.id);
                        }}
                      >
                        <span className="blip-bullet">•</span>
                        <span className="blip-label-text">{label}</span>
                        {(childBlip.childBlips?.length ?? 0) > 0 && (
                          <span className={`blip-expand-icon ${childHasUnread ? 'has-unread' : ''}`}>+</span>
                        )}
                      </div>
                    )}
                    {/* Expanded child blip */}
                    {childExpanded && (
                      <div>
                        <RizzomaBlip
                          blip={{ ...childBlip, isCollapsed: false }}
                          isRoot={false}
                          depth={depth + 1}
                          onBlipUpdate={onBlipUpdate}
                          onAddReply={onAddReply}
                          onToggleCollapse={onToggleCollapse}
                          onDeleteBlip={onDeleteBlip}
                          onBlipRead={onBlipRead}
                          onExpand={onExpand}
                          expandedBlips={expandedBlips}
                          isPerfLite={isPerfLite}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            ))}
            {childFooter}
          </div>
        ) : null}

        {/* Reply Input - at the BOTTOM per BLB structure */}
        {/* hideChildBlips also suppresses the reply input for the parent preview. */}
        {!hideChildBlips && !isTopicRoot && !isEditing && blip.permissions.canComment && (!isInlineChild || effectiveIsActive || showReplyForm) && (
          <div className="blip-reply-inline">
            {!showReplyForm ? (
              <input
                type="text"
                className="reply-placeholder-input"
                placeholder="Write a reply..."
                onFocus={() => setShowReplyForm(true)}
                readOnly
              />
            ) : (
              <div className="blip-reply-form-inline">
                <textarea
                  className="reply-textarea"
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write your reply..."
                  rows={3}
                  autoFocus
                />
                <div className="reply-actions">
                  <button
                    className="btn-send-reply"
                    onClick={handleAddReply}
                    disabled={!replyContent.trim()}
                  >
                    Reply
                  </button>
                  <button
                    className="btn-cancel-reply"
                    onClick={handleCancelReply}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

          {/* Collapsed State Indicator - inside expanded view */}
          {childCount > 0 && !isExpanded && (
            <div className="blip-collapsed-info" onClick={handleToggleExpand}>
              <span className="collapsed-count">
                {childCount} {childCount === 1 ? 'reply' : 'replies'}
                {hasUnreadChildren && ' (unread)'}
              </span>
            </div>
          )}
        </>
      )}
      
      {showHistoryModal && (
        <BlipHistoryModal
          blipId={blip.id}
          onClose={() => setShowHistoryModal(false)}
        />
      )}
    </div>
  );
}
