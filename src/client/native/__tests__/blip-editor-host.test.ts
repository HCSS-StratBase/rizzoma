/**
 * BlipEditorHost lifecycle + round-trip tests (vitest, jsdom).
 *
 * Uses a fake editor adapter (no real TipTap dep) to verify the host
 * faithfully drives mount/save/unmount + ContentArray round-trip. The
 * actual TipTap wiring lives in the React wrapper and is exercised by
 * Playwright in Phase 2's later deliverables.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BlipEditorHost, BlipEditorAdapter, BlipEditorFactory } from '../blip-editor-host';
import { BlipView } from '../blip-view';
import { ModelType, type ContentArray } from '../types';

class FakeTipTapAdapter implements BlipEditorAdapter {
  readonly element: HTMLElement;
  private html: string;
  destroyCalls = 0;

  constructor(slot: HTMLElement, initialHtml: string) {
    this.html = initialHtml;
    this.element = document.createElement('div');
    this.element.contentEditable = 'true';
    this.element.innerHTML = initialHtml;
    slot.appendChild(this.element);
  }

  getHTML(): string {
    // Simulate what TipTap returns: the contenteditable's current HTML.
    return this.element.innerHTML;
  }
  setContent(html: string): void {
    this.html = html;
    this.element.innerHTML = html;
  }
  destroy(): void {
    this.destroyCalls++;
    if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
  }
}

const makeAdapter: BlipEditorFactory = (slot, initial) => new FakeTipTapAdapter(slot, initial);

const sampleContent = (): ContentArray => [
  { type: ModelType.LINE, text: ' ', params: { bulleted: 0 } },
  { type: ModelType.TEXT, text: 'First', params: {} },
  { type: ModelType.LINE, text: ' ', params: { bulleted: 0 } },
  { type: ModelType.TEXT, text: 'Second', params: {} },
];

describe('BlipEditorHost lifecycle', () => {
  it('mount seeds editor with serialized HTML and adds edit-mode class', () => {
    const view = new BlipView('b1');
    view.setContent(sampleContent());
    const host = new BlipEditorHost(view, makeAdapter);

    expect(host.isMounted()).toBe(false);
    host.mount();

    expect(host.isMounted()).toBe(true);
    expect(view.getContainer().classList.contains('edit-mode')).toBe(true);
    const editor = host.getEditor() as FakeTipTapAdapter;
    expect(editor.element.innerHTML).toContain('First');
    expect(editor.element.innerHTML).toContain('Second');
  });

  it('save round-trips edited HTML into ContentArray', () => {
    const view = new BlipView('b2');
    view.setContent(sampleContent());
    const host = new BlipEditorHost(view, makeAdapter);
    host.mount();

    // Simulate a user edit by changing the contenteditable's HTML.
    const editor = host.getEditor() as FakeTipTapAdapter;
    editor.setContent(
      '<ul class="bulleted-list bulleted-list-level0">' +
        '<li class="bulleted bulleted-type0">First (edited)</li>' +
        '<li class="bulleted bulleted-type0">Second</li>' +
        '<li class="bulleted bulleted-type0">Third</li>' +
      '</ul>'
    );

    const next = host.save();
    const texts = next.filter((e) => e.type === ModelType.TEXT).map((e: any) => e.text);
    expect(texts).toEqual(['First (edited)', 'Second', 'Third']);
    expect(view.getContent()).toEqual(next);
  });

  it('unmount destroys editor and re-renders read mode from current content', () => {
    const view = new BlipView('b3');
    view.setContent(sampleContent());
    const host = new BlipEditorHost(view, makeAdapter);
    host.mount();
    const editor = host.getEditor() as FakeTipTapAdapter;
    editor.setContent('<p>Replaced</p>');
    host.save();
    host.unmount();

    expect(host.isMounted()).toBe(false);
    expect(editor.destroyCalls).toBe(1);
    expect(view.getContainer().classList.contains('edit-mode')).toBe(false);
    // Read-mode render should have a <p> with "Replaced".
    expect(view.getInner().textContent).toContain('Replaced');
  });

  it('cancelAndUnmount restores the pre-mount snapshot', () => {
    const view = new BlipView('b4');
    view.setContent(sampleContent());
    const before = view.getContent();
    const host = new BlipEditorHost(view, makeAdapter);
    host.mount();
    const editor = host.getEditor() as FakeTipTapAdapter;
    editor.setContent('<p>Throwaway draft</p>');

    host.cancelAndUnmount();
    expect(host.isMounted()).toBe(false);
    // ContentArray rolled back to the pre-mount snapshot.
    expect(view.getContent()).toEqual(before);
    expect(view.getInner().textContent).toContain('First');
    expect(view.getInner().textContent).not.toContain('Throwaway draft');
  });

  it('saveAndUnmount writes content AND unmounts', () => {
    const view = new BlipView('b5');
    view.setContent(sampleContent());
    const host = new BlipEditorHost(view, makeAdapter);
    host.mount();
    const editor = host.getEditor() as FakeTipTapAdapter;
    editor.setContent('<p>final</p>');

    host.saveAndUnmount();
    expect(host.isMounted()).toBe(false);
    expect(view.getInner().textContent).toContain('final');
  });

  it('mount() on a destroyed view throws', () => {
    const view = new BlipView('b6');
    view.destroy();
    const host = new BlipEditorHost(view, makeAdapter);
    expect(() => host.mount()).toThrow(/destroyed/);
  });

  it('save() before mount throws', () => {
    const view = new BlipView('b7');
    const host = new BlipEditorHost(view, makeAdapter);
    expect(() => host.save()).toThrow(/not mounted/);
  });
});
