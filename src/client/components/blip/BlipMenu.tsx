import { useState, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { DEFAULT_BG_COLORS } from '@shared/constants/textFormatting';
import { useMobileContextSafe } from '../../contexts/MobileContext';
import { BottomSheetMenu, createBlipMenuItems } from '../mobile/BottomSheetMenu';
import './BlipMenu.css';

interface BlipMenuProps {
  isActive: boolean;
  isEditing: boolean;
  canEdit: boolean;
  canComment: boolean;
  editor?: Editor;
  isExpanded?: boolean;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onCollapse?: () => void;
  onExpand?: () => void;
  onToggleComments?: () => void;
  onShowComments?: () => void;
  onHideComments?: () => void;
  onDelete?: () => void;
  onGetLink?: () => void;
  areCommentsVisible?: boolean;
  collapseByDefault?: boolean;
  onToggleCollapseByDefault?: () => void;
  onCopyComment?: () => void;
  onPasteAsReply?: () => void;
  onPasteAtCursor?: () => void;
  clipboardAvailable?: boolean;
  onShowHistory?: () => void;
  onInsertAttachment?: () => void;
  onInsertImage?: () => void;
  isUploading?: boolean;
  uploadProgress?: number | null;
  onSend?: () => void;
  isSending?: boolean;
  isDeleting?: boolean;
  inlineCommentsNotice?: string | null;
  // New copy/paste variants
  onDuplicate?: () => void;
  onCut?: () => void;
  onPasteAsNew?: () => void;
  isCut?: boolean;
  isDuplicating?: boolean;
  isInlineChild?: boolean;
}

export function BlipMenu({
  isActive,
  isEditing,
  canEdit,
  canComment,
  editor,
  isExpanded: _isExpanded = false,
  onStartEdit,
  onFinishEdit,
  onCollapse,
  onExpand,
  onToggleComments,
  onShowComments,
  onHideComments,
  onDelete,
  onGetLink,
  areCommentsVisible = true,
  collapseByDefault = false,
  onToggleCollapseByDefault,
  onCopyComment,
  onPasteAsReply,
  onPasteAtCursor,
  clipboardAvailable = false,
  onShowHistory,
  onSend,
  isSending = false,
  isDeleting = false,
  onInsertAttachment,
  onInsertImage,
  isUploading = false,
  uploadProgress = null,
  inlineCommentsNotice = null,
  onDuplicate,
  onCut,
  onPasteAsNew,
  isCut = false,
  isDuplicating = false,
  isInlineChild = false,
}: BlipMenuProps) {
  const [textFormatState, setTextFormatState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false
  });
  const [showBgPalette, setShowBgPalette] = useState(false);
  const [showOverflow, setShowOverflow] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  // Mobile detection
  const mobileContext = useMobileContextSafe();
  const isMobile = mobileContext?.shouldUseMobileUI ?? false;

  // Track active marks to reflect current selection
  useEffect(() => {
    if (!editor) return;

    const updateState = () => {
      try {
        setTextFormatState({
          bold: editor.isActive('bold'),
          italic: editor.isActive('italic'),
          underline: editor.isActive('underline'),
          strike: editor.isActive('strike'),
        });
      } catch {
        // ignore transient errors from TipTap during transactions
      }
    };

    editor.on('selectionUpdate', updateState);
    editor.on('transaction', updateState);

    return () => {
      editor.off('selectionUpdate', updateState);
      editor.off('transaction', updateState);
    };
  }, [editor]);

  useEffect(() => {
    if (!isEditing || !isActive) {
      setShowBgPalette(false);
    }
    setShowOverflow(false);
    setShowMobileMenu(false);
  }, [isEditing, isActive]);

  useEffect(() => {
    if (!showOverflow) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (overflowRef.current?.contains(event.target as Node)) return;
      setShowOverflow(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOverflow]);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current?.contains(event.target as Node)) return;
      setShowEmojiPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

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
  const handleInsertLink = () => {
    if (!editor) return;
    const href = window.prompt('Enter a URL');
    if (!href || !editor) return;
    try {
      editor.chain().focus().setLink({ href, target: '_blank' }).run();
    } catch (error) {
      console.error('Failed to insert link', error);
    }
  };
  const handleInsertEmoji = () => {
    if (!editor) return;
    setShowEmojiPicker(!showEmojiPicker);
  };

  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    if (!editor) return;
    try {
      editor.chain().focus().insertContent(emojiData.emoji).run();
      setShowEmojiPicker(false);
    } catch (error) {
      console.error('Failed to insert emoji', error);
    }
  };
  const handleHighlight = (color: string) => {
    const chain = editor?.chain?.().focus?.();
    const command = (chain as any)?.setHighlight ? chain.setHighlight({ color }) : null;
    if (command && typeof command.run === 'function') {
      command.run();
    }
    setShowBgPalette(false);
  };
  const commentsReadOnlyMessage = 'Inline comments are read-only for this blip.';
  const inlineCommentsBannerMessage = inlineCommentsNotice ?? (!canComment ? commentsReadOnlyMessage : null);
  const commentsBanner = inlineCommentsBannerMessage ? (
    <div
      className="blip-menu-banner"
      role="status"
      data-testid="blip-menu-comments-disabled"
    >
      {inlineCommentsBannerMessage}
    </div>
  ) : null;

  // Mobile menu items
  const mobileMenuItems = createBlipMenuItems({
    canEdit,
    canComment,
    isEditing,
    areCommentsVisible,
    collapseByDefault,
    clipboardAvailable,
    isUploading,
    isSending,
    isDeleting,
    onStartEdit,
    onFinishEdit,
    onToggleComments,
    onDelete,
    onGetLink,
    onToggleCollapseByDefault,
    onCopyComment,
    onPasteAsReply,
    onPasteAtCursor,
    onShowHistory,
    onInsertAttachment,
    onInsertImage,
    onSend,
  });

  // Mobile menu component
  const mobileMenu = (
    <BottomSheetMenu
      isOpen={showMobileMenu}
      onClose={() => setShowMobileMenu(false)}
      items={mobileMenuItems}
      title={isEditing ? 'Edit Options' : 'Blip Options'}
      data-testid="blip-mobile-menu"
    />
  );

  const renderOverflowItems = (mode: 'edit' | 'read') => (
    <div className="menu-dropdown-panel" role="menu">
      {mode === 'edit' && (
        <button
          type="button"
          role="menuitem"
          className="menu-dropdown-item"
          disabled={!onSend || isSending}
          onClick={() => {
            onSend?.();
            setShowOverflow(false);
          }}
        >
          {isSending ? 'Sending…' : 'Send'}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="menu-dropdown-item"
        disabled={!onCopyComment}
        onClick={() => {
          onCopyComment?.();
          setShowOverflow(false);
        }}
      >
        Copy comment
      </button>
      {canEdit && onDuplicate && (
        <button
          type="button"
          role="menuitem"
          className="menu-dropdown-item"
          disabled={isDuplicating}
          onClick={() => {
            onDuplicate?.();
            setShowOverflow(false);
          }}
        >
          {isDuplicating ? 'Duplicating…' : 'Duplicate blip'}
        </button>
      )}
      {canEdit && onCut && (
        <button
          type="button"
          role="menuitem"
          className={`menu-dropdown-item ${isCut ? 'active' : ''}`}
          onClick={() => {
            onCut?.();
            setShowOverflow(false);
          }}
        >
          {isCut ? '✓ Cut (ready to paste)' : 'Cut blip'}
        </button>
      )}
      {canComment && onPasteAsNew && clipboardAvailable && (
        <button
          type="button"
          role="menuitem"
          className="menu-dropdown-item"
          onClick={() => {
            onPasteAsNew?.();
            setShowOverflow(false);
          }}
        >
          Paste as new blip
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="menu-dropdown-item"
        disabled={!onShowHistory}
        onClick={() => {
          onShowHistory?.();
          setShowOverflow(false);
        }}
      >
        Playback history
      </button>
      {mode === 'edit' && (
        <button
          type="button"
          role="menuitem"
          className="menu-dropdown-item"
          disabled={!onPasteAtCursor || !clipboardAvailable}
          onClick={() => {
            onPasteAtCursor?.();
            setShowOverflow(false);
          }}
        >
          Paste at cursor
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="menu-dropdown-item"
        disabled={!canComment || !onPasteAsReply || !clipboardAvailable}
        title={!canComment ? commentsReadOnlyMessage : undefined}
        onClick={() => {
          if (!canComment) return;
          onPasteAsReply?.();
          setShowOverflow(false);
        }}
      >
        Paste as reply
      </button>
      <button
        type="button"
        role="menuitem"
        className="menu-dropdown-item"
        disabled={!onGetLink}
        onClick={() => {
          onGetLink?.();
          setShowOverflow(false);
        }}
      >
        Copy direct link
      </button>
      {canEdit && onToggleCollapseByDefault && (
        <button
          type="button"
          role="menuitem"
          className="menu-dropdown-item"
          title={collapseByDefault ? 'Expand this thread by default' : 'Collapse this thread by default'}
          aria-pressed={collapseByDefault ? 'true' : 'false'}
          data-testid="blip-menu-collapse-default"
          onClick={() => {
            onToggleCollapseByDefault?.();
            setShowOverflow(false);
          }}
        >
          {collapseByDefault ? 'Show by default' : 'Hide by default'}
        </button>
      )}
      {canEdit && onDelete && (
        <button
          type="button"
          role="menuitem"
          className="menu-dropdown-item"
          disabled={isDeleting}
          data-testid="blip-menu-delete"
          onClick={() => {
            onDelete?.();
            setShowOverflow(false);
          }}
        >
          {isDeleting ? 'Deleting…' : 'Delete blip'}
        </button>
      )}
    </div>
  );

  if (isEditing) {
    return (
      <div className="blip-menu-container">
        <div className={`blip-menu edit-menu${isInlineChild ? ' inline-child-menu' : ''}`} data-testid="blip-menu-edit-surface">
          <div className="menu-group">
            <button
          className="menu-btn done-btn"
          onClick={onFinishEdit}
          title="Finish editing"
          disabled={isSending}
          data-testid="blip-menu-done"
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
              data-testid="blip-menu-undo"
            >
              ↶
            </button>
            <button 
              className="menu-btn"
              onClick={handleRedo}
              disabled={!editor?.can().redo()}
              title="Redo"
              data-testid="blip-menu-redo"
            >
              ↷
            </button>
          </div>

          <div className="menu-group">
            <button
              className="menu-btn"
              title="Insert link"
              onClick={handleInsertLink}
              disabled={!editor}
              data-testid="blip-menu-insert-link"
            >
              🔗
            </button>
            <div className="emoji-picker-container" ref={emojiPickerRef}>
              <button
                className={`menu-btn ${showEmojiPicker ? 'active' : ''}`}
                title="Insert emoji"
                onClick={handleInsertEmoji}
                disabled={!editor}
                data-testid="blip-menu-emoji"
              >
                😀
              </button>
              {showEmojiPicker && (
                <div className="emoji-picker-dropdown">
                  <EmojiPicker
                    onEmojiClick={handleEmojiSelect}
                    theme={Theme.LIGHT}
                    searchPlaceholder="Search emojis..."
                    width={350}
                    height={400}
                  />
                </div>
              )}
            </div>
            <button
              className="menu-btn"
              title={isUploading ? 'Uploading attachment…' : 'Insert attachment'}
              onClick={onInsertAttachment}
              disabled={!onInsertAttachment || isUploading}
              data-testid="blip-menu-insert-attachment"
            >
              📎
            </button>
            <button
              className="menu-btn"
              title={isUploading ? 'Uploading image…' : 'Insert image'}
              onClick={onInsertImage}
              disabled={!onInsertImage || isUploading}
              data-testid="blip-menu-insert-image"
            >
              🖼️
            </button>
            {isUploading && (
              <span className="menu-upload-progress" aria-live="polite">
                {uploadProgress !== null ? `${uploadProgress}%` : 'Uploading…'}
              </span>
            )}
          </div>

          <div className="menu-group">
            <button 
              className={`menu-btn ${textFormatState.bold ? 'active' : ''}`}
              onClick={handleBold}
              title="Bold (Ctrl+B)"
              data-testid="blip-menu-bold"
            >
              <strong>B</strong>
            </button>
            <button 
              className={`menu-btn ${textFormatState.italic ? 'active' : ''}`}
              onClick={handleItalic}
              title="Italic (Ctrl+I)"
              data-testid="blip-menu-italic"
            >
              <em>I</em>
            </button>
            <button 
              className={`menu-btn ${textFormatState.underline ? 'active' : ''}`}
              onClick={handleUnderline}
              title="Underline (Ctrl+U)"
              data-testid="blip-menu-underline"
            >
              <span style={{ textDecoration: 'underline' }}>U</span>
            </button>
            <button 
              className={`menu-btn ${textFormatState.strike ? 'active' : ''}`}
              onClick={handleStrike}
              title="Strikethrough"
              data-testid="blip-menu-strike"
            >
              <span style={{ textDecoration: 'line-through' }}>S</span>
            </button>
          </div>

          <div className="menu-group">
            <div className="menu-dropdown color-dropdown">
              <button
                className={`menu-btn ${showBgPalette ? 'active' : ''}`}
                onClick={() => setShowBgPalette((open) => !open)}
                title="Text background color"
                aria-expanded={showBgPalette}
                data-testid="blip-menu-highlight-toggle"
              >
                🎨
              </button>
              {showBgPalette && (
                <div className="blip-menu-color-palette">
                  {DEFAULT_BG_COLORS.map((color) => (
                    <button
                      key={color}
                      className="blip-menu-color-swatch"
                      style={{ backgroundColor: color }}
                      onClick={() => handleHighlight(color)}
                      title={color === '#ffffff' ? 'Clear highlight' : color}
                      type="button"
                    />
                  ))}
                </div>
              )}
            </div>
            <button 
              className="menu-btn"
              onClick={handleClearFormat}
              title="Clear formatting"
              data-testid="blip-menu-clear-formatting"
            >
              ❌
            </button>
          </div>

          <div className="menu-group">
            <button 
              className="menu-btn"
              onClick={handleBulletList}
              title="Bulleted list"
              data-testid="blip-menu-bullet-list"
            >
              •
            </button>
            <button 
              className="menu-btn"
              onClick={handleOrderedList}
              title="Numbered list"
              data-testid="blip-menu-ordered-list"
            >
              1.
            </button>
          </div>

          <div className="menu-group">
            <div className="menu-dropdown" ref={overflowRef}>
              <button
                className={`menu-btn gear-btn ${showOverflow ? 'active' : ''}`}
                title="Other actions"
                type="button"
                aria-expanded={showOverflow}
                data-testid="blip-menu-overflow-toggle"
                onClick={() => setShowOverflow((open) => !open)}
              >
                ⚙️
              </button>
              {showOverflow && renderOverflowItems('edit')}
            </div>
          </div>

          {/* Hide and Delete are in the overflow/gear menu to reduce clutter */}
          {/* Mobile menu trigger */}
          {isMobile && (
            <div className="menu-group">
              <button
                className="menu-btn mobile-menu-btn"
                onClick={() => setShowMobileMenu(true)}
                title="More options"
                type="button"
                data-testid="blip-menu-mobile-trigger"
              >
                ≡
              </button>
            </div>
          )}
        </div>
        {commentsBanner}
        {mobileMenu}
      </div>
    );
  }

  // Read-only menu - Original Rizzoma style: Edit | hide/show comments | link | Hide | Delete | gear
  return (
    <div className="blip-menu-container">
      <div className={`blip-menu read-only-menu${isInlineChild ? ' inline-child-menu' : ''}`} data-testid="blip-menu-read-surface">
        {canEdit && (
          <div className="menu-group">
            <button
              className="menu-btn edit-btn"
              onClick={onStartEdit}
              title="Edit"
              data-testid="blip-menu-edit"
            >
              Edit
            </button>
          </div>
        )}

        <div className="menu-group">
          <button
            className="menu-btn"
            onClick={onCollapse}
            title={isInlineChild ? 'Hide (collapse back to [+])' : 'Collapse'}
            disabled={!onCollapse}
            data-testid="blip-menu-collapse"
          >
            {isInlineChild ? 'Hide' : 'Collapse'}
          </button>
          {!isInlineChild && (
            <button
              className="menu-btn"
              onClick={onExpand}
              title="Expand"
              disabled={!onExpand}
              data-testid="blip-menu-expand"
            >
              Expand
            </button>
          )}
        </div>

        <div className="menu-group">
          <button
            className="menu-btn"
            onClick={onHideComments}
            title="Hide comments (Ctrl+Shift+Up)"
            disabled={!onHideComments || !areCommentsVisible}
            data-testid="blip-menu-comments-hide"
          >
            ⤵
          </button>
          <button
            className="menu-btn"
            onClick={onShowComments}
            title="Show comments (Ctrl+Shift+Down)"
            disabled={!onShowComments || areCommentsVisible}
            data-testid="blip-menu-comments-show"
          >
            ⤴
          </button>
        </div>

        <div className="menu-group">
          <button
            className="menu-btn"
            onClick={onGetLink}
            title="Get Direct Link"
            data-testid="blip-menu-get-link"
          >
            🔗
          </button>
        </div>

        {/* Hide and Delete are in the overflow/gear menu to reduce clutter */}
        <div className="menu-group" ref={overflowRef}>
          <button
            className={`menu-btn gear-btn ${showOverflow ? 'active' : ''}`}
            title="More options"
            type="button"
            aria-expanded={showOverflow}
            onClick={() => setShowOverflow((open) => !open)}
            data-testid="blip-menu-gear-toggle"
          >
            ⚙️
          </button>
          {showOverflow && renderOverflowItems('read')}
        </div>

        {/* Mobile menu trigger */}
        {isMobile && (
          <button
            className="menu-btn mobile-menu-btn"
            onClick={() => setShowMobileMenu(true)}
            title="All options"
            type="button"
            data-testid="blip-menu-mobile-trigger"
          >
            ≡
          </button>
        )}
      </div>
      {commentsBanner}
      {mobileMenu}
    </div>
  );
}
