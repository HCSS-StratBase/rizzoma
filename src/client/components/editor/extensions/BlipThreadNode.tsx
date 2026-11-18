import { Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import './BlipThread.css';

/**
 * True when a DOM event comes from INSIDE an inline child blip rendered in this editor's portal anchor
 * (`.inline-child-portal`). The portal sits inside the parent's contenteditable=false atom host, so
 * ProseMirror treated a mouse press in the child as a press on the atom: it selected the marker node and
 * moved the focus into the PARENT editor. A person clicking into a nested, open blip then typed into the
 * wrong blip (found while hand-building the Fractal Showcase, 18 Nov 2026). The parent must ignore such
 * presses and leave them to the browser, which focuses the child's own contenteditable.
 */
export function isEventInsideInlineChildPortal(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : (target as globalThis.Node | null)?.parentElement ?? null;
  return Boolean(el && (el as Element).closest?.('.inline-child-portal'));
}

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
    const threadId = HTMLAttributes['data-blip-thread'];

    // Wrap the marker and a sibling portal anchor in a `display: contents`
    // host so they layout as if they were direct siblings of the marker's
    // surrounding text. The portal anchor lets RizzomaBlip render an
    // expanded inline child blip directly via createPortal, in BOTH view
    // mode AND edit mode (the original Rizzoma had a single render path —
    // we now match that). The host is contenteditable=false so ProseMirror
    // treats the whole atom as non-editable.
    return [
      'span',
      { class: 'blip-thread-host', contenteditable: 'false' },
      [
        'span',
        {
          ...HTMLAttributes,
          class: classes.join(' '),
        },
        '+',
      ],
      [
        'span',
        {
          class: 'inline-child-portal',
          ...(threadId ? { 'data-portal-child': String(threadId) } : {}),
        },
      ],
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blipThreadNestedPointer'),
        props: {
          handleDOMEvents: {
            mousedown: (_view, event) => isEventInsideInlineChildPortal(event.target),
            mouseup: (_view, event) => isEventInsideInlineChildPortal(event.target),
            click: (_view, event) => isEventInsideInlineChildPortal(event.target),
          },
        },
      }),
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
 * BLB: Clicking [+] navigates into the anchored child blip.
 */
// Legacy Rizzoma BLB behavior: clicking a [+] marker expands the
// anchored inline comment IN PLACE, below the marker line — it does
// NOT navigate away to a drill-down surface. RizzomaBlip listens for
// `rizzoma:toggle-inline-blip` and toggles a local expanded-set, then
// renders the child as a real <RizzomaBlip> below the marker's line.
// The previous implementation here set `window.location.hash` to
// `#/topic/.../${blipPath}/` which took the user OUT of the topic
// and into the subblip drill-down surface — surprising and wrong
// for the common "peek at a comment" case (task #9 / #11 discovery).
export function setupBlipThreadClickHandler(): () => void {
  const handler = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.blip-thread-marker') as HTMLElement | null;
    if (!target) return;

    const threadId = target.getAttribute('data-blip-thread');
    if (!threadId) return;

    e.preventDefault();
    e.stopPropagation();

    window.dispatchEvent(
      new CustomEvent('rizzoma:toggle-inline-blip', {
        detail: { threadId },
      }),
    );
  };

  document.addEventListener('click', handler, true);
  return () => document.removeEventListener('click', handler, true);
}
