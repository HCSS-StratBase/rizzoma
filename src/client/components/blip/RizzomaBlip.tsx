import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import { BlipMenu } from './BlipMenu';
import { useActiveBlip } from './ActiveBlipContext';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import { getEditorExtensions, defaultEditorProps } from '../editor/EditorConfig';
import { TypingIndicator } from '../editor/CollaborativeCursors';
import { toast } from '../Toast';
import { copyBlipLink } from './copyBlipLink';
import { InlineComments, InlineCommentsStatus } from '../editor/InlineComments';
import { FEATURES } from '@shared/featureFlags';
import { BlipHistoryModal } from './BlipHistoryModal';
import { api, ensureCsrf } from '../../lib/api';
import { sanitizeRichHtml } from '../../lib/sanitizeRichHtml';
import { insertGadget } from '../../gadgets/insert';
import type { GadgetInsertDetail } from '../../gadgets/types';
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
import { InlineHtmlRenderer } from './InlineHtmlRenderer';
import { LazyBlipSlot, LAZY_MOUNT_THRESHOLD } from './LazyBlipSlot';
import { useCollaboration } from '../editor/useCollaboration';
import { yjsDocManager } from '../editor/YjsDocumentManager';
import { useAuthenticatedCollaborationUser } from '../editor/useAuthenticatedCollaborationUser';
import { requestTaskCompletionHydration } from '../editor/extensions/TaskWidget';
import { collaborationProjectionHeaders } from '../../lib/collaborationProjection';
import { EMPTY_BLB_HTML, ensureBlbHtml, plainTextToBlbHtml } from '@shared/blbContent';
import { normalizeBlbEditorDocument } from '../editor/blbEditorInvariant';
import { isCanonicalBlbDocument } from '../editor/extensions/BlipKeyboardShortcuts';
// Performance measurement is available via import { measureRender } from '../../lib/performance'

