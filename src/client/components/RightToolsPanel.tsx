import { useState, useCallback, useEffect, useRef } from 'react';
import './RightToolsPanel.css';
import type { WaveUnreadState } from '../hooks/useWaveUnread';
import { emitWaveUnread } from '../lib/socket';
import { api } from '../lib/api';
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
  onNextTopic?: () => void;
  nextTopicAvailable?: boolean;
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

export function RightToolsPanel({ user, unreadState, onNextTopic, nextTopicAvailable }: RightToolsPanelProps) {
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
  const [_isCursorInEditor, setIsCursorInEditor] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.avatar]);

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

  // Track the last blip expanded by Follow-the-Green so we can collapse it before jumping to next
  const lastExpandedRef = useRef<{ blipId: string; isInline: boolean } | null>(null);

  const handleFollowGreen = async () => {
    if (navigating) return;
    setNavigating(true);

    const nextUnreadId = unreadState?.unreadIds[0] ?? null;
    if (!nextUnreadId) {
      setNavigating(false);
      return;
    }

    const cssEscape = (val: string) => {
      if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(val);
      return val.replace(/["\\]/g, '\\$&');
    };

    // Collapse the previously expanded blip before jumping to next
    if (lastExpandedRef.current) {
      const prev = lastExpandedRef.current;
      // Deactivate toolbar
      window.dispatchEvent(new CustomEvent('rizzoma:deactivate-blip', { detail: { blipId: prev.blipId } }));
      // Collapse
      if (prev.isInline) {
        window.dispatchEvent(new CustomEvent('rizzoma:collapse-inline-blip', { detail: { threadId: prev.blipId } }));
      } else {
        window.dispatchEvent(new CustomEvent('rizzoma:collapse-blip', { detail: { blipId: prev.blipId } }));
      }
    }

    // 1. Try finding already-rendered blip element (list children or expanded inline children)
    let target: HTMLElement | null =
      document.querySelector(`[data-blip-id="${cssEscape(nextUnreadId)}"]`) as HTMLElement | null;

    // 2. If not found, the blip is likely a collapsed inline child ([+] marker).
    //    Find its thread marker and expand it.
    let wasInline = false;
    if (!target) {
      const marker = document.querySelector(
        `[data-blip-thread="${cssEscape(nextUnreadId)}"]`
      ) as HTMLElement | null;

      if (marker) {
        wasInline = true;
        // Scroll the marker into view first so user sees it
        marker.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Dispatch toggle event to expand the inline child
        window.dispatchEvent(new CustomEvent('rizzoma:toggle-inline-blip', {
          detail: { threadId: nextUnreadId },
        }));

        // Wait for the expanded blip element to render (poll up to ~500ms)
        target = await new Promise<HTMLElement | null>((resolve) => {
          let attempts = 0;
          const check = () => {
            attempts++;
            const el = document.querySelector(
              `[data-blip-id="${cssEscape(nextUnreadId)}"]`
            ) as HTMLElement | null;
            if (el) resolve(el);
            else if (attempts > 30) resolve(null);
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        });
      }
    }

    if (!target) {
      setNavigating(false);
      return;
    }

    // Record what we expanded so we can collapse it on next jump
    lastExpandedRef.current = { blipId: nextUnreadId, isInline: wasInline };

    // Scroll to the blip
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Activate the blip (show toolbar) via custom event — avoids triggering
    // handleBlipClick's onBlipRead which would send a duplicate mark-read POST
    window.dispatchEvent(new CustomEvent('rizzoma:activate-blip', {
      detail: { blipId: nextUnreadId },
    }));

    // Mark as read
    if (unreadState?.markBlipRead) {
      await unreadState.markBlipRead(nextUnreadId);
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
      {/* User Avatar & Account Menu */}
      {user && (
        <div className="user-avatar-section" ref={userMenuRef}>
          <div
            className="user-avatar-small"
            title={user.email || user.name || 'User account'}
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            {user.avatar && !avatarFailed ? (
              <img
                src={user.avatar}
                alt={user.name || user.email}
                onError={(e) => {
                  setAvatarFailed(true);
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : null}
            <span className={`avatar-initials ${user.avatar && !avatarFailed ? 'hidden' : ''}`}>
              {getInitials(user.name, user.email)}
            </span>
          </div>

          {showUserMenu && (
            <div className="user-profile-menu">
              <div className="user-profile-info">
                <div className="user-profile-name">{user.name || 'User'}</div>
                <div className="user-profile-email">{user.email || ''}</div>
              </div>
              <div className="user-profile-divider" />
              <a href="/settings.html" className="user-profile-item">
                Settings
              </a>
              <button
                type="button"
                className="user-profile-item"
                onClick={async () => {
                  await api('/api/auth/logout', { method: 'POST' });
                  window.location.reload();
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      )}

      {/* Follow the Green - Next / Next Topic buttons */}
      {unreadCount === 0 && nextTopicAvailable ? (
        <button
          type="button"
          className="next-unread-blip next-topic-blip"
          onClick={onNextTopic}
          title="Jump to next topic with unread blips"
        >
          <span>Next</span>
          <img src="/s/img/next_unread_button_icon.png" alt="" />
        </button>
      ) : (
        <button
          type="button"
          className={`next-unread-blip ${unreadCount > 0 ? '' : 'disabled'}`}
          onClick={handleFollowGreen}
          disabled={unreadCount === 0 || navigating}
          title={unreadCount > 0 ? `${unreadCount} unread - click to navigate` : 'No unread blips'}
        >
          <span>Next</span>
          <img src="/s/img/next_unread_button_icon.png" alt="" />
        </button>
      )}

      {/* Fold/Unfold controls */}
      <div className="fold-controls">
        <button
          type="button"
          className="hide-replies fold-btn"
          onClick={handleHideReplies}
          title="Hide replies (Ctrl+Shift+Up)"
        />
        <button
          type="button"
          className="show-replies fold-btn"
          onClick={handleShowReplies}
          title="Show replies (Ctrl+Shift+Down)"
        />
      </div>

      {/* View mode toggle */}
      <div className="view-toggle">
        <button
          type="button"
          className={`text-view view-btn ${viewMode === 'text' ? 'active' : ''}`}
          onClick={() => setViewMode('text')}
          title="Text view"
        >
          <span className="view-icon" />
          <span className="view-label">Text view</span>
        </button>
        <button
          type="button"
          className={`mindmap-view view-btn ${viewMode === 'mindmap' ? 'active' : ''}`}
          onClick={() => setViewMode('mindmap')}
          title="Mind map"
        >
          <span className="view-icon" />
          <span className="view-label">Mind map</span>
        </button>
      </div>

      {/* Display mode toggle (short/expanded view) - only visible in mindmap view */}
      {viewMode === 'mindmap' && (
        <div className="mindmap-view-switch-buttons">
          <button
            type="button"
            className={`mindmap-short-view ${displayMode === 'short' ? 'active' : ''}`}
            onClick={() => setDisplayMode('short')}
            title="Short view"
          >
            short
          </button>
          <button
            type="button"
            className={`mindmap-long-view ${displayMode === 'expanded' ? 'active' : ''}`}
            onClick={() => setDisplayMode('expanded')}
            title="Expanded view"
          >
            expanded
          </button>
        </div>
      )}

      {/* Active blip controls - visible when editing or when an editable blip is active */}
      {(isEditMode || isBlipActiveEditable) && (
        <div className="active-blip-controls">
          <button
            type="button"
            className="active-blip-control insert-reply"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertReply}
            title="Insert reply (Ctrl+Enter)"
          />
          <button
            type="button"
            className="active-blip-control insert-mention"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertMention}
            title="Insert mention (@)"
          />
          <button
            type="button"
            className="active-blip-control insert-task"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertTask}
            title="Insert task (~)"
          />
          <button
            type="button"
            className="active-blip-control insert-tag"
            onMouseDown={e => e.preventDefault()}
            onClick={handleInsertTag}
            title="Insert tag (#)"
          />
          <div className="insert-gadget-container">
            <button
              type="button"
              className="active-blip-control insert-gadget"
              onMouseDown={e => e.preventDefault()}
              onClick={handleInsertGadget}
              title="Insert gadget"
            >
              <div className="gadget-logo" />
              <span>Gadgets</span>
            </button>
            {showGadgetPalette && (
              <GadgetPalette
                onSelect={handleGadgetSelect}
                onClose={() => setShowGadgetPalette(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
