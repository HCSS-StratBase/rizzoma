import { StarterKit } from '@tiptap/starter-kit';
import { Collaboration } from '@tiptap/extension-collaboration';
import * as Y from 'yjs';

export const createYjsDocument = (initialContent?: any): Y.Doc => {
  const ydoc = new Y.Doc();
  
  if (initialContent) {
    // Future: populate with initial content
  }
  
  return ydoc;
};

export const getEditorExtensions = (ydoc?: Y.Doc): any[] => {
  const extensions = [
    StarterKit.configure({
      history: false,
      heading: {
        levels: [1, 2, 3]
      }
    })
  ];

  if (ydoc) {
    extensions.push(
      Collaboration.configure({
        document: ydoc
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