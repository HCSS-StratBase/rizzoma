/**
 * Native fractal-render — BlipEditorAdapter that delegates to TipTap.
 *
 * Bridges between BlipEditorHost (which is TipTap-agnostic and lives in
 * the read-mode native render layer) and the project's existing
 * `getEditorExtensions(...)` + `defaultEditorProps` config.
 *
 * Benefit: all TipTap extensions the existing app uses — mentions,
 * hashtags, tasks, code-block-lowlight, image gadget, chart/poll
 * gadgets, BlipKeyboardShortcuts, etc. — are wired into the per-blip
 * editor in the native render path FOR FREE. Phase 4 deliverables
 * (Mentions/hashtags/tasks, Code blocks/gadgets) collapse to "use the
 * same factory the topic editor uses".
 *
 * Usage:
 *   const factory = makeTipTapFactory(getEditorExtensions, defaultEditorProps);
 *   const host = new BlipEditorHost(blipView, factory);
 *
 * Keep this file headless of React. NativeWaveView wires it up + supplies
 * the per-blip Y.XmlFragment from TopicDoc when collab is enabled.
 */

// TipTap's `Editor` is exported as a value but the project's TS shape
// treats it as a type-only export in some configurations. Use a runtime
// import via the module's default-style binding to keep the ctor callable.
// eslint-disable-next-line @typescript-eslint/no-var-requires
import * as TipTapCore from '@tiptap/core';
import type { BlipEditorAdapter, BlipEditorFactory } from './blip-editor-host';

const EditorCtor = (TipTapCore as any).Editor as new (config: any) => any;

/** Caller-supplied function returning the TipTap extension list. */
export type ExtensionsFactory = (options?: any) => any[];

export interface TipTapAdapterOptions {
  /** Function returning the same array `getEditorExtensions(...)` returns. */
  extensions: ExtensionsFactory;
  /** TipTap editor props (paste handling, attributes, etc.). */
  editorProps?: any;
  /** Per-blip context the extensions might need (blipId, waveId, callbacks). */
  extensionOptions?: any;
}

/**
 * Build a BlipEditorFactory that mounts a TipTap Editor into the slot.
 * The returned factory satisfies BlipEditorHost's contract.
 */
export const makeTipTapFactory = (opts: TipTapAdapterOptions): BlipEditorFactory => {
  return (slot: HTMLElement, initialHtml: string): BlipEditorAdapter => {
    const editor = new EditorCtor({
      element: slot,
      content: initialHtml,
      extensions: opts.extensions(opts.extensionOptions),
      editorProps: opts.editorProps,
      autofocus: 'end',
    });

    return {
      get element() { return editor.options.element as HTMLElement; },
      getHTML: () => editor.getHTML(),
      setContent: (html: string) => editor.commands.setContent(html),
      destroy: () => editor.destroy(),
    };
  };
};
