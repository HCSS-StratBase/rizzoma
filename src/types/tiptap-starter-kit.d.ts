declare module '@tiptap/starter-kit' {
  import type { Extension } from '@tiptap/core';
  type StarterKitType = {
    configure: (options?: Record<string, unknown>) => Extension;
  };
  const StarterKit: StarterKitType;
  export default StarterKit;
}
