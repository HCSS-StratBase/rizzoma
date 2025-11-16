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

  // Update text format state when editor selection changes
  useEffect(() => {
    if (!editor) return;

    const updateState = () => {
      setTextFormatState({
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike')
      });
    };

    editor.on('selectionUpdate', updateState);
    editor.on('transaction', updateState);

    return () => {
      editor.off('selectionUpdate', updateState);
      editor.off('transaction', updateState);
    };
  }, [editor]);

  if (!isActive) return null;

  const handleBold = () => editor?.chain().focus().toggleBold().run();
  const handleItalic = () => editor?.chain().focus().toggleItalic().run();
  const handleUnderline = () => editor?.chain().focus().toggleUnderline().run();
  const handleStrike = () => editor?.chain().focus().toggleStrike().run();
  const handleBulletList = () => editor?.chain().focus().toggleBulletList().run();
  const handleOrderedList = () => editor?.chain().focus().toggleOrderedList().run();
  const handleUndo = () => editor?.chain().focus().undo().run();
  const handleRedo = () => editor?.chain().focus().redo().run();
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
              onClick={handleUndo}
              disabled={!editor?.can().undo()}
              title="Undo (Ctrl+Z)"
            >
              ↶
            </button>
            <button 
              className="menu-btn"
              onClick={handleRedo}
              disabled={!editor?.can().redo()}
              title="Redo"
            >
              ↷
            </button>
          </div>

          <div className="menu-group">
            <button className="menu-btn" title="Insert link">🔗</button>
            <button className="menu-btn" title="Insert attachment">📎</button>
            <button className="menu-btn" title="Insert image">🖼️</button>
          </div>

          <div className="menu-group">
            <button 
              className={`menu-btn ${textFormatState.bold ? 'active' : ''}`}
              onClick={handleBold}
              title="Bold (Ctrl+B)"
            >
              <strong>B</strong>
            </button>
            <button 
              className={`menu-btn ${textFormatState.italic ? 'active' : ''}`}
              onClick={handleItalic}
              title="Italic (Ctrl+I)"
            >
              <em>I</em>
            </button>
            <button 
              className={`menu-btn ${textFormatState.underline ? 'active' : ''}`}
              onClick={handleUnderline}
              title="Underline (Ctrl+U)"
            >
              <span style={{ textDecoration: 'underline' }}>U</span>
            </button>
            <button 
              className={`menu-btn ${textFormatState.strike ? 'active' : ''}`}
              onClick={handleStrike}
              title="Strikethrough"
            >
              <span style={{ textDecoration: 'line-through' }}>S</span>
            </button>
          </div>

          <div className="menu-group">
            <button className="menu-btn" title="Text background color">🎨</button>
            <button 
              className="menu-btn"
              onClick={handleClearFormat}
              title="Clear formatting"
            >
              ❌
            </button>
          </div>

          <div className="menu-group">
            <button 
              className="menu-btn"
              onClick={handleBulletList}
              title="Bulleted list"
            >
              •
            </button>
            <button 
              className="menu-btn"
              onClick={handleOrderedList}
              title="Numbered list"
            >
              1.
            </button>
          </div>

          <div className="menu-group">
            <button className="menu-btn" title="Other">⋯</button>
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