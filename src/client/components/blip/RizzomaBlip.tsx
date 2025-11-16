import React, { useState, useRef, useEffect } from 'react';
import { BlipEditor } from '../editor/BlipEditor';
import { BlipMenu } from './BlipMenu';
import { api } from '../../lib/api';
import { useEditor, EditorContent } from '@tiptap/react';
import { getEditorExtensions, defaultEditorProps } from '../editor/EditorConfig';
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
  const [isActive, setIsActive] = useState(false);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isExpanded, setIsExpanded] = useState(!blip.isCollapsed);
  const [editedContent, setEditedContent] = useState(blip.content);
  const [showInlineCommentBtn, setShowInlineCommentBtn] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionCoords, setSelectionCoords] = useState({ x: 0, y: 0 });
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const blipContainerRef = useRef<HTMLDivElement>(null);

  // Create inline editor for editing mode
  const inlineEditor = useEditor({
    extensions: getEditorExtensions(),
    content: editedContent,
    editable: isEditing,
    editorProps: defaultEditorProps,
    onUpdate: ({ editor }) => {
      setEditedContent(editor.getHTML());
    },
  });

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
      setIsActive(true);
      // Update inline editor content and make it editable
      if (inlineEditor) {
        inlineEditor.commands.setContent(blip.content);
        inlineEditor.setEditable(true);
      }
    }
  };

  const handleSaveEdit = async () => {
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
      // TODO: Show error toast
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

  const handleContentUpdate = (newContent: string) => {
    setEditedContent(newContent);
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
      
      const data = await response.json();
      
      // Create a new blip data structure for the reply
      const newReply: BlipData = {
        id: data.id,
        content: replyContent,
        authorId: 'demo-user', // TODO: Get from auth context
        authorName: 'Demo User',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isRead: true,
        permissions: data.blip.permissions,
        parentBlipId: blip.id
      };
      
      onAddReply?.(blip.id, replyContent);
      setReplyContent('');
      setShowReplyForm(false);
      setIsExpanded(true);
    } catch (error) {
      console.error('Error creating reply:', error);
      // TODO: Show error toast
    }
  };

  const handleCancelReply = () => {
    setReplyContent('');
    setShowReplyForm(false);
  };

  // Handle text selection for inline comments
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || isEditing) {
        setShowInlineCommentBtn(false);
        return;
      }

      const selectedText = selection.toString().trim();
      if (!selectedText || !contentRef.current) {
        setShowInlineCommentBtn(false);
        return;
      }

      // Check if selection is within this blip's content
      const range = selection.getRangeAt(0);
      if (!contentRef.current.contains(range.commonAncestorContainer)) {
        setShowInlineCommentBtn(false);
        return;
      }

      // Get selection coordinates
      const rect = range.getBoundingClientRect();
      setSelectedText(selectedText);
      setSelectionCoords({
        x: rect.left + rect.width / 2,
        y: rect.top - 40
      });
      setShowInlineCommentBtn(true);
    };

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('selectionchange', handleSelection);

    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('selectionchange', handleSelection);
    };
  }, [isEditing]);

  // Handle click to make blip active (show menu)
  const handleBlipClick = () => {
    setIsActive(true);
  };

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

  const handleCreateInlineComment = async () => {
    if (!selectedText || !blip.permissions.canComment) return;
    
    try {
      // Extract waveId from the blip id (format: waveId:blipId)
      const waveId = blip.id.split(':')[0];
      const commentContent = `<blockquote>${selectedText}</blockquote><p></p>`;
      
      const response = await fetch('/api/blips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          waveId,
          parentId: blip.id,
          content: commentContent,
          isInlineComment: true // Flag for inline comments
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create inline comment');
      }
      
      const data = await response.json();
      
      // Show reply form with the quoted text
      setShowReplyForm(true);
      setReplyContent(`Re: "${selectedText}"\n\n`);
      setShowInlineCommentBtn(false);
      window.getSelection()?.removeAllRanges();
      setIsExpanded(true);
      
      // If we have a callback, notify parent
      onAddReply?.(blip.id, commentContent);
    } catch (error) {
      console.error('Error creating inline comment:', error);
      // Fallback to reply form
      setShowReplyForm(true);
      setReplyContent(`Re: "${selectedText}"\n\n`);
      setShowInlineCommentBtn(false);
      window.getSelection()?.removeAllRanges();
      setIsExpanded(true);
    }
  };

  return (
    <div 
      ref={blipContainerRef}
      className={`rizzoma-blip blip-container ${isRoot ? 'root-blip' : 'nested-blip'} ${!blip.isRead ? 'unread' : ''} ${isActive ? 'active' : ''}`}
      data-blip-id={blip.id}
      style={{ marginLeft: isRoot ? 0 : 20, position: 'relative' }}
      onClick={handleBlipClick}
    >
      {/* Inline Blip Menu */}
      <BlipMenu
        isActive={isActive}
        isEditing={isEditing}
        canEdit={blip.permissions.canEdit}
        canComment={blip.permissions.canComment}
        editor={inlineEditor || undefined}
        onStartEdit={handleStartEdit}
        onFinishEdit={handleSaveEdit}
        onCancel={handleCancelEdit}
      />
      {/* Blip Header */}
      {!isRoot && (
        <div className="blip-header" style={{ marginTop: isActive ? '30px' : '0' }}>
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
      <div 
        className={`blip-content ${isExpanded ? 'expanded' : 'collapsed'}`}
        style={{ marginTop: isActive && isRoot ? '30px' : '0' }}
      >
        {isEditing ? (
          <div className="blip-editor-container" ref={editorRef}>
            {inlineEditor && <EditorContent editor={inlineEditor} />}
          </div>
        ) : (
          <div className="blip-view-mode">
            <div 
              ref={contentRef}
              className="blip-text"
              dangerouslySetInnerHTML={{ __html: blip.content }}
            />
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
      
      {/* Inline Comment Button */}
      {showInlineCommentBtn && blip.permissions.canComment && !isEditing && (
        <button
          className="inline-comment-btn"
          style={{
            position: 'fixed',
            left: `${selectionCoords.x}px`,
            top: `${selectionCoords.y}px`,
            transform: 'translateX(-50%)'
          }}
          onClick={handleCreateInlineComment}
          title="Add inline comment"
        >
          💬 Comment
        </button>
      )}
    </div>
  );
}