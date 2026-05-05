import { Extension } from '@tiptap/core';

export type BlipKeyboardShortcutsOptions = {
  blipId?: string;
  waveId?: string;
  /**
   * Callback to create a child blip at the given anchor position.
   * anchorPosition is the character offset from the start of the content.
   * Returns a promise that resolves when the blip is created.
   */
  onCreateInlineChildBlip?: (anchorPosition: number) => Promise<void> | void;
  /** Callback to hide (fold) all inline comments. Triggered by Ctrl+Shift+Up. */
  onHideComments?: () => void;
  /** Callback to show (unfold) all inline comments. Triggered by Ctrl+Shift+Down. */
  onShowComments?: () => void;
};

/**
 * TipTap extension for blip-specific keyboard shortcuts.
 *
 * This extension handles:
 * - Tab: Indent list item (sink deeper into list)
 * - Shift+Tab: Outdent list item (lift up in list)
 * - Ctrl/Cmd+Enter: Create a NEW inline child blip document at cursor position
 *
 * IMPORTANT: Plain Enter is NOT intercepted - TipTap's ListItem extension
 * handles it naturally for creating new bullets/paragraphs within the blip.
 *
 * BLB Philosophy (Bullet-Label-Blip):
 * - A blip IS a bulleted list - nested bullets are inline content, not separate documents
 * - Enter = new line/bullet WITHIN the blip (same blip content)
 * - Ctrl+Enter = Create a NEW child blip document anchored at cursor position
 *   (This is fundamentally different from a nested bullet - it's a separate document!)
 * - Reply blips (no anchor) appear at the bottom; Inline blips (with anchor) appear inline
 */
export const BlipKeyboardShortcuts = Extension.create({
  name: 'blipKeyboardShortcuts',

  addOptions() {
    return {
      blipId: undefined as string | undefined,
      waveId: undefined as string | undefined,
      onCreateInlineChildBlip: undefined as ((anchorPosition: number) => Promise<void> | void) | undefined,
      onHideComments: undefined as (() => void) | undefined,
      onShowComments: undefined as (() => void) | undefined,
    };
  },

  addKeyboardShortcuts() {
    const opts = this.options as BlipKeyboardShortcutsOptions;
    return {
      // Tab: Indent - works anywhere like VS Code
      // IMPORTANT: Always return true to prevent Tab from changing focus!
      'Tab': () => {
        // Check if we're inside a list item
        const { $from } = this.editor.state.selection;
        let inListItem = false;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
            inListItem = true;
            break;
          }
        }

        // If in a list item, try to indent (sink)
        if (inListItem) {
          try {
            if (this.editor.can().sinkListItem('listItem')) {
              this.editor.commands.sinkListItem('listItem');
              return true;
            }
          } catch {
            // sinkListItem not available or can't sink further
          }
          // Can't sink further - we're at max indent, just stay here
          return true;
        }

        // Not in a list - convert current paragraph to a bullet list
        try {
          this.editor.commands.toggleBulletList();
          return true;
        } catch {
          // toggleBulletList not available
        }

        // Always return true to prevent Tab from escaping the editor
        return true;
      },

      // Shift+Tab: Outdent - works anywhere like VS Code
      // IMPORTANT: Always return true to prevent Shift+Tab from changing focus!
      'Shift-Tab': () => {
        // Check if we're inside a list item
        const { $from } = this.editor.state.selection;
        let inListItem = false;
        let listDepth = 0;
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
            inListItem = true;
            // Count how many list levels deep we are
            for (let dd = d; dd > 0; dd--) {
              const n = $from.node(dd);
              if (n.type.name === 'bulletList' || n.type.name === 'orderedList' || n.type.name === 'taskList') {
                listDepth++;
              }
            }
            break;
          }
        }

        if (inListItem) {
          // Try to lift (outdent) the list item
          try {
            if (this.editor.can().liftListItem('listItem')) {
              this.editor.commands.liftListItem('listItem');
              return true;
            }
          } catch {
            // liftListItem not available
          }

          // If we can't lift but we're in a top-level list, convert back to paragraph
          if (listDepth === 1) {
            try {
              // Toggle off the bullet list to convert to paragraph
              this.editor.commands.toggleBulletList();
              return true;
            } catch {
              // Try ordered list
              try {
                this.editor.commands.toggleOrderedList();
                return true;
              } catch {
                // Neither worked
              }
            }
          }
        }

        // Always return true to prevent Shift+Tab from escaping the editor
        return true;
      },

      // Ctrl/Cmd+Enter: Create a NEW inline child blip document at cursor position.
      //
      // The anchorPosition value is now a SENTINEL (always 0) — its only role
      // is to satisfy the inline-vs-list discriminator (typeof === 'number'
      // → inline child). Position is owned STRUCTURALLY by the marker span
      // that the create-handler inserts into the parent's editor via
      // insertBlipThread, matching original Rizzoma's blip-thread model
      // (editor/renderer.coffee:107-113 — blip-thread elements live in the
      // parent's content array; there was no separate numeric offset).
      //
      // The renderer (renderInlineHtml / inlineMarkers) no longer reads the
      // anchorPosition value; it walks the saved HTML for marker spans and
      // renders children at their structural location. So we don't need to
      // compute a text offset here anymore.
      'Mod-Enter': () => {
        if (opts.onCreateInlineChildBlip) {
          opts.onCreateInlineChildBlip(0);
        }
        return true;
      },

      // Ctrl+Shift+Up: Hide (fold) all inline comments
      'Mod-Shift-ArrowUp': () => {
        if (opts.onHideComments) {
          opts.onHideComments();
          return true;
        }
        return false;
      },

      // Ctrl+Shift+Down: Show (unfold) all inline comments
      'Mod-Shift-ArrowDown': () => {
        if (opts.onShowComments) {
          opts.onShowComments();
          return true;
        }
        return false;
      },
    };
  },
});
