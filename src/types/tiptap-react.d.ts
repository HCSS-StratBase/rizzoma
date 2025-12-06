declare module '@tiptap/react' {
  import type { Editor } from '@tiptap/core';
  import type { ComponentType } from 'react';

  export function useEditor(options: any): Editor | null;
  export const EditorContent: ComponentType<{ editor?: Editor | null }>;

  export class ReactRenderer<T = any> {
    constructor(component: any, options: any);
    element: HTMLElement;
    ref: T;
    updateProps(props: any): void;
    destroy(): void;
  }
}
