/**
 * Native fractal-render — BlipEditorHost.
 *
 * Mounts a TipTap editor into a BlipView's inner slot when the blip enters
 * edit mode. The BlipView's ContentArray remains the source of truth: edit
 * mode loads HTML from `serializeContentArrayToHtml(view.getContent())`,
 * the user edits, and on `save()` the editor's HTML is parsed back to
 * ContentArray via `parseHtmlToContentArray()` and written to the view.
 *
 * Lifecycle:
 *   const host = new BlipEditorHost(view, makeEditor);
 *   host.mount();         // hides the read-mode render, mounts TipTap
 *   …user edits…
 *   await host.save();    // pulls HTML, parses, writes ContentArray
 *   host.unmount();       // destroys TipTap, re-renders read-mode
 *
 * Phase 2 contract: the editor factory `makeEditor` is supplied by the
 * caller (the React wrapper or a TipTap instance). This file does not
 * import `@tiptap/core` directly — it accepts any object that satisfies
 * the minimal `BlipEditorAdapter` shape below. That keeps the file
 * testable in jsdom without requiring TipTap deps to load.
 */

import { parseHtmlToContentArray } from './parser';
import { serializeContentArrayToHtml } from './serializer';
import { BlipView } from './blip-view';
import { ContentArray, ContentElement, ModelType, isLine } from './types';

/** Minimal interface the host needs. TipTap's `Editor` satisfies this naturally. */
export interface BlipEditorAdapter {
  /** The DOM element that contains the editor's contenteditable surface. */
  readonly element: HTMLElement;
  /** Get the current document HTML. */
  getHTML(): string;
  /** Replace the current document with the given HTML. */
  setContent(html: string): void;
  /** Tear down the editor (remove DOM, listeners, plugins). */
  destroy(): void;
}

/**
 * Caller-supplied factory. Receives the slot element where the editor's
 * DOM should be placed, plus the initial HTML to seed. Returns the editor
 * adapter (typically a TipTap Editor instance whose `element` is appended
 * to the slot during construction).
 */
export type BlipEditorFactory = (slot: HTMLElement, initialHtml: string) => BlipEditorAdapter;

export class BlipEditorHost {
  private readonly view: BlipView;
  private readonly factory: BlipEditorFactory;
  private editor: BlipEditorAdapter | null = null;
  private readSnapshot: ContentArray | null = null;

  constructor(view: BlipView, factory: BlipEditorFactory) {
    this.view = view;
    this.factory = factory;
  }

  isMounted(): boolean {
    return this.editor !== null;
  }

  getEditor(): BlipEditorAdapter | null {
    return this.editor;
  }

  /** Hide the read-mode render and mount a TipTap editor in its place. */
  mount(): void {
    if (this.editor) return;
    if (this.view.isDestroyed()) {
      throw new Error('BlipEditorHost.mount: view is destroyed');
    }
    // Snapshot the current content so cancel() can restore it.
    this.readSnapshot = this.view.getContent().slice();

    const inner = this.view.getInner();
    // Clear read-mode children. The renderer rebuilds them on unmount().
    while (inner.firstChild) inner.removeChild(inner.firstChild);

    const initialHtml = serializeContentArrayToHtml(this.readSnapshot);
    this.editor = this.factory(inner, initialHtml);

    // Mark the view's container as in edit-mode so CSS can adjust styling
    // (matches the original .blip-container.edit-mode class).
    this.view.getContainer().classList.add('edit-mode');
  }

  /**
   * Pull the current editor HTML, parse it back to ContentArray, and
   * write it to the view. Does NOT unmount — call `unmount()` after to
   * exit edit mode, or `cancelAndUnmount()` to discard.
   */
  save(): ContentArray {
    if (!this.editor) {
      throw new Error('BlipEditorHost.save: not mounted');
    }
    const html = this.editor.getHTML();
    const next = parseHtmlToContentArray(html);
    this.view.setContent(next); // setContent triggers re-render — but we're
                                 // still in edit mode, so the renderer's
                                 // output is overwritten on unmount() anyway.
    return next;
  }

