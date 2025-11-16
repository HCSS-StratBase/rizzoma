import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { getEditorExtensions, defaultEditorProps } from './EditorConfig';
import { yjsDocManager } from './YjsDocumentManager';
import { useCollaboration } from './useCollaboration';
import { EditorToolbar } from './EditorToolbar';
import { InlineComments } from './InlineComments';
import { FEATURES } from '@shared/featureFlags';
import './BlipEditor.css';

interface BlipEditorProps {
  content?: string;
  blipId: string;
  isReadOnly?: boolean;
  onUpdate?: (content: string) => void;
  ydoc?: Y.Doc;
  enableCollaboration?: boolean;
  showToolbar?: boolean;
}

export function BlipEditor({ 
  content = '', 
  blipId, 
  isReadOnly = false, 
  onUpdate,
  ydoc,
  enableCollaboration = false,
  showToolbar = false
}: BlipEditorProps): JSX.Element {
  const [localYdoc] = useState(() => ydoc || yjsDocManager.getDocument(blipId));
  const [comments, setComments] = useState<any[]>([]);
  const provider = useCollaboration(localYdoc, blipId, enableCollaboration && !isReadOnly);

  const editor = useEditor({
    extensions: getEditorExtensions(localYdoc, provider),
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
      {FEATURES.RICH_TOOLBAR && !isReadOnly && showToolbar && (
        <EditorToolbar editor={editor} />
      )}
      <div style={{ position: 'relative' }}>
        <EditorContent editor={editor} />
        {FEATURES.INLINE_COMMENTS && (
          <InlineComments 
            editor={editor}
            blipId={blipId}
            comments={comments}
            onAddComment={(comment) => {
              // TODO: Send to server
              setComments([...comments, { ...comment, id: Date.now().toString(), createdAt: Date.now(), updatedAt: Date.now() }]);
            }}
            onResolveComment={(commentId) => {
              setComments(comments.map(c => c.id === commentId ? {...c, resolved: true} : c));
            }}
          />
        )}
      </div>
    </div>
  );
}