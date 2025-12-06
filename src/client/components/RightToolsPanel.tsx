import { useState } from 'react';
import { FollowTheGreen } from './FollowTheGreen';
import { UserPresence } from './UserPresence';
import './RightToolsPanel.css';
import type { WaveUnreadState } from '../hooks/useWaveUnread';
import { toast } from './Toast';

interface RightToolsPanelProps {
  isAuthed: boolean;
  unreadState?: WaveUnreadState | null;
}

export function RightToolsPanel({ isAuthed, unreadState }: RightToolsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'mindmap'>('text');
  const [repliesVisible, setRepliesVisible] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [navigateStatus, setNavigateStatus] = useState<{ message: string; tone: 'info' | 'error' } | null>(null);

  const unreadCount = unreadState?.unreadIds.length ?? 0;

  const handleFollowGreen = async () => {
    if (navigating) return;
    setNavigateStatus(null);
    setNavigating(true);
    const nextUnreadId = unreadState?.unreadIds[0] ?? null;
    const ensureElement = (blipId: string): HTMLElement | null => {
      const escape = (val: string) => {
        if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(val);
        return val.replace(/["\\]/g, '\\$&');
      };
      const selector = `[data-blip-id="${escape(blipId)}"]`;
      return document.querySelector(selector) as HTMLElement | null;
    };
    let target: HTMLElement | null = nextUnreadId ? ensureElement(nextUnreadId) : null;
    if (!target) {
      const fallback = document.querySelector('.rizzoma-blip.unread');
      target = fallback as HTMLElement | null;
    }
    if (!target) {
      const message = 'No unread blips to follow';
      setNavigateStatus({ message, tone: 'info' });
      toast(message, 'info');
      setNavigating(false);
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const blipId = target.getAttribute('data-blip-id');
    if (blipId) {
      try {
        await unreadState?.markBlipRead(blipId);
      } catch {
        const message = 'Follow-the-Green failed, please refresh the wave';
        setNavigateStatus({ message, tone: 'error' });
        toast(message, 'error');
      }
    }
    setNavigating(false);
  };

  return (
    <div className={`right-tools-panel ${collapsed ? 'collapsed' : ''} ${!isAuthed ? 'anonymous' : ''}`}>
      <div className="tools-header">
        <UserPresence />
        <button 
          className="collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? '◀' : '▶'}
        </button>
      </div>
      
      {!collapsed && (
        <>
          {/* Follow the Green Navigation */}
          <div className="tools-section">
            <FollowTheGreen 
              unreadCount={unreadCount}
              onNavigate={handleFollowGreen}
              disabled={collapsed || unreadCount === 0 || navigating}
              busy={navigating}
              statusMessage={navigateStatus?.message ?? null}
              statusTone={navigateStatus?.tone ?? 'info'}
            />
          </div>
          
          {/* View Controls */}
          <div className="tools-section view-controls">
            <button 
              className="tool-btn"
              onClick={() => setRepliesVisible(false)}
              disabled={!repliesVisible}
            >
              Hide replies ↑
            </button>
            <button 
              className="tool-btn"
              onClick={() => setRepliesVisible(true)}
              disabled={repliesVisible}
            >
              Show replies ↓
            </button>
            <div className="view-mode-toggle">
              <button 
                className={`mode-btn ${viewMode === 'text' ? 'active' : ''}`}
                onClick={() => setViewMode('text')}
              >
                Text view
              </button>
              <button 
                className={`mode-btn ${viewMode === 'mindmap' ? 'active' : ''}`}
                onClick={() => setViewMode('mindmap')}
              >
                Mind map
              </button>
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="tools-section quick-actions">
            <button className="action-btn" title="Insert reply (Ctrl+Enter)">
              <span className="icon">↩</span>
              <span>Reply</span>
            </button>
            <button className="action-btn" title="Insert mention (@)">
              <span className="icon">@</span>
              <span>Mention</span>
            </button>
            <button className="action-btn" title="Insert task (~)">
              <span className="icon">~</span>
              <span>Task</span>
            </button>
            <button className="action-btn" title="Insert tag (#)">
              <span className="icon">#</span>
              <span>Tag</span>
            </button>
            <button className="action-btn" title="Insert gadget">
              <span className="icon">⚙</span>
              <span>Gadgets</span>
            </button>
          </div>
          
          
          {/* Additional Actions */}
          <div className="tools-section additional-actions">
            <button className="tool-btn">Edit</button>
            <button className="tool-btn">Get direct link</button>
            <button className="tool-btn">Other ▼</button>
          </div>
        </>
      )}
    </div>
  );
}
