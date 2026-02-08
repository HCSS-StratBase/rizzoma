import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { BlipMenu } from './BlipMenu';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { getEditorExtensions, defaultEditorProps } from '../editor/EditorConfig';
import { toast } from '../Toast';
import { copyBlipLink } from './copyBlipLink';
import { InlineComments, InlineCommentsStatus } from '../editor/InlineComments';
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
// Performance measurement is available via import { measureRender } from '../../lib/performance'

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
  onNavigateToSubblip,
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
  const isTopicRoot = renderMode === 'topic-root';
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

  // Dispatch blip-active-editable event so RightToolsPanel shows insert buttons
  // even before entering edit mode (enables auto-enter-edit on insert click)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(BLIP_ACTIVE_EVENT, {
      detail: { active: isActive && blip.permissions.canEdit },
    }));
  }, [isActive, blip.permissions.canEdit]);

  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [editedContent, setEditedContent] = useState(blip.content);
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
  const lastSavedContentRef = useRef<string>(blip.content);
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
  const pendingGadgetDetailRef = useRef<{ type?: string; url?: string } | null>(null);

  // Auto-save blip content (debounced, silent)
  const autoSaveBlip = useCallback(async (content: string) => {
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
  }, [blip.id, onBlipUpdate]);

  // Refs to hold current editor and callback (avoids stale closures in useEditor)
  const createChildBlipRef = useRef<(anchorPosition: number) => Promise<void>>();
  const inlineEditorRef = useRef<Editor | null>(null);

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

  // Create inline editor for editing mode
  const inlineEditor = useEditor({
    extensions: getEditorExtensions(undefined, undefined, {
      blipId: blip.id,
      onToggleInlineComments: (visible) => setInlineCommentsVisibility(blip.id, visible),
      onCreateInlineChildBlip: stableCreateInlineChildBlip,
      onHideComments: stableHideComments,
      onShowComments: stableShowComments,
    }),
    content: editedContent,
    editable: isEditing,
    editorProps: defaultEditorProps,
    onUpdate: ({ editor }: { editor: Editor }) => {
      const html = editor.getHTML();
      setEditedContent(html);

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
    // Cancel any pending auto-save for the old blip
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    // Reset state to new blip's content
    setEditedContent(blip.content);
    lastSavedContentRef.current = blip.content;
    setIsEditing(false);
    if (inlineEditor && !inlineEditor.isDestroyed) {
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
      console.log('[RizzomaBlip] createChildBlipFromEditor called, canComment:', blip.permissions.canComment, 'anchorPosition:', anchorPosition);
      if (!blip.permissions.canComment) return;

      try {
        // Extract waveId from the blip id (format: waveId:blipId)
        const waveId = blip.id.split(':')[0];
        console.log('[RizzomaBlip] Creating child blip for wave:', waveId, 'parent:', blip.id);

        const response = await fetch('/api/blips', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            waveId,
            parentId: blip.id,
            content: '<p></p>', // Empty content for new child blip
            anchorPosition, // Store the position where the [+] marker was created
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create child blip');
        }

        const newBlip = await response.json();
        const newBlipId = newBlip.id || newBlip._id;

        console.log('[RizzomaBlip] Created child blip via Ctrl+Enter:', newBlipId);

        // BLB: Insert [+] marker at cursor position in the parent content
        // This makes the marker PART of the content (like original Rizzoma)
        const editor = inlineEditorRef.current;
        if (editor) {
          (editor.commands as any)['insertBlipThread']({ threadId: newBlipId, hasUnread: false });
          // The content is auto-saved, so the [+] marker will persist
        }

        // BLB: Expand the new child blip inline (no navigation!)
        // Refresh topic data so the new child appears in inlineChildren
        window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
        // Immediately expand the new child inline
        if (newBlipId) {
          toggleInlineChild(newBlipId);
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

  const viewContentHtml = !isEditing && inlineChildren.length > 0
    ? injectInlineMarkers(blip.content || '', inlineChildren, localExpandedInline)
    : (blip.content || '');

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
      setIsActive(true);
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
    // Clear any pending auto-save and do a final save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    // Final save if content changed
    const currentContent = inlineEditor?.getHTML() || editedContent;
    if (currentContent !== lastSavedContentRef.current) {
      autoSaveBlip(currentContent);
    }
    setIsEditing(false);
    if (inlineEditor) {
      inlineEditor.setEditable(false);
    }
  }, [autoSaveBlip, editedContent, inlineEditor]);

  // handleSaveEdit now just finishes editing - auto-save handles the actual saving
  const handleSaveEdit = useCallback(async () => {
    handleFinishEdit();
  }, [handleFinishEdit]);

  const handleAddReply = async () => {
    if (!replyContent.trim()) return;

    try {
      // Extract waveId from the blip id (format: waveId:blipId)
      const waveId = blip.id.split(':')[0];

      const response = await fetch('/api/blips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          waveId,
          parentId: blip.id,
          content: replyContent
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create reply');
      }

      await response.json();

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

  // Handle text selection for inline comments
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
          toast('Sign in to add inline comments', 'error');
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
  const handleBlipClick = () => {
    setIsActive(true);
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
    const executeGadgetInsert = (editor: any, detail: { type?: string; url?: string } | null) => {
      const gadgetType = detail?.type || 'iframe';
      const url = detail?.url;

      switch (gadgetType) {
        case 'youtube': {
          if (!url) return;
          let embedUrl = url;
          const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
          if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`;
          editor.chain().focus().insertContent(`<iframe width="560" height="315" src="${embedUrl}" frameborder="0" allowfullscreen></iframe>`).run();
          break;
        }
        case 'code':
          editor.chain().focus().toggleCodeBlock().run();
          break;
        case 'poll':
          editor.chain().focus().insertContent({
            type: 'pollGadget',
            attrs: { question: 'Vote', options: JSON.stringify(['Yes', 'No', 'Maybe']), votes: '{}' },
          }).run();
          break;
        case 'latex':
          editor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: '$$  $$' }] }).run();
          break;
        case 'iframe':
        case 'spreadsheet':
        case 'image': {
          if (!url) return;
          if (gadgetType === 'image') {
            editor.chain().focus().insertContent(`<img src="${url}" alt="image" />`).run();
          } else {
            editor.chain().focus().insertContent(`<iframe width="600" height="400" src="${url}" frameborder="0" allowfullscreen></iframe>`).run();
          }
          break;
        }
        default:
          editor.chain().focus().insertContent(`[${gadgetType} gadget]`).run();
          break;
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
      const detail = (e as CustomEvent).detail as { type?: string; url?: string } | undefined;
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
        const gadgetType = detail?.type || 'iframe';
        const url = detail?.url;

        switch (gadgetType) {
          case 'youtube': {
            if (!url) return;
            let embedUrl = url;
            const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
            if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`;
            inlineEditor.chain().focus().insertContent(`<iframe width="560" height="315" src="${embedUrl}" frameborder="0" allowfullscreen></iframe>`).run();
            break;
          }
          case 'code':
            inlineEditor.chain().focus().toggleCodeBlock().run();
            break;
          case 'poll':
            inlineEditor.chain().focus().insertContent({
              type: 'pollGadget',
              attrs: { question: 'Vote', options: JSON.stringify(['Yes', 'No', 'Maybe']), votes: '{}' },
            }).run();
            break;
          case 'latex':
            inlineEditor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: '$$  $$' }] }).run();
            break;
          case 'iframe':
          case 'spreadsheet':
          case 'image': {
            if (!url) return;
            if (gadgetType === 'image') {
              inlineEditor.chain().focus().insertContent(`<img src="${url}" alt="image" />`).run();
            } else {
              inlineEditor.chain().focus().insertContent(`<iframe width="600" height="400" src="${url}" frameborder="0" allowfullscreen></iframe>`).run();
            }
            break;
          }
          default:
            inlineEditor.chain().focus().insertContent(`[${gadgetType} gadget]`).run();
            break;
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
        body: JSON.stringify({
          blipId: blip.id,
          content: inlineCommentDraft.trim(),
          range: selectedRangeData,
        }),
      });
      if (!response.ok) {
        throw new Error(typeof response.data === 'string' ? response.data : 'Failed to create inline comment');
      }
      toast('Inline comment added');
      setIsInlineCommentFormVisible(false);
      setInlineCommentDraft('');
      setShowInlineCommentBtn(false);
      setSelectedRangeData(null);
      setSelectionCoords(null);
      setIsExpanded(true);
      clearBrowserSelection();
    } catch (error) {
      console.error('Error creating inline comment:', error);
      toast('Failed to save inline comment', 'error');
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
    if (isInlineChild) {
      // Inline children: only auto-activate when entering edit mode.
      // On initial [+] expand, toolbar stays hidden until user clicks into content.
      if (isEditing) setIsActive(true);
    } else {
      setIsActive(effectiveExpanded || isEditing);
    }
  }, [effectiveExpanded, isEditing, isInlineChild]);


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
                      />
                    </div>,
                    portalContainers.current.get(child.id)!,
                    `inline-${child.id}`
                  ))}
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

        {contentFooter}

        {/* Child Blips (Replies) - BEFORE "Write a reply..." per BLB structure */}
        {(listChildren && listChildren.length > 0) || childFooter ? (
          <div className={`child-blips${childContainerClassName ? ` ${childContainerClassName}` : ''}`}>
            {listChildren && listChildren.length > 0 && (isTopicRoot ? (
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
      
      {/* Inline Comment Button */}
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
          title="Add inline comment"
          type="button"
        >
          💬 Comment
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
              Comment on: "
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
            placeholder="Add your comment..."
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
              {isSavingInlineComment ? 'Saving...' : 'Add comment'}
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
