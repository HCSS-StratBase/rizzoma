import { Extension } from '@tiptap/core';
import { setInlineCommentsVisibility } from '../inlineCommentsVisibility';

export type InlineCommentsVisibilityOptions = {
  blipId?: string;
  onToggle?: (visible: boolean) => void;
};

export function toggleInlineCommentsVisibility(
  options: InlineCommentsVisibilityOptions,
  visible: boolean
): boolean {
  if (options.blipId) {
    setInlineCommentsVisibility(options.blipId, visible);
  }
  if (typeof options.onToggle === 'function') {
    options.onToggle(visible);
  }
  return true;
}

// TipTap extension that wires Ctrl+Shift+ArrowUp/ArrowDown to inline comment visibility.
export const InlineCommentsVisibility = Extension.create({
  name: 'inlineCommentsVisibility',
  addOptions() {
    return {
      blipId: undefined as string | undefined,
      onToggle: undefined as ((visible: boolean) => void) | undefined,
    };
  },
  addKeyboardShortcuts() {
    const opts = this.options as InlineCommentsVisibilityOptions;
    return {
      'Mod-Shift-ArrowUp': () => toggleInlineCommentsVisibility(opts, true),
      'Mod-Shift-ArrowDown': () => toggleInlineCommentsVisibility(opts, false),
    };
  },
});
