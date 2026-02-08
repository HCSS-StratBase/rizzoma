// Type augmentation for @tiptap/react NodeView exports
// These exist in the package but TypeScript module resolution sometimes
// fails to find them through the `export * from './X.js'` re-exports.
declare module '@tiptap/react' {
  import type { ComponentType } from 'react';
  import type { NodeViewRendererOptions, NodeViewRenderer } from '@tiptap/core';

  export interface NodeViewProps {
    node: any;
    updateAttributes: (attrs: Record<string, any>) => void;
    deleteNode: () => void;
    getPos: () => number;
    editor: any;
    extension: any;
    selected: boolean;
    decorations: any[];
  }

  export const NodeViewWrapper: React.FC<{ as?: React.ElementType; className?: string; [key: string]: any }>;
  export const NodeViewContent: React.FC<{ as?: React.ElementType; className?: string; [key: string]: any }>;
  export function ReactNodeViewRenderer(
    component: ComponentType<any>,
    options?: Partial<NodeViewRendererOptions & { as?: string; className?: string }>
  ): NodeViewRenderer;
}
