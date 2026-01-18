import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { InlineComment } from '@shared/types/comments';
import { FEATURES } from '@shared/featureFlags';
import { api, ensureCsrf } from '../../lib/api';
import { toast } from '../Toast';
import { buildCommentDecorationSet } from './inlineCommentDecorations';
import './InlineComments.css';

export interface InlineCommentsStatus {
  loadError: string | null;
  loadErrorType: 'auth' | 'network' | null;
  isFetching: boolean;
  canComment: boolean;
  hasComments: boolean;
}

interface InlineCommentsProps {
  editor: Editor | null;
  blipId: string;
  isVisible?: boolean;
  canComment?: boolean;
  onStatusChange?: (status: InlineCommentsStatus) => void;
}

// Plugin key for decorations
const commentDecorationsKey = new PluginKey('commentDecorations');

const getRangeKey = (range: InlineComment['range']) => `${range.start}:${range.end}`;

type ThreadedComment = InlineComment & { replies?: ThreadedComment[] };

export function InlineComments({ 
  editor, 
  blipId, 
  isVisible = true,
  canComment = true,
  onStatusChange,
}: InlineCommentsProps) {
  const [comments, setComments] = useState<InlineComment[]>([]);
  const [selectedRange, setSelectedRange] = useState<{start: number; end: number; text: string} | null>(null);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [hoveredRangeKey, setHoveredRangeKey] = useState<string | null>(null);
  const [pinnedRangeKey, setPinnedRangeKey] = useState<string | null>(null);
  const [anchorPosition, setAnchorPosition] = useState<{ x: number; y: number } | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replySaving, setReplySaving] = useState<Record<string, boolean>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorType, setLoadErrorType] = useState<'auth' | 'network' | null>(null);
  const [isFetchingComments, setIsFetchingComments] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [navigationFilter, setNavigationFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [navigationCursor, setNavigationCursor] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const readOnlyBannerMessage = !canComment && !loadError
    ? 'Inline comments are read-only for this blip.'
    : null;

  const groupedComments = useMemo(() => {
    const map = new Map<string, { range: InlineComment['range']; comments: ThreadedComment[] }>();
    comments.forEach((comment) => {
      const key = getRangeKey(comment.range);
      if (!map.has(key)) {
        map.set(key, { range: comment.range, comments: [] });
      }
    });

    map.forEach((value, key) => {
      const rangeComments = comments.filter((comment) => getRangeKey(comment.range) === key);
      const byId = new Map<string, ThreadedComment>();
      rangeComments.forEach((comment) => {
        byId.set(comment.id, { ...comment, replies: [] });
      });
      const roots: ThreadedComment[] = [];
      byId.forEach((comment) => {
        if (comment.parentId && byId.has(comment.parentId)) {
          byId.get(comment.parentId)!.replies!.push(comment);
        } else {
          roots.push(comment);
        }
      });
      value.comments = roots;
    });

    return map;
  }, [comments]);
  const groupedRef = useRef(groupedComments);

  useEffect(() => {
    groupedRef.current = groupedComments;
  }, [groupedComments]);

  const rangeOrder = useMemo(
    () => Array.from(groupedComments.entries())
      .sort((a, b) => a[1].range.start - b[1].range.start)
      .map(([key]) => key),
    [groupedComments]
  );

  const filteredRangeKeys = useMemo(() => {
    if (navigationFilter === 'all') return rangeOrder;
    const filtered = Array.from(groupedComments.entries())
      .filter(([_, value]) => navigationFilter === 'resolved'
        ? value.comments.every((comment) => comment.resolved)
        : value.comments.some((comment) => !comment.resolved))
      .sort((a, b) => a[1].range.start - b[1].range.start)
      .map(([key]) => key);
    return filtered;
  }, [groupedComments, navigationFilter, rangeOrder]);

  // Add comment button when text is selected
  useEffect(() => {
    if (!editor || !FEATURES.INLINE_COMMENTS || !isVisible) return;

    const handleSelectionChange = () => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, ' ');
      
      if (text.length > 0 && from !== to) {
        setSelectedRange({ start: from, end: to, text });
      } else {
        setSelectedRange(null);
        setShowCommentForm(false);
      }
    };

    editor.on('selectionUpdate', handleSelectionChange);
    return () => {
      editor.off('selectionUpdate', handleSelectionChange);
    };
  }, [editor, isVisible]);

  useEffect(() => {
    if (isVisible) return;
    setHoveredRangeKey(null);
    setPinnedRangeKey(null);
    setAnchorPosition(null);
  }, [isVisible]);

  // Create comment decorations plugin
  const updateAnchorFromElement = useCallback((element: HTMLElement | null) => {
    if (typeof window === 'undefined') return;
    if (!element) {
      setAnchorPosition(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setAnchorPosition({
      x: rect.right + 12,
      y: rect.top + window.scrollY,
    });
  }, []);

  const focusRangeByKey = useCallback((rangeKey: string) => {
    if (!editor) return;
    const element = (editor.view as any)?.dom?.querySelector(
      `.commented-text[data-comment-range="${rangeKey}"]`
    ) as HTMLElement | null;
    if (!element) return;
    setPinnedRangeKey(rangeKey);
    setHoveredRangeKey(rangeKey);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateAnchorFromElement(element);
  }, [editor, updateAnchorFromElement]);

  useEffect(() => {
    if (!editor || !FEATURES.INLINE_COMMENTS) return;

    const removePlugin = () => {
      const state = editor.state as any;
      if (!state?.plugins || !Array.isArray(state.plugins)) return;
      const nextPlugins = state.plugins.filter((p: any) => p.key !== commentDecorationsKey);
      editor.view.updateState(state.reconfigure({ plugins: nextPlugins }));
    };

    if (!isVisible) {
      removePlugin();
      return;
    }

    const plugin = new Plugin({
      key: commentDecorationsKey,
      state: {
        init: (_config, state) => buildCommentDecorationSet(state.doc, groupedRef.current),
        apply(tr, oldSet) {
          const mapped = oldSet.map(tr.mapping, tr.doc);
          const meta = tr.getMeta(commentDecorationsKey);
          if (meta && meta.rebuild) {
            return buildCommentDecorationSet(tr.doc, groupedRef.current);
          }
          if (tr.docChanged) {
            return mapped;
          }
          return mapped;
        }
      },
      props: {
        decorations(state) {
          return this.getState(state);
        }
      }
    });

    const state = editor.state as any;
    if (!state?.plugins || !Array.isArray(state.plugins)) return;
    const nextPlugins = [...state.plugins.filter((p: any) => p.key !== commentDecorationsKey), plugin];
    editor.view.updateState(state.reconfigure({ plugins: nextPlugins }));

    return () => {
      removePlugin();
    };
  }, [editor, isVisible]);

  useEffect(() => {
    if (!editor || !FEATURES.INLINE_COMMENTS || !isVisible) return;
    const tr = (editor.state as any).tr?.setMeta?.(commentDecorationsKey, { rebuild: true });
    if (tr) editor.view.dispatch(tr);
  }, [editor, groupedComments, isVisible]);

  useEffect(() => {
    if (!FEATURES.INLINE_COMMENTS) return;
    let cancelled = false;
    const fetchComments = async () => {
      setIsFetchingComments(true);
      try {
        const response = await api<{ comments?: InlineComment[] }>(
          `/api/blip/${encodeURIComponent(blipId)}/comments`
        );
        if (!response.ok || cancelled) {
          if (!cancelled) {
            const isAuthError = response.status === 401 || response.status === 403;
            const message = isAuthError
              ? 'Sign in to view inline comments'
              : 'Inline comments are temporarily unavailable';
            setComments([]);
            setLoadError(message);
            setLoadErrorType(isAuthError ? 'auth' : 'network');
          }
          return;
        }
        const payload = response.data && typeof response.data === 'object'
          ? (response.data as { comments?: InlineComment[] })
          : null;
        if (!cancelled) {
          if (payload && Array.isArray(payload.comments)) {
            setComments(payload.comments);
          } else {
            setComments([]);
          }
          setLoadError(null);
          setLoadErrorType(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load inline comments:', error);
          setComments([]);
          setLoadError('Inline comments are temporarily unavailable');
          setLoadErrorType('network');
        }
      } finally {
        if (!cancelled) {
          setIsFetchingComments(false);
        }
      }
    };
    fetchComments();
    return () => {
      cancelled = true;
    };
  }, [blipId, reloadToken]);

  useEffect(() => {
    if (!editor || !FEATURES.INLINE_COMMENTS || !isVisible || loadError) return;
    const dom = (editor.view as any).dom as HTMLElement;
    const getRangeElement = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) return null;
      if (target.classList.contains('commented-text')) return target;
      return target.closest('.commented-text');
    };

    const handleMouseOver = (event: MouseEvent) => {
      const element = getRangeElement(event.target);
      if (!element) return;
      const key = element.getAttribute('data-comment-range');
      if (!key) return;
      setHoveredRangeKey(key);
      updateAnchorFromElement(element);
    };

    const handleMouseOut = (event: MouseEvent) => {
      const element = getRangeElement(event.target);
      if (!element) return;
      const key = element.getAttribute('data-comment-range');
      if (!key) return;
      const related = event.relatedTarget as HTMLElement | null;
      if (related && (related.closest('.commented-text') || popoverRef.current?.contains(related))) {
        return;
      }
      if (!pinnedRangeKey || pinnedRangeKey !== key) {
        setHoveredRangeKey(null);
        if (!pinnedRangeKey) {
          setAnchorPosition(null);
        }
      }
    };

    const handleClick = (event: MouseEvent) => {
      const element = getRangeElement(event.target);
      if (element) {
        const key = element.getAttribute('data-comment-range');
        if (!key) return;
        setPinnedRangeKey((prev) => (prev === key ? null : key));
        updateAnchorFromElement(element);
        return;
      }
      if (popoverRef.current?.contains(event.target as Node)) {
        return;
      }
      setPinnedRangeKey(null);
      if (!hoveredRangeKey) {
        setAnchorPosition(null);
      }
    };

    dom.addEventListener('mouseover', handleMouseOver);
    dom.addEventListener('mouseout', handleMouseOut);
    dom.addEventListener('click', handleClick);
    return () => {
      dom.removeEventListener('mouseover', handleMouseOver);
      dom.removeEventListener('mouseout', handleMouseOut);
      dom.removeEventListener('click', handleClick);
    };
  }, [editor, hoveredRangeKey, isVisible, loadError, pinnedRangeKey, updateAnchorFromElement]);

  useEffect(() => {
    if (!editor || !FEATURES.INLINE_COMMENTS || !isVisible || loadError) return;
    const activeKey = pinnedRangeKey ?? hoveredRangeKey;
    if (!activeKey) return;
    const element = (editor.view as any).dom.querySelector(
      `.commented-text[data-comment-range="${activeKey}"]`
    ) as HTMLElement | null;
    if (element) {
      updateAnchorFromElement(element);
    }
  }, [editor, hoveredRangeKey, isVisible, loadError, pinnedRangeKey, updateAnchorFromElement]);

  // Handle comment submission
  const handleSubmit = useCallback(() => {
    if (!selectedRange || !commentText.trim() || !canComment || loadError) return;

    const range = selectedRange;
    const now = Date.now();
    const optimisticId = `tmp-comment-${now}`;
    const content = commentText.trim();
    const optimisticComment: InlineComment = {
      id: optimisticId,
      blipId,
      userId: 'current-user',
      userName: 'Current User',
      content,
      resolved: false,
      resolvedAt: null,
      rootId: optimisticId,
      range,
      createdAt: now,
      updatedAt: now,
    };

    setComments((prev) => [...prev, optimisticComment]);

    // Reset form
    setCommentText('');
    setShowCommentForm(false);
    setSelectedRange(null);
    
    // Clear editor selection
    editor?.commands.setTextSelection(range.end);
    
    const persist = async () => {
      try {
        await ensureCsrf();
        const response = await api<{ comment?: InlineComment }>('/api/comments', {
          method: 'POST',
          body: JSON.stringify({
            blipId,
            content,
            range,
          }),
        });
        if (!response.ok) {
          throw new Error(typeof response.data === 'string' ? response.data : 'Failed to create comment');
        }
        const payload = response.data && typeof response.data === 'object'
          ? (response.data as { comment?: InlineComment })
          : null;
        const nextComment = payload?.comment;
        if (nextComment) {
          setComments((prev) =>
            prev.map((comment) => (comment.id === optimisticId ? nextComment : comment))
          );
        }
      } catch (error) {
        console.error('Failed to save inline comment:', error);
        toast('Failed to save inline comment', 'error');
        setComments((prev) => prev.filter((comment) => comment.id !== optimisticId));
      }
    };

    void persist();
  }, [selectedRange, commentText, blipId, editor, canComment, loadError]);

  const handleResolveComment = useCallback((commentId: string, nextResolved: boolean) => {
    if (!canComment || loadError) return;
    const timestamp = Date.now();
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, resolved: nextResolved, resolvedAt: nextResolved ? timestamp : null }
          : comment
      )
    );

    const persist = async () => {
      try {
        await ensureCsrf();
        const response = await api(`/api/comments/${encodeURIComponent(commentId)}/resolve`, {
          method: 'PATCH',
          body: JSON.stringify({ resolved: nextResolved }),
        });
        if (!response.ok) {
          throw new Error(typeof response.data === 'string' ? response.data : 'Failed to resolve comment');
        }
      } catch (error) {
        console.error('Failed to resolve inline comment:', error);
        toast('Failed to resolve inline comment', 'error');
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === commentId
              ? { ...comment, resolved: !nextResolved, resolvedAt: !nextResolved ? null : comment.resolvedAt }
              : comment
          )
        );
      }
    };

    void persist();
  }, [canComment, loadError]);

  const handleStartReply = useCallback((commentId: string) => {
    setReplyDrafts((prev) => ({ ...prev, [commentId]: prev[commentId] ?? '' }));
  }, []);

  const handleCancelReply = useCallback((commentId: string) => {
    setReplyDrafts((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
    setReplySaving((prev) => {
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
  }, []);

  const handleReplyChange = useCallback((commentId: string, value: string) => {
    setReplyDrafts((prev) => ({ ...prev, [commentId]: value }));
  }, []);

  const handleSubmitReply = useCallback(async (comment: InlineComment) => {
    const draft = (replyDrafts[comment.id] || '').trim();
    if (!draft || !canComment || loadError) return;

    const now = Date.now();
    const optimisticId = `tmp-reply-${now}`;
    const optimisticComment: InlineComment = {
      id: optimisticId,
      blipId,
      userId: 'current-user',
      userName: 'Current User',
      content: draft,
      resolved: false,
      resolvedAt: null,
      parentId: comment.id,
      rootId: comment.rootId || comment.id,
      range: comment.range,
      createdAt: now,
      updatedAt: now,
    };

    setComments((prev) => [...prev, optimisticComment]);
    setReplySaving((prev) => ({ ...prev, [comment.id]: true }));
    setReplyDrafts((prev) => ({ ...prev, [comment.id]: '' }));

    try {
      await ensureCsrf();
      const response = await api<{ comment?: InlineComment }>('/api/comments', {
        method: 'POST',
        body: JSON.stringify({
          blipId,
          content: draft,
          range: comment.range,
          parentId: comment.id,
        }),
      });
      if (!response.ok) {
        throw new Error(typeof response.data === 'string' ? response.data : 'Failed to create comment');
      }
      const payload = response.data && typeof response.data === 'object'
        ? (response.data as { comment?: InlineComment })
        : null;
      if (payload?.comment) {
        setComments((prev) => prev.map((c) => (c.id === optimisticId ? payload.comment! : c)));
      }
    } catch (error) {
      console.error('Failed to save inline reply:', error);
      toast('Failed to save inline comment', 'error');
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      setReplyDrafts((prev) => ({ ...prev, [comment.id]: draft }));
    } finally {
      setReplySaving((prev) => {
        const next = { ...prev };
        delete next[comment.id];
        return next;
      });
    }
  }, [blipId, replyDrafts, canComment, loadError]);

  const openCount = comments.filter((comment) => !comment.resolved).length;
  const resolvedCount = comments.length - openCount;
  const activeRangeKey = pinnedRangeKey ?? hoveredRangeKey;
  const activeGroup = activeRangeKey ? groupedComments.get(activeRangeKey) : undefined;
  const interactionDisabled = !canComment || !!loadError;
  const navDisabled = !!loadError;
  const handleRetryLoad = useCallback(() => {
    if (isFetchingComments) return;
    setReloadToken((token) => token + 1);
  }, [isFetchingComments]);

  useEffect(() => {
    if (!isVisible || navDisabled) return;
    const handleNavShortcut = (event: KeyboardEvent) => {
      if (!(event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp'))) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (filteredRangeKeys.length === 0) return;
      event.preventDefault();
      const activeKey = pinnedRangeKey || navigationCursor || filteredRangeKeys[0];
      const currentIndex = Math.max(0, filteredRangeKeys.indexOf(activeKey));
      const nextIndex = event.key === 'ArrowDown'
        ? (currentIndex + 1) % filteredRangeKeys.length
        : (currentIndex - 1 + filteredRangeKeys.length) % filteredRangeKeys.length;
      const nextKey = filteredRangeKeys[nextIndex];
      setNavigationCursor(nextKey);
      focusRangeByKey(nextKey);
    };
    window.addEventListener('keydown', handleNavShortcut);
    return () => window.removeEventListener('keydown', handleNavShortcut);
  }, [filteredRangeKeys, focusRangeByKey, isVisible, navDisabled, navigationCursor, pinnedRangeKey]);

  const renderCommentThread = (comment: ThreadedComment, depth = 0) => {
    const replyDraft = replyDrafts[comment.id];
    const saving = !!replySaving[comment.id];

    return (
      <div
        key={comment.id}
        className={`inline-comment ${comment.resolved ? 'resolved' : ''}`}
        style={{ marginLeft: depth ? depth * 8 : 0 }}
      >
        <div className="comment-header">
          <div className="comment-identity">
            {comment.userAvatar ? (
              <img src={comment.userAvatar} alt={comment.userName} className="comment-avatar" />
            ) : (
              <span className="comment-avatar fallback">
                {comment.userName?.charAt(0)?.toUpperCase() || '?'}
              </span>
            )}
            <div className="comment-name-block">
              <strong>{comment.userName}</strong>
              {comment.userEmail && <span className="comment-email">{comment.userEmail}</span>}
            </div>
          </div>
          <span className="comment-time">
            {new Date(comment.createdAt).toLocaleString()}
          </span>
        </div>
        <div className="comment-content">{comment.content}</div>
        <div className="inline-comment-actions">
          {!comment.resolved ? (
            <button
              className="resolve-button"
              onClick={(event) => {
                event.stopPropagation();
                handleResolveComment(comment.id, true);
              }}
              disabled={interactionDisabled}
            >
              ✓ Resolve
            </button>
          ) : (
            <button
              className="reopen-button"
              onClick={(event) => {
                event.stopPropagation();
                handleResolveComment(comment.id, false);
              }}
              disabled={interactionDisabled}
            >
              Reopen
            </button>
          )}
          <button
            className="reply-button"
            onClick={(event) => {
              event.stopPropagation();
              handleStartReply(comment.id);
            }}
            disabled={interactionDisabled}
          >
            Reply
          </button>
        </div>

        {replyDraft !== undefined && (
          <div className="inline-comment-reply">
            <textarea
              value={replyDraft}
              onChange={(event) => handleReplyChange(comment.id, event.target.value)}
              placeholder="Reply to this comment"
              rows={3}
              disabled={interactionDisabled}
            />
            <div className="comment-form-actions">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  handleCancelReply(comment.id);
                }}
                disabled={interactionDisabled}
              >
                Cancel
              </button>
              <button
                className="primary"
                disabled={!replyDraft.trim() || saving || interactionDisabled}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleSubmitReply(comment);
                }}
              >
                {saving ? 'Replying…' : 'Reply'}
              </button>
            </div>
          </div>
        )}

        {comment.replies && comment.replies.length > 0 && (
          <div className="inline-comment-replies">
            {comment.replies.map((child) => renderCommentThread(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!onStatusChange) return;
    onStatusChange({
      loadError,
      loadErrorType,
      isFetching: isFetchingComments,
      canComment,
      hasComments: comments.length > 0,
    });
  }, [onStatusChange, loadError, loadErrorType, isFetchingComments, canComment, comments.length]);

  if (!FEATURES.INLINE_COMMENTS || !isVisible) return null;

  return (
    <>
      {loadError && (
        <div
          className="inline-comments-banner persistent"
          role="status"
          data-testid="inline-comments-error"
        >
          <span>{loadError}</span>
          {loadErrorType !== 'auth' && (
            <button
              type="button"
              onClick={handleRetryLoad}
              disabled={isFetchingComments}
              data-testid="inline-comments-retry"
            >
              {isFetchingComments ? 'Retrying…' : 'Retry'}
            </button>
          )}
        </div>
      )}
      {!loadError && isFetchingComments && (
        <div
          className="inline-comments-banner loading"
          role="status"
          data-testid="inline-comments-loading"
        >
          Loading inline comments…
        </div>
      )}

      <div
        className="inline-comment-nav"
        aria-label="Inline comment navigation"
        data-testid="inline-comment-nav"
      >
        <div className="inline-comment-nav-header">
          <span>Inline comments</span>
          <span className="inline-comment-nav-shortcuts">Alt+↑ / Alt+↓</span>
        </div>
        {readOnlyBannerMessage && (
          <div className="inline-comments-banner" role="status" data-testid="inline-comments-readonly">
            {readOnlyBannerMessage}
          </div>
        )}
        <div className="inline-comment-nav-filters">
          <button
            type="button"
            className={navigationFilter === 'all' ? 'active' : ''}
            onClick={() => setNavigationFilter('all')}
            data-testid="inline-comment-filter-all"
          >
            All ({rangeOrder.length})
          </button>
          <button
            type="button"
            className={navigationFilter === 'open' ? 'active' : ''}
            onClick={() => setNavigationFilter('open')}
            data-testid="inline-comment-filter-open"
          >
            Open ({openCount})
          </button>
          <button
            type="button"
            className={navigationFilter === 'resolved' ? 'active' : ''}
            onClick={() => setNavigationFilter('resolved')}
            data-testid="inline-comment-filter-resolved"
          >
            Resolved ({resolvedCount})
          </button>
        </div>
        <ul className="inline-comment-nav-list">
          {filteredRangeKeys.map((key) => {
            const group = groupedComments.get(key);
            if (!group) return null;
            const isActive = key === (pinnedRangeKey ?? hoveredRangeKey);
            const snippet = group.range.text.length > 50
              ? `${group.range.text.substring(0, 50)}…`
              : group.range.text;
            return (
              <li key={key}>
                <button
                  type="button"
                  className={`inline-comment-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => focusRangeByKey(key)}
                  disabled={navDisabled}
                >
                  <span className="inline-comment-nav-snippet">{snippet}</span>
                  <span className="inline-comment-nav-meta">
                    {group.comments.length} {group.comments.length === 1 ? 'comment' : 'comments'}
                    {group.comments.every((c) => c.resolved) ? ' • resolved' : ''}
                  </span>
                </button>
              </li>
            );
          })}
          {filteredRangeKeys.length === 0 && (
            <li className="inline-comment-nav-empty">No inline comments yet</li>
          )}
        </ul>
      </div>

      {/* Comment button for selected text */}
      {selectedRange && !showCommentForm && !interactionDisabled && (
        <button
          className="add-comment-button"
          onClick={() => setShowCommentForm(true)}
          data-testid="inline-comments-add-button"
          style={{
            position: 'absolute',
            top: '0',
            right: '-40px',
          }}
          title="Add comment to selection"
        >
          💬
        </button>
      )}

      {/* Comment form */}
      {showCommentForm && selectedRange && (
        <div className="inline-comment-form" data-testid="inline-comments-form">
          <div className="comment-form-header">
            <span>Comment on: "{selectedRange.text.substring(0, 30)}..."</span>
            <button onClick={() => setShowCommentForm(false)}>✕</button>
          </div>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add your comment..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                handleSubmit();
              }
            }}
            disabled={interactionDisabled}
          />
          <div className="comment-form-actions">
            <button onClick={() => setShowCommentForm(false)} disabled={interactionDisabled}>Cancel</button>
            <button 
              onClick={handleSubmit}
              disabled={!commentText.trim() || interactionDisabled}
              className="primary"
            >
              Add Comment
            </button>
          </div>
        </div>
      )}

      {activeGroup && anchorPosition && (
        <div
          ref={popoverRef}
          className={`inline-comments-popover ${pinnedRangeKey ? 'pinned' : ''}`}
          data-testid="inline-comments-popover"
          style={{
            left: `${anchorPosition.x}px`,
            top: `${anchorPosition.y}px`,
          }}
          onMouseLeave={() => {
            if (!pinnedRangeKey) {
              setHoveredRangeKey(null);
              setAnchorPosition(null);
            }
          }}
      >
        <div className="inline-comments-popover-header">
          <strong>
            {activeGroup.comments.length} {activeGroup.comments.length === 1 ? 'comment' : 'comments'}
          </strong>
            {pinnedRangeKey && (
              <button
                type="button"
                className="inline-comments-popover-close"
                onClick={() => {
                  setPinnedRangeKey(null);
                  setHoveredRangeKey(null);
                  setAnchorPosition(null);
                }}
                aria-label="Close inline comments popover"
              >
                ✕
              </button>
            )}
          </div>
          <div className="comment-text-preview">
            “
            {activeGroup.range.text.length > 60
              ? `${activeGroup.range.text.substring(0, 60)}…`
              : activeGroup.range.text}
            ”
          </div>
          {(loadError || !canComment) && (
            <div className="inline-comments-banner" role="status">
              {loadError ?? 'Inline comments are read-only for this blip.'}
            </div>
          )}
          {activeGroup.comments.map((comment) => renderCommentThread(comment))}
        </div>
      )}
    </>
  );
}
