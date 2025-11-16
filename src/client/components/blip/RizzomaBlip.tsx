import React, { useState, useRef, useEffect } from 'react';
import { BlipEditor } from '../editor/BlipEditor';
import { api } from '../../lib/api';
import './RizzomaBlip.css';

export interface BlipData {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: number;
  updatedAt: number;
  isRead: boolean;
  childBlips?: BlipData[];
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canRead: boolean;
  };
  isCollapsed?: boolean;
  parentBlipId?: string;
}

interface RizzomaBlipProps {
  blip: BlipData;
  isRoot?: boolean;
  depth?: number;
  onBlipUpdate?: (blipId: string, content: string) => void;
  onAddReply?: (parentBlipId: string, content: string) => void;
  onToggleCollapse?: (blipId: string) => void;
}

export function RizzomaBlip({
  blip,
  isRoot = false,
  depth = 0,
  onBlipUpdate,
  onAddReply,
  onToggleCollapse
}: RizzomaBlipProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(!blip.isCollapsed);
  const [editedContent, setEditedContent] = useState(blip.content);
  const editorRef = useRef<HTMLDivElement>(null);

  const hasUnreadChildren = blip.childBlips?.some(child => !child.isRead) ?? false;
  const childCount = blip.childBlips?.length ?? 0;

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
    onToggleCollapse?.(blip.id);
  };

  const handleStartEdit = () => {
    console.log('handleStartEdit called for blip:', blip.id, 'canEdit:', blip.permissions.canEdit);
    if (blip.permissions.canEdit) {
      setEditedContent(blip.content);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    onBlipUpdate?.(blip.id, editedContent);
    setIsEditing(false);
  };

  const handleContentUpdate = (newContent: string) => {
    setEditedContent(newContent);
  };

  const handleAddReply = () => {
    if (replyContent.trim()) {
      onAddReply?.(blip.id, replyContent);
      setReplyContent('');
      setShowReplyForm(false);
      setIsExpanded(true);
    }
  };

  const handleCancelReply = () => {
    setReplyContent('');
    setShowReplyForm(false);
  };

  return (
    <div 
      className={`rizzoma-blip ${isRoot ? 'root-blip' : 'nested-blip'} ${!blip.isRead ? 'unread' : ''}`}
      data-blip-id={blip.id}
      style={{ marginLeft: isRoot ? 0 : 20 }}
    >
      {/* Blip Header */}
      {!isRoot && (
        <div className="blip-header">
          <div className="blip-collapse-control" onClick={handleToggleExpand}>
            {childCount > 0 && (
              <span className="collapse-icon">{isExpanded ? '−' : '+'}</span>
            )}
            {hasUnreadChildren && !isExpanded && (
              <span className="unread-indicator">●</span>
            )}
          </div>
          
          <div className="blip-author">
            {blip.authorAvatar && (
              <img src={blip.authorAvatar} alt={blip.authorName} className="author-avatar" />
            )}
            <span className="author-name">{blip.authorName}</span>
            <span className="blip-time">
              {new Date(blip.createdAt).toLocaleString()}
            </span>
          </div>

          {!blip.isRead && (
            <div className="blip-unread-marker" title="New message" />
          )}
        </div>
      )}

      {/* Blip Content */}
      <div className={`blip-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
        {isEditing ? (
          <div className="blip-editor-container" ref={editorRef}>
            <BlipEditor
              content={blip.content}
              blipId={blip.id}
              isReadOnly={false}
              onUpdate={handleContentUpdate}
              enableCollaboration={true}
              showToolbar={true}
            />
            <div className="blip-editor-actions">
              <button 
                className="btn-save"
                onClick={handleSaveEdit}
              >
                Done
              </button>
              <button 
                className="btn-cancel"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="blip-view-mode">
            <div 
              className="blip-text"
              dangerouslySetInnerHTML={{ __html: blip.content }}
            />
            {blip.permissions.canEdit && (
              <div className="blip-toolbar-simple">
                <button 
                  className="btn-edit"
                  onClick={handleStartEdit}
                >
                  Edit
                </button>
              </div>
            )}
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
            <BlipEditor
              content=""
              blipId={`reply-${blip.id}-${Date.now()}`}
              isReadOnly={false}
              onUpdate={setReplyContent}
              enableCollaboration={false}
              showToolbar={true}
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
        {isExpanded && blip.childBlips && blip.childBlips.length > 0 && (
          <div className="child-blips">
            {blip.childBlips.map(childBlip => (
              <RizzomaBlip
                key={childBlip.id}
                blip={childBlip}
                isRoot={false}
                depth={depth + 1}
                onBlipUpdate={onBlipUpdate}
                onAddReply={onAddReply}
                onToggleCollapse={onToggleCollapse}
              />
            ))}
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
    </div>
  );
}