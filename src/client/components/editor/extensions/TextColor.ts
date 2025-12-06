import { Mark } from '@tiptap/core';

export interface TextColorOptions {
  types: string[];
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      setColor: (color: string) => ReturnType;
      unsetColor: () => ReturnType;
    };
  }
}

export const TextColor = Mark.create<TextColorOptions>({
  name: 'textColor',

  addOptions() {
    return {
      types: ['textStyle'],
      HTMLAttributes: {},
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.color?.replace(/['"]/g, ''),
            renderHTML: (attributes: { color?: string }) => {
              if (!attributes.color) {
                return {};
              }
              return {
                style: `color: ${attributes.color}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setColor: (color: string) => ({ chain }: { chain: () => any }) => {
        return chain()
          .setMark('textStyle', { color })
          .run();
      },
      unsetColor: () => ({ chain }: { chain: () => any }) => {
        return chain()
          .setMark('textStyle', { color: null })
          .removeEmptyTextStyle()
          .run();
      },
    };
  },
});