  /** Destroy TipTap, restore the read-mode render. */
  unmount(): void {
    if (!this.editor) return;
    const inner = this.view.getInner();
    try {
      this.editor.destroy();
    } finally {
      this.editor = null;
    }
    // The editor.destroy() should remove its own DOM, but be defensive.
    while (inner.firstChild) inner.removeChild(inner.firstChild);
    this.view.getContainer().classList.remove('edit-mode');
    // Re-render the read-mode view from the (possibly updated) content.
    this.view.render();
    this.readSnapshot = null;
  }

  /** Discard pending edits, restore the snapshot, then unmount. */
  cancelAndUnmount(): void {
    if (!this.editor) return;
    if (this.readSnapshot) {
      this.view.setContent(this.readSnapshot);
    }
    this.unmount();
  }

  /** Save current edits, then unmount (the common Done-button flow). */
  saveAndUnmount(): ContentArray {
    const result = this.save();
    this.unmount();
    return result;
  }

  /**
   * Handle Ctrl+Enter while the editor is mounted: insert a fresh BLIP
   * marker into the ContentArray at the cursor's array index. The line
   * at the cursor is split — the BLIP element goes between the two
   * resulting halves, anchored to the closing LINE so the renderer
   * batches it correctly.
   *
   * Returns the new BLIP element's id so the caller can navigate / focus
   * the freshly-created child blip.
   *
   * Caller responsibility:
   *   1. Pass a string `cursorMarker` that the editor inserts into the
   *      live HTML at the current cursor position (e.g. ﻿). This
   *      keeps the cursor-position math out of TipTap-specifics.
   *   2. Generate a fresh blipId via your normal allocator (this method
   *      doesn't know your id scheme).
   */
  insertChildBlipAtCursor(cursorMarker: string, newBlipId: string): ContentArray {
    if (!this.editor) throw new Error('insertChildBlipAtCursor: not mounted');

    const html = this.editor.getHTML();
    const arr = parseHtmlToContentArray(html);
    const idx = findCursorMarkerIndex(arr, cursorMarker);

    const blipEl: ContentElement = {
      type: ModelType.BLIP,
      text: ' ',
      params: { id: newBlipId },
    };

    // The cursor sits inside the paragraph that opened at array index
    // `idx`. The paragraph's contents run from `idx+1` until the next
    // LINE (or end of array). Insert the BLIP at the END of that range
    // so it lands right before the next paragraph break, matching
    // original Rizzoma's Ctrl+Enter behavior.
    let endOfPara = arr.length;
    for (let i = idx + 1; i < arr.length; i++) {
      if (isLine(arr[i])) {
        endOfPara = i;
        break;
      }
    }
    const next = [...arr];
    next.splice(endOfPara, 0, blipEl);

    // Strip the cursor marker from any TEXT element it landed in.
    for (let i = 0; i < next.length; i++) {
      const el = next[i];
      if (el.type === ModelType.TEXT && el.text.includes(cursorMarker)) {
        next[i] = { ...el, text: el.text.replace(cursorMarker, '') };
      }
    }

    this.view.setContent(next);
    return next;
  }
}

/**
 * Walk the array looking for the TEXT element containing the cursor
 * marker; return the LINE index that owns it. If no marker found, falls
 * back to "end of last LINE found" (or 0 if none).
 */
const findCursorMarkerIndex = (arr: ContentArray, marker: string): number => {
  let lastLineIdx = -1;
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    if (isLine(el)) {
      lastLineIdx = i;
      continue;
    }
    if (el.type === ModelType.TEXT && el.text.includes(marker)) {
      return lastLineIdx;
    }
  }
  return lastLineIdx >= 0 ? lastLineIdx : 0;
};