export type BlipContributor = {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: 'owner' | 'editor' | 'commenter' | 'viewer';
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
  yjsGeneration?: number;
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

let globalActiveBlipId: string | null = null;

export function getGlobalActiveBlipId(): string | null {
  return globalActiveBlipId;
}

const getAvatarInitials = (name?: string, email?: string): string => {
  const source = name?.trim() || email?.split('@')[0]?.trim() || 'U';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

function ContributorAvatar({
  avatar,
  name,
  email,
  role,
  className = '',
  style,
}: {
  avatar?: string;
  name?: string;
  email?: string;
  role?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const label = name || email || 'Contributor';
  const classes = `blip-contributor-avatar ${role === 'owner' ? 'owner' : ''} ${className}`.trim();

  if (avatar && !failed) {
    return (
      <img
        className={classes}
        style={style}
        src={avatar}
        alt={label}
        title={label}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${classes} fallback`}
      style={style}
      title={label}
      aria-label={label}
    >
      {getAvatarInitials(name, email)}
    </span>
  );
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
        <ContributorAvatar
          avatar={fallbackAvatar}
          name={fallbackAuthor}
          className="fallback-author"
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
        <ContributorAvatar
          key={`${contributor.id}-${idx}`}
          avatar={contributor.avatar}
          name={contributor.name || contributor.email?.split('@')[0]}
          email={contributor.email}
          role={contributor.role}
          style={!expanded ? {
            zIndex: toShow.length - idx,
            transform: `translate(${idx * 4}px, ${idx * 4}px)`,
          } : undefined}
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

const computeSelectionOffsets = (
  range: Range, 
  root: HTMLElement
): { start: number; end: number; text: string } | null => {
  try {
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(root);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;
    const text = range.toString();
    const trimmed = text.trim();
    if (!trimmed) return null;
    return {
      start,
      end: start + text.length,
      text,
    };
  } catch {
    return null;
  }
};

const clearBrowserSelection = () => {
  if (typeof window === 'undefined') return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
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
}: RizzomaBlipProps) {
  const isPerfMode = typeof window !== 'undefined' && (window.location.hash || '').includes('perf=');
  const initialCollapsePreference = typeof blip.isFoldedByDefault === 'boolean'
    ? blip.isFoldedByDefault
    : typeof blip.isCollapsed === 'boolean'
      ? blip.isCollapsed
      : getCollapsePreference(blip.id);
  const [collapseByDefault, setCollapseByDefault] = useState(initialCollapsePreference);
  // BLB: ALL blips start COLLAPSED by default (original Rizzoma behavior)
  // Users must click [+] to expand and see content
  // But if forceExpanded is true (subblip view), always show expanded
  const initialExpanded = forceExpanded
    ? true
    : typeof blip.isCollapsed === 'boolean'
      ? !blip.isCollapsed
      : false;
  const [isExpanded, setIsExpanded] = useState(() => initialExpanded);
  const [isEditing, setIsEditing] = useState(false);
  // Mirror isEditing into a ref so the TipTap onUpdate callback (which is
  // captured at editor-creation time) can read the CURRENT value instead of
  // the stale initial value. Without this ref, onUpdate fires when blip
  // content is programmatically set on mount (view mode), thinks it's a
  // user edit, and autosaves an empty `<p></p>` over the saved content.
  // Documented as Task #190 (sweep-state contamination → spine[1] empty).
  const isEditingRef = useRef(false);
  useEffect(() => { isEditingRef.current = isEditing; }, [isEditing]);
  const isTopicRoot = renderMode === 'topic-root';
  // The topic-root shell uses the wave id as its synthetic blip id. It has no
  // corresponding blip document, so blip-scoped preference routes are not
  // applicable and would return noisy 404s on every topic load.
  const shouldSyncServerBlipPreferences = !isPerfMode && !isTopicRoot;
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
    window.dispatchEvent(new CustomEvent(EDIT_MODE_EVENT, {
      detail: { isEditing, blipId: blip.id },
    }));
  }, [blip.id, isEditing]);

  // BLB §18b2: at most ONE blip in the topic shows chrome (menu bar / edit
  // toolbar) at a time — the shared ActiveBlipContext holds which one. Blips
  // start passive; the topic root claims the slot on open, everything else
  // activates on click. Legacy fallback (no provider): force-expanded
  // non-inline blips start active, as before.
  const activeBlipCtx = useActiveBlip();
  const activeBlipIdInCtx = activeBlipCtx ? activeBlipCtx.activeBlipId : null;
  const [isActive, setIsActive] = useState(!activeBlipCtx && forceExpanded && !isInlineChild);
  const claimActive = useCallback(() => {
    setIsActive(true);
    activeBlipCtx?.setActiveBlip(blip.id);
  }, [activeBlipCtx, blip.id]);

  // Dispatch blip-active-editable event so RightToolsPanel shows insert buttons
  // even before entering edit mode (enables auto-enter-edit on insert click)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isActive && blip.permissions.canEdit) {
      globalActiveBlipId = blip.id;
    } else if (globalActiveBlipId === blip.id) {
      globalActiveBlipId = null;
    }
    window.dispatchEvent(new CustomEvent(BLIP_ACTIVE_EVENT, {
      detail: { active: isActive && blip.permissions.canEdit },
    }));
  }, [isActive, blip.id, blip.permissions.canEdit]);

  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const safeBlipContent = useMemo(
    () => isTopicRoot
      ? sanitizeRichHtml(blip.content || EMPTY_BLB_HTML)
      : sanitizeRichHtml(ensureBlbHtml(sanitizeRichHtml(blip.content || ''))),
    [blip.content, isTopicRoot],
  );
  const [editedContent, setEditedContent] = useState(safeBlipContent);
  const [showInlineCommentBtn, setShowInlineCommentBtn] = useState(false);
  const [inlineCommentsNotice, setInlineCommentsNotice] = useState<string | null>(null);
  const [selectionCoords, setSelectionCoords] = useState<{ x: number; y: number } | null>(null);
  const [selectedRangeData, setSelectedRangeData] = useState<{ start: number; end: number; text: string } | null>(null);
  const [inlineCommentDraft, setInlineCommentDraft] = useState('');
  const [isInlineCommentFormVisible, setIsInlineCommentFormVisible] = useState(false);
  const [isSavingInlineComment, setIsSavingInlineComment] = useState(false);
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
  const lastSavedContentRef = useRef<string>(safeBlipContent);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const blipContainerRef = useRef<HTMLDivElement>(null);
  const [areCommentsVisible, setAreCommentsVisible] = useState(() => getInlineCommentsVisibility(blip.id));
  const inlineVisibilityMetadata = getInlineCommentsVisibilityMetadata(blip.id);
  const inlineVisibilityUpdatedAtRef = useRef(inlineVisibilityMetadata?.updatedAt ?? 0);
  const collapsePreferenceMetadata = getCollapsePreferenceMetadata(blip.id);
  const collapsePreferenceUpdatedAtRef = useRef(collapsePreferenceMetadata?.updatedAt ?? 0);
  const readOnlySelectionWarned = useRef(false);
  const pendingInsertRef = useRef<string | null>(null);
  const pendingGadgetDetailRef = useRef<GadgetInsertDetail | null>(null);
  const inlineEditorRef = useRef<Editor | null>(null);
  const projectionActiveRef = useRef(true);
  const yjsGeneration = blip.yjsGeneration ?? 0;
  const projectionIdentity = `${blip.id}:${yjsGeneration}`;
  const projectionIdentityRef = useRef(projectionIdentity);
  if (projectionIdentityRef.current !== projectionIdentity) {
    projectionIdentityRef.current = projectionIdentity;
  }

  // Auto-save blip content (debounced, silent)
  const autoSaveBlip = useCallback(async (
    content: string,
    headers?: Record<string, string>,
  ): Promise<'saved' | 'retry' | 'failed'> => {
    if (!projectionActiveRef.current || projectionIdentityRef.current !== projectionIdentity) return 'failed';
    if (content === lastSavedContentRef.current) return 'saved';
    try {
      await ensureCsrf();
      if (!projectionActiveRef.current || projectionIdentityRef.current !== projectionIdentity) return 'failed';
      const response = await api(`/api/blips/${encodeURIComponent(blip.id)}`, {
        method: 'PUT',
        queueable: false,
        headers,
        body: JSON.stringify({ content }),
      });
      if (response.ok) {
        if (!projectionActiveRef.current || projectionIdentityRef.current !== projectionIdentity) return 'saved';
        lastSavedContentRef.current = content;
        onBlipUpdate?.(blip.id, content);
        // Task side-documents are derived only after this durable save. A
        // freshly inserted task may have been absent from the earlier
        // hydration, so refresh its server-provided completion/permission now.
        requestTaskCompletionHydration(inlineEditorRef.current);
        // No toast - auto-save is silent for real-time experience
        return 'saved';
      }
      if (
        response.status === 408
        || response.status === 409
        || response.status === 425
        || response.status === 429
        || response.status >= 500
      ) return 'retry';
      return 'failed';
    } catch {
      return projectionActiveRef.current && projectionIdentityRef.current === projectionIdentity
        ? 'retry'
        : 'failed';
    }
  }, [blip.id, onBlipUpdate, projectionIdentity]);

  // Ref to suppress auto-save during Y.Doc seeding (setContent triggers onUpdate)
  const seedingYdocRef = useRef(false);
  // An invalid remote/legacy document is repaired in a queued canonical
  // editor transaction. The ref prevents setContent's nested onUpdate from
  // scheduling another repair or persisting the transient invalid projection.
  const blbNormalizationPendingRef = useRef(false);

  // Refs to hold current editor and callback (avoids stale closures in useEditor)
  const createChildBlipRef = useRef<(anchorPosition: number) => Promise<void>>();

  // Stable callback that reads from ref (never goes stale)
  const stableCreateInlineChildBlip = useCallback((anchorPosition: number) => {
    console.log('[RizzomaBlip] stableCreateInlineChildBlip wrapper called with position:', anchorPosition);
    createChildBlipRef.current?.(anchorPosition);
  }, []);

  // Refs for hide/show comments callbacks (avoids used-before-declaration issue)
  const hideCommentsRef = useRef<() => void>();
  const showCommentsRef = useRef<() => void>();
  const stableHideComments = useCallback(() => { hideCommentsRef.current?.(); }, []);
  const stableShowComments = useCallback(() => { showCommentsRef.current?.(); }, []);

  // --- Real-time collaboration (awareness + document sync) ---
  // Activate based on canEdit (NOT isEditing or auth state) so the Collaboration extension
  // is present from editor creation. canEdit already gates unauthenticated users.
  // The authenticated user is converted to the provider's awareness identity synchronously,
  // before TipTap creates its collaborative-cursor extension.
  const collaborationUser = useAuthenticatedCollaborationUser();
  // Skip collab for topic root — RizzomaTopicDetail.tsx owns the collab-enabled topicEditor.
  // Without this guard, both components would create SocketIOProviders for the same blipId,
  // causing duplicate socket room joins and update relay loops.
  // Join editable child-blip rooms from their first render, before expansion.
  // Gating this on `effectiveExpanded` lets an editor mount without a provider
  // when activation and expansion race, so that client never receives live
  // relays. TipTap also needs the Collaboration extension in its initial plugin
  // set; late `setOptions()` calls do not reliably install ySyncPlugin.
  const collabEnabled = !!(FEATURES.REALTIME_COLLAB && FEATURES.LIVE_CURSORS && blip.permissions.canEdit && !isTopicRoot);
  const ydoc = useMemo(
    () => collabEnabled
      ? yjsDocManager.getDocument(blip.id, collaborationUser?.id, yjsGeneration)
      : undefined,
    [blip.id, collabEnabled, collaborationUser?.id, yjsGeneration]
  );
  const collabProvider = useCollaboration(
    ydoc,
    blip.id,
    collabEnabled,
    collaborationUser,
    yjsGeneration,
  );

  // collabActive = all collab deps are ready (enabled + ydoc + provider).
  // Used as useEditor dep to force editor recreation with the Collaboration extension.
  // Without this, useEditor's setOptions() doesn't properly reinitialize ProseMirror
  // plugins, leaving the visible editor without ySyncPlugin.
  const collabActive = collabEnabled && !!ydoc && !!collabProvider;

  const persistLatestProjection = useCallback(async (
    fallbackContent: string,
    attempt = 0,
  ): Promise<void> => {
    if (!projectionActiveRef.current || projectionIdentityRef.current !== projectionIdentity) return;
    const currentEditor = inlineEditorRef.current;
    const latestContent = currentEditor && !(currentEditor as any).isDestroyed
      ? currentEditor.getHTML()
      : fallbackContent;
    const headers = collabActive
      ? await collaborationProjectionHeaders(ydoc, yjsGeneration)
      : undefined;
    if (!projectionActiveRef.current || projectionIdentityRef.current !== projectionIdentity) return;
    const result = await autoSaveBlip(
      latestContent,
      headers,
    );
    // Another collaborator may advance the server Y.Doc while this HTTP
    // projection is in flight. Re-read both HTML and the full-state digest before a
    // bounded retry; never commit the transaction's older captured HTML.
    if (
      projectionActiveRef.current
      && projectionIdentityRef.current === projectionIdentity
      && result === 'retry'
      && attempt < 8
    ) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        void persistLatestProjection(fallbackContent, attempt + 1);
      }, Math.min(2_000, 150 * (2 ** attempt)));
    }
  }, [autoSaveBlip, collabActive, projectionIdentity, ydoc, yjsGeneration]);

  // Stabilize onToggleInlineComments callback for extensions memoization
  const stableToggleInlineComments = useCallback(
    (visible: boolean) => setInlineCommentsVisibility(blip.id, visible),
    [blip.id]
  );

  // Memoize extensions to prevent TipTap from recreating ProseMirror plugins on every render.
  // Without this, ySyncPlugin gets destroyed/recreated each render, preventing Y.Doc sync.
  const extensions = useMemo(
    () => getEditorExtensions(
      collabActive ? ydoc : undefined,
      collabActive ? collabProvider : undefined,
      {
        blipId: blip.id,
        onToggleInlineComments: stableToggleInlineComments,
        onCreateInlineChildBlip: stableCreateInlineChildBlip,
        onHideComments: stableHideComments,
        onShowComments: stableShowComments,
        currentUser: collaborationUser ? { id: collaborationUser.id, label: collaborationUser.name } : null,
        participants: (blip.contributors || []).map((contributor) => ({
          id: contributor.id,
          label: contributor.name || contributor.email || contributor.id,
          email: contributor.email,
        })),
      }
    ),
    [blip.id, blip.contributors, collaborationUser?.id, collaborationUser?.name, collabActive, ydoc, collabProvider, stableToggleInlineComments, stableCreateInlineChildBlip, stableHideComments, stableShowComments]
  );

  // Create inline editor for editing mode.
  // With synchronous provider creation (useCollaboration), collabActive is true from the
  // first render when all deps are ready. This ensures Collaboration extension is included
  // in the initial editor creation — no need for deps-based recreation.
  const useEditorWithDeps = useEditor as unknown as (
    options: Parameters<typeof useEditor>[0],
    deps: unknown[]
  ) => Editor | null;
  const inlineEditor = useEditorWithDeps(
    {
      extensions,
      content: editedContent,
      editable: isEditing,
      editorProps: defaultEditorProps,
      onUpdate: ({ editor, transaction }: { editor: Editor; transaction: any }) => {
        // Skip auto-save during Y.Doc seeding (setContent triggers onUpdate)
        if (seedingYdocRef.current) return;
        if (blbNormalizationPendingRef.current) return;

        // Critical: skip non-collaborative updates when NOT in edit mode. Programmatic
        // setContent calls (e.g. on mount, on blip-id change at line ~617,
        // on handleStartEdit at line ~997) trigger onUpdate even though
        // the user isn't typing. If we autosave from those calls AND
        // TipTap's parser falls back to <p></p> for unrecognized markup,
        // we silently overwrite the saved content with empty. Authorized remote
        // Yjs updates are the exception: materializing them keeps Couch HTML and
        // task/mention side-documents current even if the originating tab closes
        // before its debounce fires. This was
        // Task #190's root cause for the gate-036 spine[1] empty render.
        const remoteCollaborationChange = isChangeOrigin(transaction);
        if (!isEditingRef.current && !remoteCollaborationChange) return;

        const html = editor.getHTML();
        if (!isCanonicalBlbDocument(editor.state.doc)) {
          blbNormalizationPendingRef.current = true;
          queueMicrotask(() => {
            if ((editor as any).isDestroyed) {
              blbNormalizationPendingRef.current = false;
              return;
            }
            const repaired = normalizeBlbEditorDocument(editor, { kind: 'blip' }).html;
            blbNormalizationPendingRef.current = false;
            setEditedContent(repaired);
            if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = setTimeout(() => {
              void persistLatestProjection(repaired);
            }, 300);
          });
          return;
        }
        setEditedContent(html);

        // Materialize both local and remote convergence. The server validates
        // the accompanying full-state Yjs digest, so a delayed pre-merge HTML save
        // cannot become the durable API/task/mention projection.
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current);
        }
        autoSaveTimeoutRef.current = setTimeout(() => {
          void persistLatestProjection(html);
        }, 300);
      },
    },
    [blip.id, collabActive, collabProvider, persistLatestProjection]
  );

  // Keep editor ref updated for use in callbacks
  inlineEditorRef.current = inlineEditor;

  // Reliably propagate isEditing → contenteditable. useEditor's setOptions()
  // does NOT always update editable when the option changes after mount; the
  // editable option is read at editor-creation time only. Calling setEditable()
  // explicitly tells ProseMirror to update its contenteditable attribute.
  // Without this, a freshly-mounted blip whose isEditing flips true after mount
  // (e.g. the auto-edit on a new Ctrl+Enter child) renders with
  // contenteditable="false" and the user cannot type.
  useEffect(() => {
    if (!inlineEditor || (inlineEditor as any).isDestroyed) return;
    inlineEditor.setEditable(isEditing);
  }, [inlineEditor, isEditing]);

  // Losing mutation permission (including the shell going offline) freezes
  // an already-open editor without firing a REST save. Any local Yjs update
  // remains in memory and the provider's acknowledged reconnect path retries
  // it; the global beforeunload guard protects that interim state.
  useEffect(() => {
    if (blip.permissions.canEdit || !isEditing) return;
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    setIsEditing(false);
    inlineEditor?.setEditable(false);
  }, [blip.permissions.canEdit, inlineEditor, isEditing]);

  // Seed Y.Doc from blip HTML content after the server sync response arrives.
  // TipTap's Collaboration extension renders from Y.Doc fragment 'default' (ignoring the content prop).
  // The server always sends a blip:sync response — if it contains state, the Y.Doc is populated
  // automatically. If it is empty, only the client granted `shouldSeed` may seed from saved HTML;
  // every other client must wait for that authoritative Y.js update. This prevents two clients
  // from creating divergent CRDT histories from the same HTML snapshot.
  useEffect(() => {
    if (!inlineEditor || (inlineEditor as any).isDestroyed || !collabEnabled || !ydoc || !collabProvider) return;

    const trySeed = () => {
      if ((inlineEditor as any).isDestroyed) return;
      if (!collabProvider.shouldSeed) return;
      if (ydoc.getXmlFragment('default').length > 0) return;
      const authoritativeSeed = sanitizeRichHtml(ensureBlbHtml(
        sanitizeRichHtml(collabProvider.seedContent ?? safeBlipContent),
      ));
      seedingYdocRef.current = true;
      inlineEditor.commands.setContent(authoritativeSeed);
      seedingYdocRef.current = false;
    };

    if (collabProvider.synced) {
      trySeed();
      return;
    }

    // Never fall back to unsupervised local seeding: if the sync response is
    // delayed, seeding without server authority recreates the split-brain race.
    let disposed = false;
    const timer = setTimeout(() => {
      if (!disposed) console.warn(`[collab] waiting for seed authority for blip ${blip.id}`);
    }, 2000);

    collabProvider.onSynced(() => {
      if (disposed) return;
      clearTimeout(timer);
      trySeed();
    });

    return () => { disposed = true; clearTimeout(timer); };
  }, [inlineEditor, collabEnabled, ydoc, collabProvider, safeBlipContent, blip.id]);

  // Cleanup auto-save timeout on unmount to prevent stale saves to wrong topic
  useEffect(() => {
    projectionActiveRef.current = true;
    return () => {
      projectionActiveRef.current = false;
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
    // Cancel any pending auto-save for the old blip
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    // Reset state to new blip's content
    setEditedContent(safeBlipContent);
    lastSavedContentRef.current = safeBlipContent;
    setIsEditing(false);
    if (inlineEditor && !(inlineEditor as any).isDestroyed) {
      inlineEditor.commands.setContent(safeBlipContent);
    }
  }, [blip.id, safeBlipContent, inlineEditor]);

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
      console.log('[RizzomaBlip] createChildBlipFromEditor called, canComment:', blip.permissions.canComment, 'anchorPosition:', anchorPosition);
      if (!blip.permissions.canComment) return;

      try {
        // Extract waveId from the blip id (format: waveId:blipId)
        const waveId = blip.id.split(':')[0];
        console.log('[RizzomaBlip] Creating child blip for wave:', waveId, 'parent:', blip.id);

        await ensureCsrf();
        const response = await api('/api/blips', {
          method: 'POST',
          queueable: false,
          body: JSON.stringify({
            waveId,
            parentId: blip.id,
            // BLB philosophy: every blip body is a bulleted list (Bullet-Label-Blip).
            // Start with <ul><li></li></ul> so the new child has a bullet ready
            // for the user's first label, matching original Rizzoma's behavior
            // where Ctrl+Enter created a new bulleted thread, not a paragraph.
            content: EMPTY_BLB_HTML,
            anchorPosition, // Store the position where the [+] marker was created
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create child blip');
        }

        const newBlip = response.data as { id?: string; _id?: string };
        const newBlipId = newBlip.id || newBlip._id;

        console.log('[RizzomaBlip] Created child blip via Ctrl+Enter:', newBlipId);

        // BLB: Insert [+] marker at cursor position in the parent content.
        // This makes the marker PART of the content (like original Rizzoma's
        // structural blip-thread anchoring — see blip_thread.coffee).
        // We do NOT setTextSelection(anchorPosition) here: anchorPosition is now
        // a TEXT-character offset (not a PM doc position), so it would land the
        // cursor at the wrong place. The cursor is still at its original PM
        // position from when Ctrl+Enter fired (async POST doesn't move it), so
        // insertBlipThread inserts at the structurally-correct location.
        const editor = inlineEditorRef.current;
        if (editor) {
          (editor.commands as any)['insertBlipThread']({ threadId: newBlipId, hasUnread: false });
          // The content is auto-saved, so the [+] marker will persist
        }

        // BLB: Expand the new child blip inline + navigate into edit mode.
        //
        // Bug B (2026-05-07): nested Ctrl+Enter (depth 2+) didn't mount the
        // new child's editor — toggleInlineChild() ran synchronously LOCALLY
        // before the parent's refresh-topics chain populated `inlineChildren`,
        // so the renderer's filter (inlineChildren.find(c => c.id === ...))
        // returned undefined and the portal block skipped rendering.
        //
        // Fix: dispatch refresh-topics, AWAIT the refresh by polling for the
        // new blip in window state (best-effort), then dispatch the same
        // 'rizzoma:toggle-inline-blip' event with parentId that
        // RizzomaTopicDetail's create handler uses. The toggle listener at
        // RizzomaBlip.tsx:798 claims via parentId === blip.id and expands.
        if (newBlipId) {
          // Bug A perf fix (2026-05-07): await topic reload via the
          // helper exposed by RizzomaTopicDetail. Optimistic local mount
          // was attempted (Task #191) but reverted — the React batched
          // setBlips state hadn't committed before the toggle dispatch
          // fired, so the toggle handler couldn't find the new blip in
          // inlineChildren. The await of load(true) gives React time to
          // commit the optimistic state.
          const w = window as unknown as { __rizzomaTopicReload?: () => Promise<void> };
          if (typeof w.__rizzomaTopicReload === 'function') {
            await w.__rizzomaTopicReload();
          } else {
            window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
            await new Promise((r) => setTimeout(r, 250));
          }
          window.dispatchEvent(new CustomEvent('rizzoma:toggle-inline-blip', {
            detail: { threadId: newBlipId, parentId: blip.id },
          }));
          // Robust edit-entry (2026-07-09): a single RAF dispatch races BOTH
          // the child's mount (topic reload) AND the parent's finish-edit
          // save under the single-active-blip model (the parent's editor
          // closes when the child claims the active slot, and that save can
          // re-render the child back to view mode). Re-dispatch until the
          // child's editor is actually editable, backing off up to ~3s.
          const tryEnterEdit = (attempt: number) => {
            const container = document.querySelector(`[data-blip-id="${newBlipId}"]`);
            const editable = container?.querySelector('.ProseMirror[contenteditable="true"]');
            if (editable) return;
            window.dispatchEvent(new CustomEvent('rizzoma:enter-edit-blip', {
              detail: { blipId: newBlipId },
            }));
            if (attempt < 6) setTimeout(() => tryEnterEdit(attempt + 1), attempt < 2 ? 150 : 500);
          };
          requestAnimationFrame(() => tryEnterEdit(0));
        }
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
  // Track which inline children have ever been mounted this session — once mounted,
  // they stay mounted across fold/unfold so React subtree state (draft input,
  // scroll position, focus, in-progress reply) survives. Matches original Rizzoma
  // (blip_thread.coffee fold/unfold = CSS-only class toggle on persistent DOM node).
  const [everMountedInline, setEverMountedInline] = useState<Set<string>>(new Set());

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
    // Lazy-mount on first expand; never remove from the mounted set.
    setEverMountedInline(prev => {
      if (prev.has(childId)) return prev;
      const next = new Set(prev);
      next.add(childId);
      return next;
    });
  }, []);

  // Track F: when RIZZOMA_PARITY_RENDER is on, view-mode uses the React-based
  // renderInlineHtml() walker — no portal anchors injected, no createPortal.
  // The legacy injectInlineMarkers path stays in use for the non-parity branch
  // and for edit mode (where TipTap NodeView still emits portal anchors).
  const parityViewRender = FEATURES.RIZZOMA_PARITY_RENDER && !isEditing;
  const viewContentHtml = parityViewRender
    ? safeBlipContent
    : (!isEditing && inlineChildren.length > 0
        ? injectInlineMarkers(safeBlipContent, inlineChildren, localExpandedInline)
        : safeBlipContent);

  // Portal containers for rendering expanded inline children at their marker positions
  const portalContainers = useRef<Map<string, HTMLElement>>(new Map());
  const [, setPortalTick] = useState(0);

  // Stable string hash of inline child IDs — used as a dep below so the
  // useLayoutEffect re-runs ONLY when the actual set of inline children
  // changes, not on every render (the inlineChildren array is rebuilt
  // each render, so depending on the array reference itself causes an
  // infinite re-render loop via the setPortalTick state update).
  const inlineChildIdsKey = inlineChildren.map(c => c.id).sort().join(',');

  useLayoutEffect(() => {
    // Scan from the outer blip container so we pick up portal anchors in
    // BOTH view mode (.inline-child-portal divs injected by injectInlineMarkers
    // into .blip-text) AND edit mode (.inline-child-portal spans rendered
    // by BlipThreadNode inside the TipTap editor's DOM). This is how the
    // original Rizzoma kept inline-child rendering working in both modes
    // without a render-path split.
    const root = blipContainerRef.current;
    if (!root) return;
    const knownIds = new Set(inlineChildren.map(c => c.id));
    const map = new Map<string, HTMLElement>();
    root.querySelectorAll('.inline-child-portal[data-portal-child]').forEach(el => {
      const id = el.getAttribute('data-portal-child');
      // Only claim portal anchors whose child ID is one of THIS blip's own
      // inline children — avoids cross-blip pollution if anchors leak.
      if (id && knownIds.has(id)) {
        map.set(id, el as HTMLElement);
      }
    });
    portalContainers.current = map;
    if (map.size > 0 || localExpandedInline.size > 0) setPortalTick(t => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inlineChildIdsKey is the stable representation of inlineChildren
  }, [viewContentHtml, !!contentOverride, isEditing, inlineChildIdsKey]);

  // Listen for [+] marker clicks (both view mode and edit mode)
  // The custom event is dispatched by setupBlipThreadClickHandler AND by
  // the Ctrl+Enter create-handler in RizzomaTopicDetail.
  //
  // Two paths to claim the event:
  //   1. parentId match — the dispatcher knows which blip owns the new
  //      child (e.g. the topic's create-handler knows the new child is
  //      under the topic root). This is the AUTHORITATIVE signal.
  //   2. inlineChildren match — fallback for legacy [+]-click dispatches
  //      that don't carry parentId.
  //
  // The parentId path was added to fix a race where Ctrl+Enter created a
  // new child blip but `load(true)` hadn't yet refreshed `inlineChildren`,
  // so the find() returned undefined and the event was silently dropped
  // → child never expanded → no inline editor mounted → user's next
  // keystrokes went back to the parent's editor (visible in the depth-10
  // side-by-side as 'S0cS1a' run-on text instead of nested children).
  useEffect(() => {
    const handleToggleInline = (e: Event) => {
      const { threadId, parentId } = (e as CustomEvent).detail || {};
      if (!threadId) return;
      const claimByParent = parentId && parentId === blip.id;
      const claimByMatch = !parentId && inlineChildren.some(c => c.id === threadId);
      if (claimByParent || claimByMatch) {
        toggleInlineChild(threadId);
      }
    };
    window.addEventListener('rizzoma:toggle-inline-blip', handleToggleInline);
    return () => window.removeEventListener('rizzoma:toggle-inline-blip', handleToggleInline);
  }, [blip.id, inlineChildren, toggleInlineChild]);

  // Listen for activation-only events (from Follow-the-Green) — activates blip without triggering mark-read
  useEffect(() => {
    const handleActivate = (e: Event) => {
      const { blipId: targetId } = (e as CustomEvent).detail || {};
      if (targetId === blip.id) {
        claimActive();
      }
    };
    window.addEventListener('rizzoma:activate-blip', handleActivate);
    return () => window.removeEventListener('rizzoma:activate-blip', handleActivate);
  }, [blip.id, claimActive]);

  // External edit-mode trigger — used by Ctrl+Enter handler so a freshly-created
  // inline child immediately enters edit mode with cursor focus, instead of landing
  // in view mode with empty content (in which state the user has no affordance to
  // type — no toolbar visible, no body to click).
  useEffect(() => {
    const handle = (e: Event) => {
      const { blipId: targetId } = (e as CustomEvent).detail || {};
      if (targetId !== blip.id) return;
      claimActive();
      if (blip.permissions.canEdit) {
        requestTaskCompletionHydration(inlineEditorRef.current);
        setIsEditing(true);
        // Bug A perf fix (2026-05-11): single RAF instead of two. The
        // setIsEditing's effect commits + the inlineEditor's
        // useEffect-mount runs in the same tick; one RAF lands after
        // both. Falls back to a 50ms retry if the editor isn't ready
        // yet — covers the rare case where TipTap's async initializer
        // hasn't finished, without paying the second RAF cost in the
        // common path.
        requestAnimationFrame(() => {
          const ed = inlineEditorRef.current;
          if (ed) {
            (ed.commands as any)['focus']('end');
          } else {
            setTimeout(() => {
              const ed2 = inlineEditorRef.current;
              if (ed2) (ed2.commands as any)['focus']('end');
            }, 50);
          }
        });
      }
    };
    window.addEventListener('rizzoma:enter-edit-blip', handle);
    return () => window.removeEventListener('rizzoma:enter-edit-blip', handle);
  }, [blip.id, blip.permissions.canEdit, claimActive]);

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

  // Deactivate blip (hide toolbar) — from Follow-the-Green collapse-before-jump
  useEffect(() => {
    const handle = (e: Event) => {
      if ((e as CustomEvent).detail?.blipId === blip.id) setIsActive(false);
    };
    window.addEventListener('rizzoma:deactivate-blip', handle);
    return () => window.removeEventListener('rizzoma:deactivate-blip', handle);
  }, [blip.id]);

  // Handle clicks on [+] markers in view mode (inside dangerouslySetInnerHTML content)
  const handleViewContentClick = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.blip-thread-marker') as HTMLElement | null;
    if (target) {
      const threadId = target.getAttribute('data-blip-thread');
      if (threadId) {
        e.preventDefault();
        e.stopPropagation();
        const match = inlineChildren.find(child => child.id === threadId);
        if (match) {
          toggleInlineChild(threadId);
        }
        return;
      }
    }
    // Fall through to original onContentClick
    onContentClick?.();
  }, [inlineChildren, toggleInlineChild, onContentClick]);

  const handleToggleExpand = () => {
    const next = !isExpanded;

    if (next && onExpand) {
      onExpand(blip.id);
    }
    if (next) {
      claimActive();
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
    console.log('handleStartEdit called for blip:', blip.id, 'canEdit:', blip.permissions.canEdit);
    if (blip.permissions.canEdit) {
      const nextContent = injectInlineMarkers(safeBlipContent, inlineChildren, localExpandedInline);
      // Revalidate the hidden editor before replacing its content. Existing
      // task IDs refresh after a parity-view toggle; a new task signature is
      // detected by the durability plugin's setContent lifecycle update.
      requestTaskCompletionHydration(inlineEditor);
      setEditedContent(nextContent);
      setIsEditing(true);
      claimActive();
      // Update inline editor content and make it editable
      if (inlineEditor) {
        inlineEditor.commands.setContent(nextContent);
        inlineEditor.setEditable(true);
      }
    }
  };

  const handleFinishEdit = useCallback(() => {
    // Clear any pending auto-save and do a final save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    // Final save if content changed
    const currentContent = inlineEditor?.getHTML() || editedContent;
    if (currentContent !== lastSavedContentRef.current) {
      void persistLatestProjection(currentContent);
    }
    setIsEditing(false);
    if (inlineEditor) {
      inlineEditor.setEditable(false);
    }
  }, [editedContent, inlineEditor, persistLatestProjection]);

  const handleCreateInlineChildAtCursor = useCallback(() => {
    const editor = inlineEditorRef.current || inlineEditor;
    if (!editor || !blip.permissions.canComment) return;
    const { from } = editor.state.selection;
    stableCreateInlineChildBlip(from);
  }, [blip.permissions.canComment, inlineEditor, stableCreateInlineChildBlip]);

  // handleSaveEdit now just finishes editing - auto-save handles the actual saving
  const handleSaveEdit = useCallback(async () => {
    handleFinishEdit();
  }, [handleFinishEdit]);

  const handleAddReply = async () => {
    if (!replyContent.trim()) return;

    try {
      // Extract waveId from the blip id (format: waveId:blipId)
      const waveId = blip.id.split(':')[0];

      await ensureCsrf();
      const response = await api('/api/blips', {
        method: 'POST',
        queueable: false,
        body: JSON.stringify({
          waveId,
          parentId: blip.id,
          content: plainTextToBlbHtml(replyContent)
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create reply');
      }

      onAddReply?.(blip.id, replyContent);
      setReplyContent('');
      setShowReplyForm(false);
      setIsExpanded(true);
    } catch (error) {
      console.error('Error creating reply:', error);
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
        blipId: blip.id,
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
    [blip.id, toast],
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

  // Handle selected-text annotations. BLB inline comments are cursor-position child blips.
  useEffect(() => {
    if (!FEATURES.INLINE_COMMENTS || isEditing) {
      setShowInlineCommentBtn(false);
      setSelectionCoords(null);
      setSelectedRangeData(null);
      setIsInlineCommentFormVisible(false);
      setInlineCommentDraft('');
      return;
    }

    const handleSelection = () => {
      if (typeof window === 'undefined') return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setShowInlineCommentBtn(false);
        setSelectionCoords(null);
        setSelectedRangeData(null);
        setIsInlineCommentFormVisible(false);
        setInlineCommentDraft('');
        return;
      }

      if (!contentRef.current) {
        setShowInlineCommentBtn(false);
        setSelectionCoords(null);
        setSelectedRangeData(null);
        setIsInlineCommentFormVisible(false);
        setInlineCommentDraft('');
        return;
      }

      const range = selection.getRangeAt(0);
      if (!contentRef.current.contains(range.commonAncestorContainer)) {
        setShowInlineCommentBtn(false);
        setSelectionCoords(null);
        setSelectedRangeData(null);
        setIsInlineCommentFormVisible(false);
        setInlineCommentDraft('');
        return;
      }

      if (!blip.permissions.canComment) {
        setShowInlineCommentBtn(false);
        setSelectionCoords(null);
        setSelectedRangeData(null);
        setIsInlineCommentFormVisible(false);
        setInlineCommentDraft('');
        if (!readOnlySelectionWarned.current) {
          toast('Sign in to add annotations', 'error');
          readOnlySelectionWarned.current = true;
        }
        return;
      }

      const offsets = computeSelectionOffsets(range, contentRef.current);
      if (!offsets) {
        setShowInlineCommentBtn(false);
        setSelectionCoords(null);
        setSelectedRangeData(null);
        setIsInlineCommentFormVisible(false);
        setInlineCommentDraft('');
        return;
      }

      const rect = range.getBoundingClientRect();
      setIsInlineCommentFormVisible(false);
      setInlineCommentDraft('');
      setSelectionCoords({
        x: rect.left + rect.width / 2,
        y: rect.top - 40,
      });
      setSelectedRangeData(offsets);
      setShowInlineCommentBtn(true);
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('selectionchange', handleSelection);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, [isEditing, blip.permissions.canComment, blip.id]);

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
    if (!shouldSyncServerBlipPreferences) return undefined;
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
  }, [blip.id, shouldSyncServerBlipPreferences]);

  // Handle click to make blip active (show menu). stopPropagation so the
  // DEEPEST clicked blip claims the active slot — without it the click bubbles
  // through every ancestor blip container and the outermost one wins.
  const handleBlipClick = (e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    claimActive();
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
    // and for the synthetic topic root, which is not a persisted blip doc.
    if (!shouldSyncServerBlipPreferences) return undefined;

    let cancelled = false;
    const requestStartedAt = Date.now();

    const backfillVisibilityPreference = async (isVisible: boolean) => {
      try {
        await ensureCsrf();
        await api(`/api/blips/${encodeURIComponent(blip.id)}/inline-comments-visibility`, {
          method: 'PATCH',
          queueable: false,
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
  }, [blip.id, shouldSyncServerBlipPreferences]);

  // Handle Ctrl+Enter to create child blip when active (not editing)
  useEffect(() => {
    if (!isActive || isEditing || !blip.permissions.canComment) return;

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
  }, [isActive, isEditing, blip.permissions.canComment]);

  // Handle insert events from RightToolsPanel
  // Listen when isActive (not just isEditing) so clicks from right panel auto-enter edit mode
  useEffect(() => {
    if (!isActive) return;

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

    // Helper: execute a gadget insert action
    const executeGadgetInsert = (editor: any, detail: GadgetInsertDetail | null) => {
      try {
        insertGadget(editor, detail);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Invalid gadget source', 'error');
      }
    };

    const handleInsert = (action: string) => {
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
  }, [isActive, isEditing, inlineEditor, blip.permissions.canEdit]);

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
        try {
          insertGadget(inlineEditor as any, detail);
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Invalid gadget source', 'error');
        }
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
  }, [isEditing, inlineEditor]);

  useEffect(() => {
    if (isRoot && !blip.isRead) {
      onBlipRead?.(blip.id);
    }
  }, [isRoot, blip.id, blip.isRead, onBlipRead]);

  const handleInlineCommentButton = () => {
    if (!FEATURES.INLINE_COMMENTS || !selectedRangeData) return;
    setInlineCommentDraft('');
    setIsInlineCommentFormVisible(true);
  };

  const handleCancelInlineComment = () => {
    setIsInlineCommentFormVisible(false);
    setInlineCommentDraft('');
    setShowInlineCommentBtn(false);
    setSelectedRangeData(null);
    setSelectionCoords(null);
    clearBrowserSelection();
  };

  const handleSubmitInlineComment = async () => {
    if (
      !FEATURES.INLINE_COMMENTS ||
      !selectedRangeData ||
      !inlineCommentDraft.trim() ||
      !blip.permissions.canComment
    ) {
      return;
    }
    
    setIsSavingInlineComment(true);
    try {
      await ensureCsrf();
      const response = await api('/api/comments', {
        method: 'POST',
        queueable: false,
        body: JSON.stringify({
          blipId: blip.id,
          content: inlineCommentDraft.trim(),
          range: selectedRangeData,
        }),
      });
      if (!response.ok) {
        throw new Error(typeof response.data === 'string' ? response.data : 'Failed to create selection annotation');
      }
      toast('Selection annotation added');
      setIsInlineCommentFormVisible(false);
      setInlineCommentDraft('');
      setShowInlineCommentBtn(false);
      setSelectedRangeData(null);
      setSelectionCoords(null);
      setIsExpanded(true);
      clearBrowserSelection();
    } catch (error) {
      console.error('Error creating selection annotation:', error);
      toast('Failed to save selection annotation', 'error');
    } finally {
      setIsSavingInlineComment(false);
    }
  };

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
      await ensureCsrf();
      const response = await api(`/api/blips/${encodeURIComponent(blip.id)}/duplicate`, {
        method: 'POST',
        queueable: false,
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
      await ensureCsrf();
      const response = await api('/api/blips', {
        method: 'POST',
        queueable: false,
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
          const deleteResponse = await api(`/api/blips/${encodeURIComponent(payload.blipId)}`, {
            method: 'DELETE',
            queueable: false,
          });
          if (!deleteResponse.ok) throw new Error('Failed to delete cut blip');
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
        queueable: false,
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
          queueable: false,
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

  const handleInlineCommentsStatus = useCallback((status: InlineCommentsStatus) => {
    setInlineCommentsNotice(status.loadError);
  }, []);

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
    if (activeBlipCtx) {
      // Single-active model: entering edit mode always claims the slot; the
      // topic root claims it once on open (nothing else active yet) so the
      // familiar editable-root UX is preserved. Expanding a blip does NOT
      // activate it — that was the "toolbar on every nested blip" defect.
      if (isEditing) {
        claimActive();
      } else if (isTopicRoot && effectiveExpanded && activeBlipCtx.activeBlipId === null) {
        claimActive();
      }
    } else if (isInlineChild) {
      // Legacy (no provider): inline children only auto-activate when editing.
      if (isEditing) setIsActive(true);
    } else {
      setIsActive(effectiveExpanded || isEditing);
    }
  }, [effectiveExpanded, isEditing, isInlineChild, isTopicRoot, activeBlipCtx, claimActive]);

  // Release: when another blip claims the active slot, this one drops its
  // chrome — finishing (and thereby saving) any edit in progress first.
  useEffect(() => {
    if (!activeBlipCtx || activeBlipIdInCtx === blip.id) return;
    if (isEditingRef.current) handleFinishEdit();
    setIsActive(false);
  }, [activeBlipCtx, activeBlipIdInCtx, blip.id, handleFinishEdit]);


  return (
    <div
      ref={blipContainerRef}
      className={`rizzoma-blip blip-container ${isRoot ? 'root-blip' : 'nested-blip'} ${isTopicRoot ? 'topic-root' : ''} ${!blip.isRead ? 'unread' : ''} ${isActive ? 'active' : ''} ${effectiveExpanded ? 'expanded' : 'collapsed'}`}
      data-blip-id={blip.id}
      style={{ marginLeft: isRoot ? 0 : depth * 24, position: 'relative', ...rootStyle }}
      onClick={handleBlipClick}
    >
      {/* Collapsed View - Simple like live Rizzoma: bullet + label + [+] only */}
      {showCollapsedView && (
        <div className="blip-collapsed-row" onClick={handleToggleExpand}>
          <span className="blip-bullet">•</span>
          <span className="blip-collapsed-label-text">{blipLabel}</span>
          {listChildren.length > 0 && (
            <span className={`blip-expand-icon ${hasUnread ? 'has-unread' : ''}`}>+</span>
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
          {!isTopicRoot && (
            <BlipMenu
              isActive={isActive}
              isEditing={isEditing}
              isInlineChild={isInlineChild}
              canEdit={blip.permissions.canEdit}
              canComment={blip.permissions.canComment}
              inlineCommentsNotice={inlineCommentsNotice}
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
              onCreateInlineChild={isEditing && blip.permissions.canComment ? handleCreateInlineChildAtCursor : undefined}
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
          marginTop: isRoot && !isTopicRoot ? '40px' : '0',
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
                {collabActive && collabProvider && (
                  <TypingIndicator provider={collabProvider} />
                )}
                {FEATURES.INLINE_COMMENTS && !isInlineChild && areCommentsVisible && (
                  <InlineComments
                    editor={inlineEditor}
                    blipId={blip.id}
                    isVisible={areCommentsVisible}
                    canComment={blip.permissions.canComment}
                    onStatusChange={handleInlineCommentsStatus}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="blip-view-mode">
            <div className="blip-content-row">
              {/* Bullet point - original Rizzoma style */}
              {!isTopicRoot && <span className="blip-bullet">•</span>}
              <div className="blip-main-content">
                {parityViewRender ? (
                  <div
                    ref={contentRef}
                    className={`blip-text${contentClassName ? ` ${contentClassName}` : ''}`}
                    data-testid="blip-view-content"
                    onClick={handleViewContentClick}
                    title={contentTitle}
                    style={onContentClick ? { cursor: 'pointer' } : undefined}
                  >
                    <InlineHtmlRenderer
                      taskBlipId={blip.id}
                      html={blip.content || ''}
                      inlineChildren={inlineChildren}
                      expandedSet={localExpandedInline}
                      everMountedSet={everMountedInline}
                      renderInlineChild={(childId: string) => {
                        const child = inlineChildren.find(c => c.id === childId);
                        if (!child) return null;
                        return (
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
                          />
                        );
                      }}
                    />
                  </div>
                ) : (
                  <div
                    ref={contentRef}
                    className={`blip-text${contentClassName ? ` ${contentClassName}` : ''}`}
                    dangerouslySetInnerHTML={{ __html: viewContentHtml }}
                    data-testid="blip-view-content"
                    onClick={handleViewContentClick}
                    title={contentTitle}
                    style={onContentClick ? { cursor: 'pointer' } : undefined}
                  />
                )}
              </div>
              {/* Contributors avatars on right side - stacked with owner on top, expandable */}
              {!isTopicRoot && (
                <div className="blip-contributors-info">
                  <BlipContributorsStack contributors={blip.contributors} fallbackAuthor={blip.authorName} fallbackAvatar={blip.authorAvatar} />
                  <span className="blip-author-date">
                    {new Date(blip.updatedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/*
          Expanded inline children rendered via portals at their [+] marker positions.
          UNIFIED render path — runs in BOTH view and edit mode (matching original
          Rizzoma). The portal targets are .inline-child-portal anchors, which exist
          in both modes:
            - view mode: injected into the saved HTML by injectInlineMarkers() at
              the end of the marker's containing <li> or <p>
            - edit mode: rendered inside the .blip-thread-host wrapper by the
              BlipThreadNode TipTap node, immediately after the [+] marker
          createPortal teleports the React tree into whichever anchor is present,
          so a freshly-Ctrl+Enter'd inline child opens directly under its marker
          without requiring the parent to exit edit mode first.
        */}
        {/*
          Inline-child render paths (revised 2026-05-05 evening per user
          "Ctrl+Enter should open inline AS IN THE ORIGINAL"):

          1. Parity view mode: renderInlineHtml() above places children inline
             inside the <li> as React siblings. No portal.
          2. Edit mode (own editor OR contentOverride from TopicDetail) AND
             non-parity view mode: createPortal teleports the React tree into
             BlipThreadNode's .inline-child-portal anchor (in edit mode, that
             anchor is INSIDE the marker host span at the cursor's structural
             position — child appears AT cursor like original Rizzoma's
             blip_thread.coffee + renderer.coffee:107-113).

          The block-inside-paragraph layout consequence (text after the marker
          on the same line continues on a new line below the rendered child)
          is exactly how original Rizzoma renders too — accepted price for
          true cursor-position inline rendering. NOT rendering below-the-editor
          as a flat stack: that was a previous mitigation but the user
          explicitly asked for "as in the original".
        */}
        {/* Portal path runs whenever TipTap markers are present:
              - isEditing (this blip is being edited inline), OR
              - contentOverride (the topic root's TipTap editor injected from
                RizzomaTopicDetail), OR
              - non-parity view mode (legacy injectInlineMarkers path).
            Previously the gate was `!parityViewRender` only, which evaluated
            to FALSE when the topic was in edit mode via contentOverride
            (because parityViewRender = RIZZOMA_PARITY_RENDER && !isEditing,
            and isEditing here is the BLIP's own edit state, not the topic's
            override-edit state) — so Ctrl+Enter created the marker but the
            new child blip never rendered into the portal anchor. The gate
            now positively requires TipTap-marker rendering OR non-parity. */}
        {(isEditing || !!contentOverride || !parityViewRender) && inlineChildren
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
              />
            </div>,
            portalContainers.current.get(child.id)!,
            `inline-${child.id}`
          ))}

        {contentFooter}

        {/* Child Blips (Replies) - BEFORE "Write a reply..." per BLB structure */}
        {(listChildren && listChildren.length > 0) || childFooter ? (
          <div className={`child-blips${childContainerClassName ? ` ${childContainerClassName}` : ''}`}>
            {listChildren && listChildren.length > 0 && (isTopicRoot ? (
              // Restore the lazy topic-root path from 28585a3e: large waves
              // keep every label in the DOM, but only mount full editor/collab
              // components near the viewport. Small waves retain eager mounts.
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
                      renderFull={(expandOnMount) => (
                        <RizzomaBlip
                          blip={expandOnMount ? { ...childBlip, isCollapsed: false } : childBlip}
                          isRoot={false}
                          depth={depth + 1}
                          onBlipUpdate={onBlipUpdate}
                          onAddReply={onAddReply}
                          onToggleCollapse={onToggleCollapse}
                          onDeleteBlip={onDeleteBlip}
                          onBlipRead={onBlipRead}
                          onExpand={onExpand}
                          expandedBlips={expandedBlips}
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
        {!isTopicRoot && !isEditing && blip.permissions.canComment && (
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
      
      {/* Selection annotation button (separate from BLB cursor-based inline comments) */}
      {FEATURES.INLINE_COMMENTS && showInlineCommentBtn && blip.permissions.canComment && !isEditing && selectionCoords && !isInlineCommentFormVisible && (
        <button
          className="inline-comment-btn"
          style={{
            position: 'fixed',
            left: `${selectionCoords.x}px`,
            top: `${selectionCoords.y}px`,
            transform: 'translateX(-50%)'
          }}
          onClick={handleInlineCommentButton}
          title="Annotate selected text"
          type="button"
        >
          💬 Annotate
        </button>
      )}

      {FEATURES.INLINE_COMMENTS && isInlineCommentFormVisible && selectionCoords && selectedRangeData && (
        <div
          className="inline-comment-floating-form"
          style={{
            position: 'fixed',
            left: `${selectionCoords.x}px`,
            top: `${selectionCoords.y}px`,
            transform: 'translateX(-50%)'
          }}
        >
          <div className="inline-comment-form-header">
            <span>
              Annotate: "
              {selectedRangeData.text.length > 40
                ? `${selectedRangeData.text.substring(0, 40)}…`
                : selectedRangeData.text}
              "
            </span>
            <button type="button" onClick={handleCancelInlineComment} aria-label="Close inline comment form">
              ✕
            </button>
          </div>
          <textarea
            className="inline-comment-form-textarea"
            value={inlineCommentDraft}
            onChange={(e) => setInlineCommentDraft(e.target.value)}
            placeholder="Add your annotation..."
            rows={3}
          />
          <div className="inline-comment-form-actions">
            <button type="button" onClick={handleCancelInlineComment}>Cancel</button>
            <button
              type="button"
              className="primary"
              onClick={handleSubmitInlineComment}
              disabled={isSavingInlineComment || !inlineCommentDraft.trim()}
            >
              {isSavingInlineComment ? 'Saving...' : 'Add annotation'}
            </button>
          </div>
        </div>
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
