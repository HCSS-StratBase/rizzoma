import { useState } from 'react';
import { FollowTheGreen } from './FollowTheGreen';
import { UserPresence } from './UserPresence';
import './RightToolsPanel.css';

interface RightToolsPanelProps {
  isAuthed: boolean;
  selectedTopicId: string | null;
}

export function RightToolsPanel({ isAuthed, selectedTopicId }: RightToolsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'mindmap'>('text');
  const [repliesVisible, setRepliesVisible] = useState(true);

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
            <FollowTheGreen />
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