import React, { useState, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import './BlipMenu.css';

interface BlipMenuProps {
  isActive: boolean;
  isEditing: boolean;
  canEdit: boolean;
  canComment: boolean;
  editor?: Editor;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onCancel: () => void;
  onToggleComments?: () => void;
  onDelete?: () => void;
  onGetLink?: () => void;
}

export function BlipMenu({
  isActive,
  isEditing,
  canEdit,
  canComment,
  editor,
  onStartEdit,
  onFinishEdit,
  onCancel,
  onToggleComments,
  onDelete,
  onGetLink
}: BlipMenuProps) {
  const [textFormatState, setTextFormatState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false
  });

  // Note: Editor state tracking disabled to avoid undo/redo errors

  if (!isActive) return null;

  const handleBold = () => editor?.chain().focus().toggleBold().run();
  const handleItalic = () => editor?.chain().focus().toggleItalic().run();
  const handleUnderline = () => editor?.chain().focus().toggleUnderline().run();
  const handleStrike = () => editor?.chain().focus().toggleStrike().run();
  const handleBulletList = () => editor?.chain().focus().toggleBulletList().run();
  const handleOrderedList = () => editor?.chain().focus().toggleOrderedList().run();
  const handleClearFormat = () => editor?.chain().focus().clearNodes().unsetAllMarks().run();

  if (isEditing) {
    return (
      <div className="blip-menu-container">
        <div className="blip-menu edit-menu">
          <div className="menu-group">
            <button 
              className="menu-btn done-btn"
              onClick={onFinishEdit}
              title="Finish editing"
            >
              Done
            </button>
          </div>
          
          <div className="menu-group">
            <button 
              className="menu-btn"
              onClick={handleBold}
              title="Bold"
            >
              <strong>B</strong>
            </button>
            <button 
              className="menu-btn"
              onClick={handleItalic}
              title="Italic"
            >
              <em>I</em>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Read-only menu
  return (
    <div className="blip-menu-container">
      <div className="blip-menu read-only-menu">
        {canEdit && (
          <button 
            className="menu-btn edit-btn"
            onClick={onStartEdit}
            title="Edit"
          >
            Edit
          </button>
        )}
        
        {canComment && (
          <button 
            className="menu-btn"
            onClick={onToggleComments}
            title="Hide/Show Comments"
          >
            💬
          </button>
        )}
        
        <button 
          className="menu-btn"
          onClick={onGetLink}
          title="Get Direct Link"
        >
          🔗
        </button>
        
        {canEdit && onDelete && (
          <button 
            className="menu-btn delete-btn"
            onClick={onDelete}
            title="Delete Comment"
          >
            🗑️
          </button>
        )}
        
        <div className="menu-dropdown">
          <button className="menu-btn gear-btn" title="More options">⚙️</button>
        </div>
      </div>
    </div>
  );
}