import { Extension } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import { Plugin } from '@tiptap/pm/state';
import { getBlbListContext, selectionIsInTopicHeading } from '../blbEditorInvariant';

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
  /** Topic roots allow exactly one leading H1 before their outer bullet list. */
  isTopicRoot?: boolean;
};

export function isCanonicalBlbDocument(
  doc: {
    childCount: number;
    child: (index: number) => {
      type: { name: string };
      attrs?: Record<string, unknown>;
      childCount?: number;
      child?: (childIndex: number) => { type: { name: string }; marks?: readonly unknown[] };
      textContent?: string;
    };
  },
  isTopicRoot = false,
): boolean {
  if (isTopicRoot) {
    if (doc.childCount !== 2) return false;
    const heading = doc.child(0);
    if (heading.type.name !== 'heading' || heading.attrs?.['level'] !== 1) return false;
    // The REST topic model stores a plain, non-empty title. Marks or inline
    // widgets in the collaborative H1 would make Yjs and its HTML projection
    // disagree, so reject that transaction before Collaboration can emit it.
    if (!heading.textContent?.trim()) return false;
    if (typeof heading.childCount !== 'number' || typeof heading.child !== 'function') return false;
    for (let index = 0; index < heading.childCount; index += 1) {
      const child = heading.child(index);
      if (child.type.name !== 'text' || (child.marks?.length ?? 0) > 0) return false;
    }
    return doc.child(1).type.name === 'bulletList';
  }

  return doc.childCount === 1 && doc.child(0).type.name === 'bulletList';
}

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
      isTopicRoot: false,
    };
  },

  addProseMirrorPlugins() {
    const opts = this.options as BlipKeyboardShortcutsOptions;
    return [
      new Plugin({
        filterTransaction: (transaction) => {
          if (!transaction.docChanged) return true;
          // Remote Yjs state has already been accepted by the authoritative
          // document before it reaches ProseMirror. Let legacy invalid state
          // render once so the onUpdate defense can replace it with a canonical
          // transaction. Local invalid transactions are rejected here BEFORE
          // the Collaboration plugin can emit them to Yjs.
          if (isChangeOrigin(transaction)) return true;
          return isCanonicalBlbDocument(transaction.doc, opts.isTopicRoot);
        },
      }),
    ];
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
          // The outer bullet list IS the blip. Lifting its item would turn the
          // label into a paragraph, so top-level Shift+Tab is deliberately a
          // no-op. Nested list items can still be lifted one level at a time.
          if (listDepth <= 1) return true;

          // Try to lift (outdent) the list item
          try {
            if (this.editor.can().liftListItem('listItem')) {
              this.editor.commands.liftListItem('listItem');
              return true;
            }
          } catch {
            // liftListItem not available
          }

        }

        // Always return true to prevent Shift+Tab from escaping the editor
        return true;
      },

      // TipTap exits a list when Enter is pressed in an empty list item. BLB
      // has no prose state to exit into, so keep the empty top-level label.
      'Enter': () => {
        const context = getBlbListContext(this.editor);
        if (context.listDepth === 1 && context.isEmptyListItem) return true;
        return false;
      },

      // Backspace at the start of the first outer-list item normally lifts it
      // into a paragraph. Joining later items and editing nested lists remain
      // untouched.
      'Backspace': () => {
        if (getBlbListContext(this.editor).isAtFirstTopLevelItemStart) return true;
        return false;
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
        // A topic H1 is metadata, not a BLB label. Creating the API child
        // before the marker transaction is rejected would leave an orphaned
        // child blip, so stop before invoking the callback.
        if (opts.isTopicRoot && selectionIsInTopicHeading(this.editor)) return true;
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
