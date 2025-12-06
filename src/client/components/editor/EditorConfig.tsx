import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { Highlight } from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Mention } from '@tiptap/extension-mention';
import { TextStyle } from '@tiptap/extension-text-style';
import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import * as Y from 'yjs';
import { MentionList, MentionListHandle } from './MentionList';
import { CollaborativeCursor } from './CollaborativeCursors';
import { Underline } from './extensions/Underline';
import { TextColor } from './extensions/TextColor';
import { ImageGadget } from './extensions/ImageGadget';
import { InlineCommentsVisibility } from './extensions/InlineCommentsVisibility';
import { ChartGadget, PollGadget } from './extensions/GadgetNodes';
import { FEATURES } from '@shared/featureFlags';

export const createYjsDocument = (initialContent?: any): Y.Doc => {
  const ydoc = new Y.Doc();
  
  if (initialContent) {
    // Future: populate with initial content
  }
  
  return ydoc;
};

// Mock user data - in production, this would come from an API
const mockUsers = [
  { id: '1', label: 'John Doe', email: 'john@example.com' },
  { id: '2', label: 'Jane Smith', email: 'jane@example.com' },
  { id: '3', label: 'Bob Johnson', email: 'bob@example.com' },
  { id: '4', label: 'Alice Brown', email: 'alice@example.com' },
  { id: '5', label: 'Charlie Davis', email: 'charlie@example.com' },
];

type EditorExtensionOptions = {
  blipId?: string;
  onToggleInlineComments?: (visible: boolean) => void;
};

export const getEditorExtensions = (
  ydoc?: Y.Doc,
  provider?: any,
  options?: EditorExtensionOptions
): any[] => {
  const extensions = [
    StarterKit.configure({
      // Enable history so undo/redo in BlipMenu works reliably
      heading: {
        levels: [1, 2, 3]
      }
    })
  ];

  if (options?.blipId || options?.onToggleInlineComments) {
    extensions.push(
      InlineCommentsVisibility.configure({
        blipId: options?.blipId,
        onToggle: options?.onToggleInlineComments,
      })
    );
  }

  // Add rich editor features if enabled
  if (FEATURES.RICH_TOOLBAR) {
    extensions.push(
      TextStyle,
      Underline,
      TextColor,
      Highlight.configure({
        multicolor: true,
        HTMLAttributes: {
          class: 'highlight',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      (ImageGadget as any).configure({
        inline: false,
        allowBase64: true,
      })
    );

    extensions.push(
      ChartGadget.configure({}),
      PollGadget.configure({})
    );
  }

  // Add task lists if enabled
  if (FEATURES.TASK_LISTS) {
    extensions.push(
      TaskList,
      TaskItem.configure({
        nested: true,
      })
    );
  }

  // Add mentions if enabled
  if (FEATURES.MENTIONS) {
    extensions.push(
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: ({ query }: { query: string }) => {
            return mockUsers
              .filter(user => 
                user.label.toLowerCase().includes(query.toLowerCase()) ||
                user.email.toLowerCase().includes(query.toLowerCase())
              )
              .slice(0, 5);
          },
          render: () => {
            let component: ReactRenderer<MentionListHandle> | null = null;
            let popup: any = null;

            return {
              onStart: (props: any) => {
                if (!props.clientRect) {
                  return;
                }

                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                });
              },
              onUpdate: (props: any) => {
                component?.updateProps(props);

                if (!props.clientRect) {
                  return;
                }

                popup?.[0]?.setProps({
                  getReferenceClientRect: props.clientRect,
                });
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                  popup?.[0]?.hide();
                  return true;
                }

                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      })
    );
  }

  if (ydoc) {
    extensions.push(
      Collaboration.configure({
        document: ydoc
      })
    );
  }

  // Add collaborative cursors if enabled and provider exists
  if (FEATURES.LIVE_CURSORS && provider) {
    extensions.push(
      CollaborativeCursor.configure({
        provider,
        user: {
          // In production, get from auth context
          id: Math.random().toString(),
          name: 'User ' + Math.floor(Math.random() * 100),
          color: cursorColors[Math.floor(Math.random() * cursorColors.length)]
        }
      })
    );
  }

  return extensions;
};

const cursorColors = [
  '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', 
  '#2196f3', '#00bcd4', '#009688', '#4caf50',
  '#ff9800', '#ff5722', '#795548', '#607d8b'
];

export const defaultEditorProps = {
  attributes: {
    class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none',
  },
};
