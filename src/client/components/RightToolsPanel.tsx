import { useState, useCallback, useEffect } from 'react';
import './RightToolsPanel.css';
import type { WaveUnreadState } from '../hooks/useWaveUnread';
import { emitWaveUnread } from '../lib/socket';
import { GadgetPalette, type GadgetType } from './GadgetPalette';

// Custom events for insert shortcuts - these are dispatched globally
// and picked up by the active blip editor
export const INSERT_EVENTS = {
  REPLY: 'rizzoma:insert-reply',
  MENTION: 'rizzoma:insert-mention',
  TASK: 'rizzoma:insert-task',
  TAG: 'rizzoma:insert-tag',
  GADGET: 'rizzoma:insert-gadget',
} as const;

// Edit mode event - dispatched by RizzomaBlip when entering/exiting edit mode
export const EDIT_MODE_EVENT = 'rizzoma:edit-mode-change' as const;

// Editor focus/blur events — dispatched by RizzomaBlip when TipTap editor gains/loses focus
export const EDITOR_FOCUS_EVENT = 'rizzoma:editor-focus' as const;
export const EDITOR_BLUR_EVENT = 'rizzoma:editor-blur' as const;

// Blip active event — dispatched by RizzomaBlip when a blip with edit permission becomes active/inactive
// Used to show insert buttons before entering edit mode (auto-enter-edit-mode on insert)
export const BLIP_ACTIVE_EVENT = 'rizzoma:blip-active-editable' as const;

// Helper to dispatch insert events
export function dispatchInsertEvent(eventType: string, data?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(eventType, { detail: data }));
}

interface RightToolsPanelProps {
  isAuthed: boolean;
  user?: { id?: string; email?: string; name?: string; avatar?: string } | null;
  unreadState?: WaveUnreadState | null;
}

// Generate fallback avatar URL from email using Gravatar
function getGravatarUrl(email?: string): string {
  if (!email) return '';
  // Simple hash for Gravatar - in production you'd use a proper MD5
  const hash = email.trim().toLowerCase();
  return `https://www.gravatar.com/avatar/${btoa(hash).slice(0, 32)}?d=identicon&s=80`;
}

// Get the best available avatar URL
function getAvatarUrl(user?: { email?: string; avatar?: string } | null): string {
  // Prefer OAuth provider avatar (Google, Facebook)
  if (user?.avatar) return user.avatar;
  // Fallback to Gravatar
  return getGravatarUrl(user?.email);
}

// Get initials from name or email
function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
}

