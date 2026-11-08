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
  onCreateInlineChild?: () => void;
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
  onDuplicate?: () => void;
  onCut?: () => void;
  onPasteAsNew?: () => void;
  isCut?: boolean;
  isDuplicating?: boolean;
  isInlineChild?: boolean;
  isTopicRoot?: boolean;
  topicActions?: {
    isFollowing?: boolean;
    onToggleFollow?: () => void;
    onMarkAsRead?: () => void;
    onPrint?: () => void;
    onExport?: () => void;
    onCopyEmbedCode?: () => void;
  };
  metaInfo?: React.ReactNode;
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
  onCollapse: _onCollapse,
  onExpand: _onExpand,
  onToggleComments: _onToggleComments,
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
  onCreateInlineChild,
  clipboardAvailable = false,
  onShowHistory,
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
  isDuplicating: _isDuplicating = false,
  isInlineChild = false,
  isTopicRoot = false,
  topicActions,
  metaInfo,
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

  const mobileContext = useMobileContextSafe();
  const isMobile = mobileContext?.shouldUseMobileUI ?? false;

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
        // ignore transient errors from TipTap
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

  const commentsReadOnlyMessage = 'Selection annotations are read-only for this blip.';
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
    onToggleComments: _onToggleComments,
    onDelete,
    onGetLink,
    onToggleCollapseByDefault,
    onCopyComment,
    onPasteAsReply,
    onPasteAtCursor,
    onCreateInlineChild,
    onShowHistory,
    onInsertAttachment,
    onInsertImage,
  });

  const mobileMenu = (
    <BottomSheetMenu
      isOpen={showMobileMenu}
      onClose={() => setShowMobileMenu(false)}
      items={mobileMenuItems}
      title={isEditing ? 'Editing Blip' : 'Blip Options'}
    />
  );

  const renderOtherDropdown = (mode: 'read' | 'edit') => (
    <div
      className="other-blipmenu-container other-blip-menu gear-dropdown gear-menu"
      role="menu"
      data-testid="blip-menu-overflow-menu"
    >
      <div className="triangle">
        <div />
      </div>
      {isTopicRoot && topicActions && (
        <>
          {topicActions.onMarkAsRead && (
            <div className="list-menu-button">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  topicActions.onMarkAsRead?.();
                  setShowOverflow(false);
                }}
              >
                Mark topic as read
              </button>
            </div>
          )}
          {topicActions.onToggleFollow && (
            <div className="list-menu-button">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  topicActions.onToggleFollow?.();
                  setShowOverflow(false);
                }}
              >
                {topicActions.isFollowing ? 'Unfollow topic' : 'Follow topic'}
              </button>
            </div>
          )}
          {topicActions.onPrint && (
            <div className="list-menu-button">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  topicActions.onPrint?.();
                  setShowOverflow(false);
                }}
              >
                Print
              </button>
            </div>
          )}
          {topicActions.onExport && (
            <div className="list-menu-button">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  topicActions.onExport?.();
                  setShowOverflow(false);
                }}
              >
                Export topic
              </button>
            </div>
          )}
          {topicActions.onCopyEmbedCode && (
            <div className="list-menu-button">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  topicActions.onCopyEmbedCode?.();
                  setShowOverflow(false);
                }}
              >
                Get embed code
              </button>
            </div>
          )}
        </>
      )}
      <div className="list-menu-button">
        <button
          type="button"
          role="menuitem"
          className="copy-blip-button js-copy-blip-button"
          onClick={() => {
            onCopyComment?.();
            setShowOverflow(false);
          }}
        >
          {isTopicRoot ? 'Copy topic content' : 'Copy comment'}
        </button>
      </div>
      {canComment && onPasteAsReply && (
        <div className="list-menu-button">
          <button
            type="button"
            role="menuitem"
            className="paste-as-reply js-paste-after-blip-button"
            disabled={!clipboardAvailable}
            title={!canComment ? commentsReadOnlyMessage : undefined}
            onClick={() => {
              if (!canComment) return;
              onPasteAsReply?.();
              setShowOverflow(false);
            }}
          >
            Paste as reply
          </button>
        </div>
      )}
      {mode === 'edit' && onPasteAtCursor && (
        <div className="list-menu-button">
          <button
            type="button"
            role="menuitem"
            className="paste-at-cursor js-paste-at-cursor-button"
            disabled={!clipboardAvailable}
            onClick={() => {
              onPasteAtCursor?.();
              setShowOverflow(false);
            }}
          >
            Paste at cursor
          </button>
        </div>
      )}
      {canComment && onPasteAsNew && clipboardAvailable && (
        <div className="list-menu-button">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onPasteAsNew?.();
              setShowOverflow(false);
            }}
          >
            Paste as new blip
          </button>
        </div>
      )}
      {canEdit && onDuplicate && (
        <div className="list-menu-button">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDuplicate?.();
              setShowOverflow(false);
            }}
          >
            Duplicate blip
          </button>
        </div>
      )}
      {canEdit && onCut && (
        <div className="list-menu-button">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCut?.();
              setShowOverflow(false);
            }}
          >
            {isCut ? '✓ Cut (ready to paste)' : 'Cut blip'}
          </button>
        </div>
      )}
      <div className="list-menu-button">
        <button
          type="button"
          role="menuitem"
          className="js-copy-blip-link"
          disabled={!onGetLink}
          onClick={() => {
            onGetLink?.();
            setShowOverflow(false);
          }}
        >
          Copy link
        </button>
      </div>
      <div className="list-menu-button">
        <button
          type="button"
          role="menuitem"
          className="js-playback-button" data-testid="blip-menu-playback"
          disabled={!onShowHistory}
          onClick={() => {
            onShowHistory?.();
            setShowOverflow(false);
          }}
        >
          Playback
        </button>
      </div>
      {!isTopicRoot && canEdit && onDelete && (
        <div className="list-menu-button">
          <button
            type="button"
            role="menuitem"
            disabled={isDeleting}
            data-testid="blip-menu-delete"
            onClick={() => {
              onDelete?.();
              setShowOverflow(false);
            }}
          >
            {isDeleting ? 'Deleting…' : 'Delete blip'}
          </button>
        </div>
      )}
    </div>
  );

  // ---------------- EDIT MODE ----------------
  if (isEditing) {
    return (
      <div className={`blip-menu-container${isTopicRoot ? ' topic-root-menu-container' : ''}${isMobile ? ' mobile-blip-menu-container' : ''}`}>
        <div
          className={`blip-menu edit-menu${isInlineChild ? ' inline-child-menu' : ''}${collapseByDefault ? ' folded-by-default' : ''}`}
          data-testid="blip-menu-edit-surface"
        >
          {/* Done button */}
          <button
            className="menu-btn done-btn change-mode delimitered-right js-change-mode"
            onClick={onFinishEdit}
            title="Done, switch to read mode (Ctrl+E, Shift+Enter)"
            disabled={isSending}
            data-testid="blip-menu-done"
          >
            Done
          </button>

          {/* Undo / Redo */}
          <button
            className="menu-btn undo icon-button js-undo"
            onClick={handleUndo}
            disabled={!editor?.can().undo()}
            title="Undo (Ctrl+Z)"
            data-testid="blip-menu-undo"
          >
            <div className="icon" />
          </button>
          <button
            className="menu-btn redo icon-button delimitered-right js-redo"
            onClick={handleRedo}
            disabled={!editor?.can().redo()}
            title="Redo (Ctrl+Shift+Z, Ctrl+Y)"
            data-testid="blip-menu-redo"
          >
            <div className="icon" />
          </button>

          {/* Link / Attachment / Image */}
          <button
            className="menu-btn add-url icon-button js-manage-link"
            title="Insert link (Ctrl+L)"
            onClick={handleInsertLink}
            disabled={!editor}
            data-testid="blip-menu-insert-link"
          >
            <div className="icon" />
          </button>
          <button
            className="menu-btn insert-file icon-button js-insert-file"
            title={isUploading ? 'Uploading attachment…' : 'Insert attachment'}
            onClick={onInsertAttachment}
            disabled={!onInsertAttachment || isUploading}
            data-testid="blip-menu-insert-attachment"
          >
            <div className="icon" />
          </button>
          <button
            className="menu-btn insert-image icon-button delimitered-right js-insert-image"
            title={isUploading ? 'Uploading image…' : 'Insert image'}
            onClick={onInsertImage}
            disabled={!onInsertImage || isUploading}
            data-testid="blip-menu-insert-image"
          >
            <div className="icon" />
          </button>

          {/* Bold / Italic / Underline / Strikethrough */}
          <button
            className={`menu-btn make-bold icon-button js-make-bold ${textFormatState.bold ? 'active' : ''}`}
            onClick={handleBold}
            title="Bold (Ctrl+B)"
            data-testid="blip-menu-bold"
          >
            <div className="icon" />
          </button>
          <button
            className={`menu-btn italic icon-button js-make-italic ${textFormatState.italic ? 'active' : ''}`}
            onClick={handleItalic}
            title="Italic (Ctrl+I)"
            data-testid="blip-menu-italic"
          >
            <div className="icon" />
          </button>
          <button
            className={`menu-btn make-underlined icon-button js-make-underlined ${textFormatState.underline ? 'active' : ''}`}
            onClick={handleUnderline}
            title="Underline (Ctrl+U)"
            data-testid="blip-menu-underline"
          >
            <div className="icon" />
          </button>
          <button
            className={`menu-btn make-struckthrough icon-button js-make-struckthrough ${textFormatState.strike ? 'active' : ''}`}
            onClick={handleStrike}
            title="Strikethrough"
            data-testid="blip-menu-strike"
          >
            <div className="icon" />
          </button>

          {/* Text Background Color */}
          <div className="color-panel-container">
            <button
              className="menu-btn make-background-color icon-button js-make-background-color"
              onClick={() => setShowBgPalette((open) => !open)}
              title="Text background color"
              aria-expanded={showBgPalette}
              data-testid="blip-menu-highlight-toggle"
            >
              <div className="icon" />
            </button>
            {showBgPalette && (
              <div className="color-panel js-color-panel">
                {DEFAULT_BG_COLORS.map((color) => (
                  <button
                    key={color}
                    className="color-choice"
                    style={{ backgroundColor: color }}
                    onClick={() => handleHighlight(color)}
                    title={color === '#ffffff' ? 'Clear highlight' : color}
                    type="button"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Clear Formatting */}
          <button
            className="menu-btn clear-formatting icon-button js-clear-formatting"
            onClick={handleClearFormat}
            title="Clear formatting"
            data-testid="blip-menu-clear-formatting"
          >
            <div className="icon" />
          </button>

          {/* Bullet / Numbered Lists */}
          <button
            className="menu-btn bulleted icon-button js-make-bulleted-list"
            onClick={handleBulletList}
            title="Bulleted list"
            data-testid="blip-menu-bullet-list"
          >
            <div className="icon" />
          </button>
          <button
            className="menu-btn numbered icon-button delimitered-right js-make-numbered-list"
            onClick={handleOrderedList}
            title="Numbered list"
            data-testid="blip-menu-ordered-list"
          >
            <div className="icon" />
          </button>

          {/* Hide by default */}
          {!isTopicRoot && canEdit && onToggleCollapseByDefault && (
            <button
              className={`menu-btn is-folded-by-default delimitered-right js-is-folded-by-default ${collapseByDefault ? 'active' : ''}`}
              title="Collapse this thread by default"
              aria-pressed={collapseByDefault ? 'true' : 'false'}
              data-testid="blip-menu-collapse-default"
              onClick={onToggleCollapseByDefault}
              style={{ fontWeight: collapseByDefault ? 'bold' : 'normal', color: collapseByDefault ? '#2e8b57' : undefined }}
            >
              Hidden
            </button>
          )}

          {/* Delete blip */}
          {!isTopicRoot && canEdit && onDelete && (
            <button
              className="menu-btn delete-blip delimitered-right icon-button js-delete-blip"
              title="Delete comment"
              disabled={isDeleting}
              data-testid="blip-menu-delete"
              onClick={onDelete}
            >
              <div className="icon" />
            </button>
          )}

          {/* Gearwheel */}
          <div className="gearwheel-container" ref={overflowRef}>
            <button
              className={`menu-btn gearwheel icon-button js-gearwheel ${showOverflow ? 'pressed' : ''}`}
              title="Other"
              type="button"
              aria-expanded={showOverflow}
              data-testid="blip-menu-overflow-toggle"
              onClick={() => setShowOverflow((open) => !open)}
            >
              <div className="icon" />
            </button>
            {showOverflow && renderOtherDropdown('edit')}
          </div>

          {/* Inline comment Affordance & Emoji (Accessible extra) */}
          {onCreateInlineChild && (
            <button
              className="menu-btn icon-button"
              title="Insert inline comment at cursor"
              onClick={onCreateInlineChild}
              disabled={!canComment}
              data-testid="blip-menu-insert-inline-comment"
              style={{ width: 'auto', padding: '0 4px', fontSize: '11px', color: '#FFF' }}
            >
              💬+
            </button>
          )}
          <div className="emoji-picker-container" ref={emojiPickerRef}>
            <button
              className={`menu-btn icon-button ${showEmojiPicker ? 'active' : ''}`}
              title="Insert emoji"
              onClick={handleInsertEmoji}
              disabled={!editor}
              data-testid="blip-menu-emoji"
              style={{ width: 'auto', padding: '0 4px' }}
            >
              😀
            </button>
            {showEmojiPicker && (
              <div className="emoji-picker-dropdown">
                <EmojiPicker
                  onEmojiClick={handleEmojiSelect}
                  theme={Theme.LIGHT}
                  searchPlaceholder="Search emojis..."
                  width={320}
                  height={380}
                />
              </div>
            )}
          </div>

          {isUploading && (
            <span className="menu-upload-progress" aria-live="polite">
              {uploadProgress !== null ? `${uploadProgress}%` : '…'}
            </span>
          )}

          {metaInfo && (
            <>
              <span className="blip-menu-spacer" style={{ flex: 1 }} />
              {metaInfo}
            </>
          )}

        {/* Mobile menu trigger */}
          {isMobile && (
            <button
              className="menu-btn mobile-menu-btn icon-button"
              onClick={() => setShowMobileMenu(true)}
              title="More options"
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

  // ---------------- READ-ONLY MODE ----------------
  // Authentic legacy Rizzoma: Edit | hide comments | show comments | get link | Hide | delete | gear
  return (
    <div className={`blip-menu-container${isTopicRoot ? ' topic-root-menu-container' : ''}${isMobile ? ' mobile-blip-menu-container' : ''}`}>
      <div
        className={`blip-menu read-only-menu${isInlineChild ? ' inline-child-menu' : ''}${collapseByDefault ? ' folded-by-default' : ''}`}
        data-testid="blip-menu-read-surface"
      >
        {/* Edit Button */}
        {canEdit && (
          <button
            className="menu-btn edit-btn change-mode delimitered-right js-change-mode"
            onClick={onStartEdit}
            title="To edit mode (Ctrl+E)"
            data-testid="blip-menu-edit"
          >
            Edit
          </button>
        )}

        {/* Hide / Show Comments */}
        <div className="fold-unfold-block js-fold-unfold-block" style={{ display: 'inline-flex' }}>
          <button
            className="menu-btn hide-all-inlines icon-button js-hide-all-inlines"
            onClick={onHideComments}
            title="Hide comments (Ctrl+Shift+Up)"
            disabled={!onHideComments || !areCommentsVisible}
            data-testid="blip-menu-comments-hide"
          >
            <div className="icon" />
          </button>
          <button
            className="menu-btn show-all-inlines icon-button delimitered-right js-show-all-inlines"
            onClick={onShowComments}
            title="Show comments (Ctrl+Shift+Down)"
            disabled={!onShowComments || areCommentsVisible}
            data-testid="blip-menu-comments-show"
          >
            <div className="icon" />
          </button>
        </div>

        {/* Get Direct Link */}
        <button
          className="menu-btn get-blip-link icon-button delimitered-right js-copy-blip-link"
          onClick={onGetLink}
          title="Get direct link"
          data-testid="blip-menu-get-link"
        >
          <div className="icon" />
        </button>

        {/* Hide (collapse thread by default) */}
        {!isTopicRoot && canEdit && onToggleCollapseByDefault && (
          <button
            className={`menu-btn is-folded-by-default delimitered-right js-is-folded-by-default ${collapseByDefault ? 'active' : ''}`}
            title="Collapse this thread by default"
            aria-pressed={collapseByDefault ? 'true' : 'false'}
            data-testid="blip-menu-collapse-default"
            onClick={onToggleCollapseByDefault}
            style={{ fontWeight: collapseByDefault ? 'bold' : 'normal', color: collapseByDefault ? '#2e8b57' : undefined }}
          >
            Hidden
          </button>
        )}

        {/* Delete blip */}
        {!isTopicRoot && canEdit && onDelete && (
          <button
            className="menu-btn delete-blip icon-button delimitered-right js-delete-blip"
            title="Delete comment"
            disabled={isDeleting}
            data-testid="blip-menu-delete"
            onClick={onDelete}
          >
            <div className="icon" />
          </button>
        )}

        {/* Gearwheel */}
        <div className="gearwheel-container" ref={overflowRef}>
          <button
            className={`menu-btn gearwheel icon-button js-gearwheel ${showOverflow ? 'pressed' : ''}`}
            title="Other"
            type="button"
            aria-expanded={showOverflow}
            onClick={() => setShowOverflow((open) => !open)}
            data-testid="blip-menu-gear-toggle"
          >
            <div className="icon" />
          </button>
          {showOverflow && renderOtherDropdown('read')}
        </div>

        {metaInfo && (
          <>
            <span className="blip-menu-spacer" style={{ flex: 1 }} />
            {metaInfo}
          </>
        )}

        {/* Mobile menu trigger */}
        {isMobile && (
          <button
            className="menu-btn mobile-menu-btn icon-button"
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
