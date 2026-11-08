import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useMemo } from 'react';
import * as Y from 'yjs';
import { getEditorExtensions, defaultEditorProps } from './EditorConfig';
import { yjsDocManager } from './YjsDocumentManager';
import { useCollaboration } from './useCollaboration';
import { setInlineCommentsVisibility } from './inlineCommentsVisibility';
import { insertGadget } from '../../gadgets/insert';
import type { GadgetInsertDetail } from '../../gadgets/types';
import { useAuthenticatedCollaborationUser } from './useAuthenticatedCollaborationUser';
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
  const collaborationUser = useAuthenticatedCollaborationUser();
  const collaborationOwnerId = collaborationUser?.id ?? null;
  const localYdoc = useMemo(
    () => ydoc || yjsDocManager.getDocument(blipId, collaborationOwnerId),
    [blipId, collaborationOwnerId, ydoc],
  );
  const provider = useCollaboration(
    localYdoc,
    blipId,
    enableCollaboration && !isReadOnly && !!collaborationOwnerId,
    collaborationUser,
  );

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
    return () => {
      if (!ydoc) {
        yjsDocManager.removeDocument(blipId, collaborationOwnerId);
      }
    };
  }, [blipId, collaborationOwnerId, ydoc]);

  useEffect(() => {
    if (!editor || isReadOnly) return;

    const handleInsertGadget = (e: Event) => {
      const detail = (e as CustomEvent<GadgetInsertDetail>).detail;
      insertGadget(editor as any, detail);
    };

    window.addEventListener('rizzoma:insert-gadget', handleInsertGadget);
    return () => {
      window.removeEventListener('rizzoma:insert-gadget', handleInsertGadget);
    };
  }, [editor, isReadOnly]);

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className={`blip-editor ${isReadOnly ? 'read-only' : 'editable'}`}>
      <div style={{ position: 'relative' }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
