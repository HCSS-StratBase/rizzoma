declare module '@tiptap/extension-collaboration' {
  import type { Extension } from '@tiptap/core';
  type CollaborationType = {
    configure: (options: { document: unknown }) => Extension;
  };
  const Collaboration: CollaborationType;
  export default Collaboration;
}
