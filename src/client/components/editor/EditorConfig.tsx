import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import { Highlight } from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Mention } from '@tiptap/extension-mention';
import { TextStyle } from '@tiptap/extension-text-style';
import { ReactRenderer, ReactNodeViewRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import * as Y from 'yjs';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { MentionList, MentionListHandle } from './MentionList';
import { CollaborativeCursor } from './CollaborativeCursors';
import { Underline } from './extensions/Underline';
import { TextColor } from './extensions/TextColor';
import { ImageGadget } from './extensions/ImageGadget';
import { InlineCommentsVisibility } from './extensions/InlineCommentsVisibility';
import { BlipKeyboardShortcuts } from './extensions/BlipKeyboardShortcuts';
import { AppFrameGadget, ChartGadget, EmbedFrameGadget, PollGadget } from './extensions/GadgetNodes';
import { BlipThreadNode } from './extensions/BlipThreadNode';
import { TagNode } from './extensions/TagNode';
import { TaskWidgetNode } from './extensions/TaskWidget';
import { CodeBlockView } from './extensions/CodeBlockView';
import { FEATURES } from '@shared/featureFlags';
import {
  anonymousCollaborationUser,
  isCollaborationUser,
} from './collaborationIdentity';
import './extensions/CodeBlockView.css';

const lowlight = createLowlight(common);

export const createYjsDocument = (initialContent?: any): Y.Doc => {
  const ydoc = new Y.Doc();
  
  if (initialContent) {
    // Future: populate with initial content
  }
  
  return ydoc;
};

export type EditorRosterUser = { id: string; label: string; email?: string };

type EditorExtensionOptions = {
  blipId?: string;
  waveId?: string;
  onToggleInlineComments?: (visible: boolean) => void;
  /**
   * Callback to create an inline child blip at the given anchor position.
   * anchorPosition is the character offset from the start of the content.
   */
  onCreateInlineChildBlip?: (anchorPosition: number) => Promise<void> | void;
  /** Callback to hide (fold) all inline comments. Triggered by Ctrl+Shift+Up. */
  onHideComments?: () => void;
  /** Callback to show (unfold) all inline comments. Triggered by Ctrl+Shift+Down. */
  onShowComments?: () => void;
  /** Allow one canonical H1 before the topic root's outer bullet list. */
  isTopicRoot?: boolean;
  /** Currently signed-in user — injected into the ~task assignee picker so the user can assign tasks to themselves. */
  currentUser?: EditorRosterUser | null;
  /** Real wave participants — injected into the ~task assignee picker. */
  participants?: EditorRosterUser[];
};

export function buildEditorRoster(options?: EditorExtensionOptions): EditorRosterUser[] {
  const users = new Map<string, EditorRosterUser>();
  if (options?.currentUser?.id) users.set(options.currentUser.id, options.currentUser);
  for (const participant of options?.participants || []) {
    if (participant.id && !users.has(participant.id)) users.set(participant.id, participant);
  }
  return [...users.values()];
}

export const getEditorExtensions = (
  ydoc?: Y.Doc,
  provider?: any,
  options?: EditorExtensionOptions
): any[] => {
  const editorRoster = buildEditorRoster(options);
  const extensions = [
    StarterKit.configure({
      // Disable history when using Collaboration (Yjs has its own undo manager)
      history: ydoc ? false : undefined,
      heading: {
        levels: [1, 2, 3]
      },
      // Disable built-in codeBlock — replaced by CodeBlockLowlight with syntax highlighting
      codeBlock: false,
    }),
    CodeBlockLowlight
      .extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      })
      .configure({ lowlight }),
    (ImageGadget as any).configure({
      inline: false,
      allowBase64: true,
    }),
    ChartGadget.configure({}),
    EmbedFrameGadget.configure({}),
    AppFrameGadget.configure({}),
    PollGadget.configure({}),
  ];

  if (options?.blipId || options?.onToggleInlineComments) {
    extensions.push(
      InlineCommentsVisibility.configure({
        blipId: options?.blipId,
        onToggle: options?.onToggleInlineComments,
      })
    );
  }

  // Add blip keyboard shortcuts (Tab/Shift+Tab for indent, Ctrl+Enter for inline child blip)
  if (options?.blipId || options?.waveId || options?.onCreateInlineChildBlip) {
    extensions.push(
      BlipKeyboardShortcuts.configure({
        blipId: options?.blipId,
        waveId: options?.waveId,
        onCreateInlineChildBlip: options?.onCreateInlineChildBlip,
        onHideComments: options?.onHideComments,
        onShowComments: options?.onShowComments,
        isTopicRoot: options?.isTopicRoot ?? false,
      })
    );
    // BLB: Always include BlipThreadNode when blip shortcuts are enabled
    // This provides the [+] marker for inline child blips (core BLB functionality)
    extensions.push(BlipThreadNode.configure({}));
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
      })
      // BlipThreadNode is added with BlipKeyboardShortcuts (core BLB feature)
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

  // Add #tag and ~task inline widgets (uses same suggestion pattern as mentions)
  if (FEATURES.MENTIONS) {
    extensions.push(TagNode.configure({}));
    extensions.push(TaskWidgetNode.configure({
      waveId: options?.waveId || '',
      // Topic-root tasks are reconciled against the topic ID itself.
      blipId: options?.blipId || options?.waveId || '',
      currentUser: options?.currentUser || null,
      participants: options?.participants || [],
    }));
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
            return editorRoster
              .filter(user => 
                user.label.toLowerCase().includes(query.toLowerCase()) ||
                (user.email || '').toLowerCase().includes(query.toLowerCase())
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
    const awarenessUser = provider.awareness?.getLocalState?.()?.['user'];
    const cursorUser = isCollaborationUser(awarenessUser)
      ? awarenessUser
      : anonymousCollaborationUser(provider.awareness?.clientID ?? 'editor');
    extensions.push(
      CollaborativeCursor.configure({
        provider,
        user: cursorUser,
      })
    );
  }

  return extensions;
};

export const defaultEditorProps = {
  attributes: {
    class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none',
  },
};
