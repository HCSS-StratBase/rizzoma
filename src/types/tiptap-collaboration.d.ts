declare module '@tiptap/extension-collaboration' {
  import type { Extension } from '@tiptap/core';
  import type { Transaction } from '@tiptap/pm/state';
  type CollaborationType = {
    configure: (options: { document: unknown }) => Extension;
  };
  const Collaboration: CollaborationType;
  export function isChangeOrigin(transaction: Transaction): boolean;
  export default Collaboration;
}
