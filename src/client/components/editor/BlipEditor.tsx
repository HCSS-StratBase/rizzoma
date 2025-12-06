import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { getEditorExtensions, defaultEditorProps } from './EditorConfig';
import { yjsDocManager } from './YjsDocumentManager';
import { useCollaboration } from './useCollaboration';
import { InlineComments } from './InlineComments';
import { FEATURES } from '@shared/featureFlags';
import { getInlineCommentsVisibility, setInlineCommentsVisibility, subscribeInlineCommentsVisibility } from './inlineCommentsVisibility';
import './BlipEditor.css';

interface BlipEditorProps {
  content?: string;
  blipId: string;
  isReadOnly?: boolean;
  onUpdate?: (content: string) => void;
  ydoc?: Y.Doc;
  enableCollaboration?: boolean;
}

export function BlipEditor({ 
  content = '', 
  blipId, 
  isReadOnly = false, 
  onUpdate,
  ydoc,
  enableCollaboration = false,
}: BlipEditorProps): JSX.Element {
  const [localYdoc] = useState(() => ydoc || yjsDocManager.getDocument(blipId));
  const provider = useCollaboration(localYdoc, blipId, enableCollaboration && !isReadOnly);
  const [areCommentsVisible, setAreCommentsVisible] = useState(() => getInlineCommentsVisibility(blipId));

  const editor = useEditor({
    extensions: getEditorExtensions(localYdoc, provider, {
      blipId,
      onToggleInlineComments: (visible) => setInlineCommentsVisibility(blipId, visible),
    }),
    content,
    editable: !isReadOnly,
    editorProps: defaultEditorProps,
    onUpdate: ({ editor }: { editor: any }): void => {
      if (onUpdate && !isReadOnly) {
        const html = editor.getHTML();
        onUpdate(html);
      }
    },
  });

  useEffect(() => {
    if (editor && isReadOnly !== editor.isEditable) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  useEffect(() => {
    if (editor && content !== editor.getHTML() && isReadOnly) {
      editor.commands.setContent(content);
    }
  }, [editor, content, isReadOnly]);

  useEffect(() => {
    setAreCommentsVisible(getInlineCommentsVisibility(blipId));
    const unsubscribe = subscribeInlineCommentsVisibility(({ blipId: targetId, isVisible }) => {
      if (targetId === blipId) {
        setAreCommentsVisible(isVisible);
      }
    });
    return unsubscribe;
  }, [blipId]);

  useEffect(() => {
    return () => {
      if (!ydoc) {
        yjsDocManager.removeDocument(blipId);
      }
    };
  }, [blipId, ydoc]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className={`blip-editor ${isReadOnly ? 'read-only' : 'editable'}`}>
      <div style={{ position: 'relative' }}>
        <EditorContent editor={editor} />
        {FEATURES.INLINE_COMMENTS && (
          <InlineComments 
            editor={editor}
            blipId={blipId}
            isVisible={areCommentsVisible}
            canComment={!isReadOnly}
          />
        )}
      </div>
    </div>
  );
}
