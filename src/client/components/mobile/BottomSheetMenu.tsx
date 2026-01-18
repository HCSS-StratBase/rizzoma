import { useCallback, type ReactNode } from 'react';
import { BottomSheet, type BottomSheetProps } from './BottomSheet';
import './BottomSheetMenu.css';

export interface MenuItemProps {
  /** Unique identifier for the item */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon (emoji or component) */
  icon?: ReactNode;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether this is a destructive action (red styling) */
  destructive?: boolean;
  /** Whether this item is currently active/selected */
  active?: boolean;
  /** Handler when item is clicked */
  onClick: () => void;
}

export interface MenuSeparatorProps {
  /** Unique identifier */
  id: string;
  /** Mark this as a separator */
  separator: true;
}

export type MenuEntry = MenuItemProps | MenuSeparatorProps;

function isSeparator(entry: MenuEntry): entry is MenuSeparatorProps {
  return 'separator' in entry && entry.separator === true;
}

export interface BottomSheetMenuProps extends Omit<BottomSheetProps, 'children'> {
  /** Menu items to display */
  items: MenuEntry[];
  /** Whether to close the sheet after an item is clicked */
  closeOnSelect?: boolean;
}

/**
 * Bottom sheet specialized for menu/action lists
 * Renders a list of tappable menu items in a bottom sheet
 */
export function BottomSheetMenu({
  items,
  closeOnSelect = true,
  onClose,
  ...sheetProps
}: BottomSheetMenuProps): JSX.Element {
  const handleItemClick = useCallback(
    (item: MenuItemProps) => {
      if (item.disabled) return;
      item.onClick();
      if (closeOnSelect) {
        onClose();
      }
    },
    [closeOnSelect, onClose]
  );

  return (
    <BottomSheet {...sheetProps} onClose={onClose} showHandle={true}>
      <nav className="bottom-sheet-menu" role="menu">
        {items.map((entry) => {
          if (isSeparator(entry)) {
            return <div key={entry.id} className="menu-separator" role="separator" />;
          }

          const item = entry;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`menu-item ${item.disabled ? 'disabled' : ''} ${item.destructive ? 'destructive' : ''} ${item.active ? 'active' : ''}`}
              disabled={item.disabled}
              onClick={() => handleItemClick(item)}
              data-testid={`menu-item-${item.id}`}
            >
              {item.icon && <span className="menu-item-icon">{item.icon}</span>}
              <span className="menu-item-label">{item.label}</span>
              {item.active && <span className="menu-item-check" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </nav>
    </BottomSheet>
  );
}

/**
 * Utility function to create menu items for BlipMenu actions
 */
export function createBlipMenuItems(options: {
  canEdit: boolean;
  canComment: boolean;
  isEditing: boolean;
  areCommentsVisible: boolean;
  collapseByDefault: boolean;
  clipboardAvailable: boolean;
  isUploading: boolean;
  isSending: boolean;
  isDeleting: boolean;
  onStartEdit?: () => void;
  onFinishEdit?: () => void;
  onToggleComments?: () => void;
  onDelete?: () => void;
  onGetLink?: () => void;
  onToggleCollapseByDefault?: () => void;
  onCopyComment?: () => void;
  onPasteAsReply?: () => void;
  onPasteAtCursor?: () => void;
  onShowHistory?: () => void;
  onInsertAttachment?: () => void;
  onInsertImage?: () => void;
  onSend?: () => void;
}): MenuEntry[] {
  const items: MenuEntry[] = [];

  if (options.isEditing) {
    // Editing mode menu
    if (options.onFinishEdit) {
      items.push({
        id: 'done',
        label: options.isSending ? 'Sending...' : 'Done',
        icon: '✓',
        disabled: options.isSending,
        onClick: options.onFinishEdit,
      });
    }

    if (options.onSend) {
      items.push({
        id: 'send',
        label: options.isSending ? 'Sending...' : 'Send',
        icon: '📤',
        disabled: options.isSending,
        onClick: options.onSend,
      });
    }

    items.push({ id: 'sep1', separator: true });

    if (options.onInsertAttachment) {
      items.push({
        id: 'attachment',
        label: options.isUploading ? 'Uploading...' : 'Insert attachment',
        icon: '📎',
        disabled: options.isUploading,
        onClick: options.onInsertAttachment,
      });
    }

    if (options.onInsertImage) {
      items.push({
        id: 'image',
        label: options.isUploading ? 'Uploading...' : 'Insert image',
        icon: '🖼️',
        disabled: options.isUploading,
        onClick: options.onInsertImage,
      });
    }

    items.push({ id: 'sep2', separator: true });

    if (options.onCopyComment) {
      items.push({
        id: 'copy',
        label: 'Copy comment',
        icon: '📋',
        onClick: options.onCopyComment,
      });
    }

    if (options.onPasteAtCursor && options.clipboardAvailable) {
      items.push({
        id: 'paste-cursor',
        label: 'Paste at cursor',
        icon: '📥',
        onClick: options.onPasteAtCursor,
      });
    }
  } else {
    // Read-only mode menu
    if (options.canEdit && options.onStartEdit) {
      items.push({
        id: 'edit',
        label: 'Edit',
        icon: '✏️',
        onClick: options.onStartEdit,
      });
    }

    if (options.onToggleComments) {
      items.push({
        id: 'comments',
        label: options.areCommentsVisible ? 'Hide comments' : 'Show comments',
        icon: '💬',
        active: options.areCommentsVisible,
        onClick: options.onToggleComments,
      });
    }

    items.push({ id: 'sep1', separator: true });

    if (options.onCopyComment) {
      items.push({
        id: 'copy',
        label: 'Copy comment',
        icon: '📋',
        onClick: options.onCopyComment,
      });
    }

    if (options.onGetLink) {
      items.push({
        id: 'link',
        label: 'Copy direct link',
        icon: '🔗',
        onClick: options.onGetLink,
      });
    }

    if (options.canComment && options.onPasteAsReply && options.clipboardAvailable) {
      items.push({
        id: 'paste-reply',
        label: 'Paste as reply',
        icon: '📥',
        onClick: options.onPasteAsReply,
      });
    }
  }

  // Common items for both modes
  if (options.onShowHistory) {
    items.push({
      id: 'history',
      label: 'Playback history',
      icon: '⏪',
      onClick: options.onShowHistory,
    });
  }

  if (options.canEdit && options.onToggleCollapseByDefault) {
    items.push({
      id: 'collapse',
      label: options.collapseByDefault ? 'Show by default' : 'Hide by default',
      icon: options.collapseByDefault ? '👁️' : '👁️‍🗨️',
      onClick: options.onToggleCollapseByDefault,
    });
  }

  if (options.canEdit && options.onDelete) {
    items.push({ id: 'sep-delete', separator: true });
    items.push({
      id: 'delete',
      label: options.isDeleting ? 'Deleting...' : 'Delete blip',
      icon: '🗑️',
      destructive: true,
      disabled: options.isDeleting,
      onClick: options.onDelete,
    });
  }

  return items;
}
