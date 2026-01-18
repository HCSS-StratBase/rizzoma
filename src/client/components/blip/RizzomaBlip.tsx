import { useState, useRef, useEffect, useCallback } from 'react';
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
  setBlipClipboardPayload 
} from './clipboardStore';
import { createUploadTask, type UploadResult, type UploadTask } from '../../lib/upload';
import './RizzomaBlip.css';
import { measureRender } from '../../lib/performance';

export interface BlipData {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: number;
  updatedAt: number;
  isRead: boolean;
  deletedAt?: number;
  deleted?: boolean;
  childBlips?: BlipData[];
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canRead: boolean;
  };
  isCollapsed?: boolean;
  parentBlipId?: string;
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
}: RizzomaBlipProps) {
  const isPerfMode = typeof window !== 'undefined' && (window.location.hash || '').includes('perf=');
  const initialCollapsePreference = typeof blip.isCollapsed === 'boolean'
    ? blip.isCollapsed
    : getCollapsePreference(blip.id);
  const [collapseByDefault, setCollapseByDefault] = useState(initialCollapsePreference);
  const [isExpanded, setIsExpanded] = useState(() => !initialCollapsePreference);
  const [isEditing, setIsEditing] = useState(false);
  // Default active so the read toolbar is visible immediately (parity with legacy view surface)
  const [isActive, setIsActive] = useState(true);
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
  const [clipboardAvailable, setClipboardAvailable] = useState(() => !!getBlipClipboardPayload(blip.id));
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
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const blipContainerRef = useRef<HTMLDivElement>(null);
  const [areCommentsVisible, setAreCommentsVisible] = useState(() => getInlineCommentsVisibility(blip.id));
  const inlineVisibilityMetadata = getInlineCommentsVisibilityMetadata(blip.id);
  const inlineVisibilityUpdatedAtRef = useRef(inlineVisibilityMetadata?.updatedAt ?? 0);
  const collapsePreferenceMetadata = getCollapsePreferenceMetadata(blip.id);
  const collapsePreferenceUpdatedAtRef = useRef(collapsePreferenceMetadata?.updatedAt ?? 0);
  const readOnlySelectionWarned = useRef(false);

  // Create inline editor for editing mode
  const inlineEditor = useEditor({
    extensions: getEditorExtensions(undefined, undefined, {
      blipId: blip.id,
      onToggleInlineComments: (visible) => setInlineCommentsVisibility(blip.id, visible),
    }),
    content: editedContent,
    editable: isEditing,
    editorProps: defaultEditorProps,
    onUpdate: ({ editor }: { editor: Editor }) => {
      setEditedContent(editor.getHTML());
    },
  });

  const hasUnreadChildren = blip.childBlips?.some(child => !child.isRead) ?? false;
  const childCount = blip.childBlips?.length ?? 0;
  const unreadMarkerActive = !blip.isRead || hasUnreadChildren;

  const handleToggleExpand = () => {
    const next = !isExpanded;
    if (next && onExpand) {
      onExpand(blip.id);
    }
    setIsExpanded(next);
    onToggleCollapse?.(blip.id);
    if (!blip.isRead) {
      onBlipRead?.(blip.id);
    }
  };

  const handleStartEdit = () => {
    console.log('handleStartEdit called for blip:', blip.id, 'canEdit:', blip.permissions.canEdit);
    if (blip.permissions.canEdit) {
      setEditedContent(blip.content);
      setIsEditing(true);
      setIsActive(true);
      // Update inline editor content and make it editable
      if (inlineEditor) {
        inlineEditor.commands.setContent(blip.content);
        inlineEditor.setEditable(true);
      }
    }
  };

  const handleSaveEdit = async () => {
    if (isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      const currentContent = inlineEditor?.getHTML() || editedContent;
      const response = await fetch(`/api/blips/${blip.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: currentContent }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save edit');
      }
      
      onBlipUpdate?.(blip.id, currentContent);
      setIsEditing(false);
      setIsActive(false);
      if (inlineEditor) {
        inlineEditor.setEditable(false);
      }
    } catch (error) {
      console.error('Error saving blip edit:', error);
      toast('Failed to save changes. Please try again.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsActive(false);
    setEditedContent(blip.content);
    if (inlineEditor) {
      inlineEditor.commands.setContent(blip.content);
      inlineEditor.setEditable(false);
    }
  };

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
    setIsExpanded(!current);
    const unsubscribe = subscribeCollapsePreference(({ blipId: targetId, isCollapsed, updatedAt }) => {
      if (targetId === blip.id) {
        collapsePreferenceUpdatedAtRef.current = updatedAt;
        setCollapseByDefault(isCollapsed);
        setIsExpanded(!isCollapsed);
      }
    });
    return unsubscribe;
  }, [blip.id]);

  useEffect(() => {
    if (!inlineEditor) return;
    const dom = (inlineEditor.view as any)?.dom as HTMLElement | undefined;
    if (!dom) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        void handleSaveEdit();
      }
    };
    dom.addEventListener('keydown', handleKeyDown);
    return () => dom.removeEventListener('keydown', handleKeyDown);
  }, [inlineEditor, handleSaveEdit]);

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
          setIsExpanded(!payload.collapseByDefault);
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

  // Handle click outside to deactivate blip
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (blipContainerRef.current && !blipContainerRef.current.contains(event.target as Node)) {
        setIsActive(false);
      }
    };

    if (isActive) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActive]);

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

  const handleToggleCollapsePreference = async () => {
    if (!blip.permissions.canEdit) return;
    const previous = collapseByDefault;
    const next = !previous;
    setCollapseByDefault(next);
    setIsExpanded(!next);
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
      setIsExpanded(!previous);
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
  const effectiveExpanded = isRoot ? true : isExpanded;

  const rootStyle = isRoot && effectiveExpanded ? { display: 'block', opacity: 1, visibility: 'visible' } : {};

  return (
    <div 
      ref={blipContainerRef}
      className={`rizzoma-blip blip-container ${isRoot ? 'root-blip' : 'nested-blip'} ${!blip.isRead ? 'unread' : ''} ${isActive ? 'active' : ''}`}
      data-blip-id={blip.id}
      style={{ marginLeft: isRoot ? 0 : 20, position: 'relative', ...rootStyle }}
      onClick={handleBlipClick}
    >
      <div 
        className={`blip-expander ${unreadMarkerActive ? 'unread' : 'read'}`}
        onClick={handleToggleExpand}
        role="button"
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
        data-testid="blip-expander"
      >
        <span className="blip-expander-icon">{isExpanded ? '−' : '+'}</span>
      </div>
      {/* Inline Blip Menu */}
      <BlipMenu
        isActive={true}
        isEditing={isEditing}
        canEdit={blip.permissions.canEdit}
        canComment={blip.permissions.canComment}
        inlineCommentsNotice={inlineCommentsNotice}
        editor={inlineEditor || undefined}
        onStartEdit={handleStartEdit}
        onFinishEdit={handleCancelEdit}
        onSend={handleSendFromToolbar}
        onGetLink={handleCopyLink}
        onToggleComments={handleToggleCommentsVisibility}
        areCommentsVisible={areCommentsVisible}
        collapseByDefault={collapseByDefault}
        onToggleCollapseByDefault={blip.permissions.canEdit ? handleToggleCollapsePreference : undefined}
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
      />
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
        className={`blip-content ${effectiveExpanded ? 'expanded force-expanded' : 'collapsed'}`}
        style={{
          marginTop: isRoot ? '30px' : '0',
          minHeight: isRoot ? 100 : 24,
          ...(isRoot && effectiveExpanded ? { display: 'block', opacity: 1, visibility: 'visible' } : {}),
        }}
        data-expanded={effectiveExpanded ? '1' : '0'}
      >
        {isEditing ? (
          <div className="blip-editor-container" ref={editorRef}>
            {inlineEditor && (
              <div style={{ position: 'relative' }}>
                <EditorContent editor={inlineEditor} />
                {FEATURES.INLINE_COMMENTS && (
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
            <div className="blip-menu read-only-menu" data-testid="blip-menu-read-surface">
              <div 
                ref={contentRef}
                className="blip-text"
                dangerouslySetInnerHTML={{ __html: blip.content }}
              />
            </div>
          </div>
        )}

        {/* Reply Button */}
        {!isEditing && blip.permissions.canComment && (
          <div className="blip-actions">
            <button 
              className="btn-reply"
              onClick={() => setShowReplyForm(true)}
              disabled={showReplyForm}
            >
              <span className="reply-icon">↩</span>
              Reply
            </button>
          </div>
        )}

        {/* Reply Form */}
        {showReplyForm && (
          <div className="blip-reply-form">
            <textarea
              className="reply-textarea"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="Write your reply..."
              rows={3}
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

        {/* Child Blips */}
        {blip.childBlips && blip.childBlips.length > 0 && (
          <div className="child-blips">
            {blip.childBlips.map((childBlip) => {
              const childExpanded = expandedBlips?.has(childBlip.id);
              const text = childBlip.content
                ? childBlip.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                : '';
              const label = text
                ? text.length > 140
                  ? `${text.slice(0, 140)}…`
                  : text
                : 'Untitled blip';
              return (
                <div key={childBlip.id}>
                  <div
                    className="blip-collapsed-label"
                    data-blip-id={childBlip.id}
                    data-testid="blip-label-child"
                    style={{ display: childExpanded ? 'none' : 'flex' }}
                  >
                    <button
                      className="blip-expand-btn"
                      onClick={() => onExpand?.(childBlip.id)}
                      aria-label="Expand blip"
                      type="button"
                    >
                      +
                    </button>
                    <div className="blip-label-text">
                      <div className="blip-label-title">{label}</div>
                    </div>
                  </div>
                  <div style={{ display: childExpanded ? 'block' : 'none' }}>
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Collapsed State Indicator */}
      {!isExpanded && childCount > 0 && (
        <div className="blip-collapsed-info" onClick={handleToggleExpand}>
          <span className="collapsed-count">
            {childCount} {childCount === 1 ? 'reply' : 'replies'}
            {hasUnreadChildren && ' (unread)'}
          </span>
        </div>
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
