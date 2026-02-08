import { Node } from '@tiptap/core';
import './BlipThread.css';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blipThread: {
      /**
       * Insert an inline BlipThread marker at the current cursor position.
       * @param options.threadId - The ID of the child blip (format: "waveId:blipPath")
       * @param options.hasUnread - Whether the thread has unread content
       */
      insertBlipThread: (options: { threadId: string; hasUnread?: boolean }) => ReturnType;
    };
  }
}

/**
 * TipTap Node extension for inline BlipThread markers.
 *
 * This creates a [+] marker that is embedded directly in the content
 * (like original Rizzoma), not stored separately with anchor positions.
 *
 * Key characteristics:
 * - Inline atom node (non-editable, self-contained)
 * - Syncs via Yjs automatically as part of the document
 * - Click toggles INLINE expansion of the child blip (no navigation)
 *
 * BLB Philosophy:
 * - The [+] marker indicates a child blip exists at this position
 * - Clicking expands/collapses the child blip inline below the marker
 * - Green color indicates unread content in the thread
 */
export const BlipThreadNode = Node.create({
  name: 'blipThread',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-blip-thread'),
        renderHTML: (attributes: Record<string, unknown>) => {
          const threadId = attributes['threadId'];
          if (!threadId) return {};
          return { 'data-blip-thread': threadId };
        },
      },
      hasUnread: {
        default: false,
        parseHTML: (element: HTMLElement) => element.classList.contains('has-unread'),
        renderHTML: (attributes: Record<string, unknown>) => {
          const hasUnread = attributes['hasUnread'];
          if (!hasUnread) return {};
          return { class: 'has-unread' };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-blip-thread]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    const classes = ['blip-thread-marker'];
    const existingClass = HTMLAttributes['class'];
    if (existingClass) {
      classes.push(String(existingClass));
    }

    return [
      'span',
      {
        ...HTMLAttributes,
        class: classes.join(' '),
      },
      '+',
    ];
  },

  addCommands() {
    return {
      insertBlipThread:
        (options: { threadId: string; hasUnread?: boolean }) =>
        ({ commands }: { commands: any }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              threadId: options.threadId,
              hasUnread: options.hasUnread ?? false,
            },
          });
        },
    };
  },
});

/**
 * Set up click handler for BlipThread markers.
 * This should be called once to add event delegation for all markers.
 *
 * BLB: Clicking [+] dispatches a custom event to toggle inline expansion.
 * The parent RizzomaBlip listens for this event and expands/collapses the child inline.
 */
export function setupBlipThreadClickHandler(): () => void {
  const handler = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.blip-thread-marker') as HTMLElement | null;
    if (!target) return;

    const threadId = target.getAttribute('data-blip-thread');
    if (!threadId) return;

    e.preventDefault();
    e.stopPropagation();

    // Dispatch custom event for inline expansion (instead of navigating away)
    window.dispatchEvent(new CustomEvent('rizzoma:toggle-inline-blip', {
      detail: { threadId },
    }));
  };

  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
}