export function RightToolsPanel({ user, unreadState }: RightToolsPanelProps) {
  const isPerfMode = (() => {
    try {
      if (typeof window === 'undefined') return false;
      const hash = window.location.hash || '';
      const query = hash.split('?')[1] || '';
      const params = new URLSearchParams(query);
      const perfValue = params.get('perf');
      if (perfValue === null) return false;
      return perfValue !== '0' && perfValue !== 'false';
    } catch {
      return false;
    }
  })();
  if (isPerfMode) {
    return null;
  }

  const [viewMode, setViewMode] = useState<'text' | 'mindmap'>('text');
  const [navigating, setNavigating] = useState(false);
  const [displayMode, setDisplayMode] = useState<'short' | 'expanded'>('expanded');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isBlipActiveEditable, setIsBlipActiveEditable] = useState(false);
  const [isCursorInEditor, setIsCursorInEditor] = useState(false);

  // Listen for edit mode changes and blip active events from RizzomaBlip
  useEffect(() => {
    const handleEditModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ isEditing: boolean }>;
      const editing = customEvent.detail?.isEditing ?? false;
      setIsEditMode(editing);
      if (!editing) setIsCursorInEditor(false);
    };
    const handleBlipActive = (e: Event) => {
      const customEvent = e as CustomEvent<{ active: boolean }>;
      setIsBlipActiveEditable(customEvent.detail?.active ?? false);
    };
    const handleFocus = () => setIsCursorInEditor(true);
    const handleBlur = () => setIsCursorInEditor(false);
    window.addEventListener(EDIT_MODE_EVENT, handleEditModeChange);
    window.addEventListener(BLIP_ACTIVE_EVENT, handleBlipActive);
    window.addEventListener(EDITOR_FOCUS_EVENT, handleFocus);
    window.addEventListener(EDITOR_BLUR_EVENT, handleBlur);
    return () => {
      window.removeEventListener(EDIT_MODE_EVENT, handleEditModeChange);
      window.removeEventListener(BLIP_ACTIVE_EVENT, handleBlipActive);
      window.removeEventListener(EDITOR_FOCUS_EVENT, handleFocus);
      window.removeEventListener(EDITOR_BLUR_EVENT, handleBlur);
    };
  }, []);

  const unreadCount = unreadState?.unreadIds.length ?? 0;

  // Insert shortcut handlers
  const handleInsertReply = useCallback(() => {
    dispatchInsertEvent(INSERT_EVENTS.REPLY);
  }, []);

  const handleInsertMention = useCallback(() => {
    dispatchInsertEvent(INSERT_EVENTS.MENTION);
  }, []);

  const handleInsertTask = useCallback(() => {
    dispatchInsertEvent(INSERT_EVENTS.TASK);
  }, []);

  const handleInsertTag = useCallback(() => {
    dispatchInsertEvent(INSERT_EVENTS.TAG);
  }, []);

  const [showGadgetPalette, setShowGadgetPalette] = useState(false);

  const handleInsertGadget = useCallback(() => {
    setShowGadgetPalette(prev => !prev);
  }, []);

  const handleGadgetSelect = useCallback((type: GadgetType, url?: string) => {
    dispatchInsertEvent(INSERT_EVENTS.GADGET, { type, url });
  }, []);

  const handleFollowGreen = async () => {
    if (navigating) return;
    setNavigating(true);

    const nextUnreadId = unreadState?.unreadIds[0] ?? null;

    // Find the unread blip element
    const findBlipElement = (blipId: string): HTMLElement | null => {
      const escape = (val: string) => {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(val);
        return val.replace(/["\\]/g, '\\$&');
      };
      return document.querySelector(`[data-blip-id="${escape(blipId)}"]`) as HTMLElement | null;
    };

    let target: HTMLElement | null = nextUnreadId ? findBlipElement(nextUnreadId) : null;

    if (!target) {
      const fallback = document.querySelector('.blip-item.unread');
      target = fallback as HTMLElement | null;
    }

    if (!target) {
      setNavigating(false);
      return;
    }

    // Scroll to the blip
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Click to select it
    const blipLine = target.querySelector('.blip-line') as HTMLElement;
    if (blipLine) {
      blipLine.click();
    }

    // Mark as read
    const blipId = target.getAttribute('data-blip-id');
    if (blipId && unreadState?.markBlipRead) {
      await unreadState.markBlipRead(blipId);
      if (unreadState.refresh) await unreadState.refresh();
      if (unreadState.waveId) emitWaveUnread(unreadState.waveId);
    }

    setNavigating(false);
  };

  // Fold/Unfold handlers
  const handleHideReplies = useCallback(() => {
    dispatchInsertEvent('rizzoma:fold-all');
  }, []);

  const handleShowReplies = useCallback(() => {
    dispatchInsertEvent('rizzoma:unfold-all');
  }, []);

  return (
    <div className="right-tools-panel">
      {/* User Avatar */}
      {user && (
        <div className="user-avatar-section">
          <div className="user-avatar-large" title={user.email || user.name || 'User'}>
            {(user.avatar || user.email) ? (
              <img
                src={getAvatarUrl(user)}
                alt={user.name || user.email}
                onError={(e) => {
                  // Fallback to initials on error
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <span className={`avatar-initials ${(user.avatar || user.email) ? 'hidden' : ''}`}>
              {getInitials(user.name, user.email)}
            </span>
          </div>
          <div className="user-name">{user.name || user.email?.split('@')[0] || 'User'}</div>
        </div>
      )}

      {/* Follow the Green - Next button */}
      <button
        className={`next-button ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={handleFollowGreen}
        disabled={unreadCount === 0 || navigating}
        title={unreadCount > 0 ? `${unreadCount} unread - click to navigate` : 'No unread blips'}
      >
        Next
        <span className="next-arrow">▶</span>
      </button>

      {/* Fold/Unfold controls */}
      <div className="fold-controls">
        <button
          className="fold-btn"
          onClick={handleHideReplies}
          title="Hide replies (Ctrl+Shift+Up)"
        >
          <span className="fold-icon">▲</span>
        </button>
        <button
          className="fold-btn"
          onClick={handleShowReplies}
          title="Show replies (Ctrl+Shift+Down)"
        >
          <span className="fold-icon">▼</span>
        </button>
      </div>

      {/* View mode toggle */}
      <div className="view-toggle">
        <button
          className={`view-btn ${viewMode === 'text' ? 'active' : ''}`}
          onClick={() => setViewMode('text')}
          title="Text view"
        >
          <span className="view-icon">☰</span>
          <span className="view-label">Text view</span>
        </button>
        <button
          className={`view-btn ${viewMode === 'mindmap' ? 'active' : ''}`}
          onClick={() => setViewMode('mindmap')}
          title="Mind map"
        >
          <span className="view-icon">⟨⟩</span>
          <span className="view-label">Mind map</span>
        </button>
      </div>

      {/* Display mode toggle (short/expanded) */}
      <div className="display-toggle">
        <button
          className={`display-btn ${displayMode === 'short' ? 'active' : ''}`}
          onClick={() => setDisplayMode('short')}
          title="Short view"
        >
          short
        </button>
        <button
          className={`display-btn ${displayMode === 'expanded' ? 'active' : ''}`}
          onClick={() => setDisplayMode('expanded')}
          title="Expanded view"
        >
          expanded
        </button>
      </div>

      {/* Insert shortcuts - visible when editing or when an editable blip is active */}
      {(isEditMode || isBlipActiveEditable) && <div className="insert-shortcuts">
          <button
            className="insert-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertReply}
            title="Insert reply (Ctrl+Enter)"
          >
            <span className="insert-icon">↵</span>
          </button>
          <button
            className="insert-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertMention}
            title="Insert mention (@)"
          >
            <span className="insert-icon">@</span>
          </button>
          <button
            className="insert-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertTask}
            title="Insert task (~)"
          >
            <span className="insert-icon">~</span>
          </button>
          <button
            className="insert-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertTag}
            title="Insert tag (#)"
          >
            <span className="insert-icon">#</span>
          </button>
          <button
            className="insert-btn gadget-btn"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertGadget}
            title="Insert gadget"
          >
            <span className="insert-label">Gadgets</span>
          </button>
          {showGadgetPalette && (
            <GadgetPalette
              onSelect={handleGadgetSelect}
              onClose={() => setShowGadgetPalette(false)}
            />
          )}
        </div>}
    </div>
  );
}
