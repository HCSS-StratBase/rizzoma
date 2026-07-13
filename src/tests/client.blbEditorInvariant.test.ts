import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  contentForBlbEditStart,
  getBlbListContext,
  needsBlbSeedProjection,
  normalizeBlbEditorDocument,
  runBlbSafeListAction,
  setBlbEditorBaseline,
} from '../client/components/editor/blbEditorInvariant';
import {
  BlipKeyboardShortcuts,
  isCanonicalBlbDocument,
} from '../client/components/editor/extensions/BlipKeyboardShortcuts';
import { isBlbYjsDocument } from '../server/lib/blbYjsValidation';

const BLB = '<ul><li><p>First label</p></li><li><p>Second label</p></li></ul>';

function blbEditor(content = BLB): Editor {
  return new Editor({
    extensions: [StarterKit as any, BlipKeyboardShortcuts.configure({})],
    content,
  });
}

describe('client: durable BLB editor invariant', () => {
  it('rejects every local transaction that removes or converts the outer bullet list', () => {
    const editor = blbEditor();
    editor.commands.focus('end');

    expect(runBlbSafeListAction(editor, 'bullet')).toBe(false);
    expect(editor.getHTML()).toBe(BLB);
    expect(runBlbSafeListAction(editor, 'ordered')).toBe(false);
    expect(editor.getHTML()).toBe(BLB);

    // Direct commands cannot bypass the ProseMirror transaction gate either.
    editor.commands.toggleBulletList();
    editor.commands.toggleOrderedList();
    editor.commands.liftListItem('listItem');
    expect(editor.getHTML()).toBe(BLB);
    expect(isCanonicalBlbDocument(editor.state.doc)).toBe(true);
    editor.destroy();
  });

  it('blocks empty-list Enter and first-item Backspace escape paths', () => {
    const empty = '<ul><li><p></p></li></ul>';
    const editor = blbEditor(empty);
    editor.commands.focus('start');
    const context = getBlbListContext(editor);
    expect(context.isEmptyListItem).toBe(true);
    expect(context.isAtFirstTopLevelItemStart).toBe(true);

    editor.commands.keyboardShortcut('Enter');
    editor.commands.keyboardShortcut('Backspace');
    expect(editor.getHTML()).toBe(empty);
    editor.destroy();
  });

  it('allows nested outdent but no-ops Shift+Tab at the outer list', () => {
    const nested = '<ul><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ul>';
    const editor = blbEditor(nested);
    editor.commands.focus('end');
    expect(getBlbListContext(editor).listDepth).toBe(2);
    editor.commands.keyboardShortcut('Shift-Tab');
    expect(editor.getHTML()).toBe(
      '<ul><li><p>Parent</p></li><li><p>Child</p></li></ul>',
    );
    editor.commands.keyboardShortcut('Shift-Tab');
    expect(editor.getHTML()).toBe(
      '<ul><li><p>Parent</p></li><li><p>Child</p></li></ul>',
    );
    editor.destroy();
  });

  it('repairs legacy prose through an editor transaction', () => {
    const editor = new Editor({ extensions: [StarterKit as any], content: '<p>Legacy prose</p>' });
    const repaired = normalizeBlbEditorDocument(editor, { kind: 'blip' });
    expect(repaired.changed).toBe(true);
    expect(repaired.html).toBe('<ul><li><p>Legacy prose</p></li></ul>');
    expect(isCanonicalBlbDocument(editor.state.doc)).toBe(true);
    editor.destroy();
  });

  it('keeps a topic H1 followed only by outer bullet lists', () => {
    const editor = new Editor({
      extensions: [
        StarterKit as any,
        BlipKeyboardShortcuts.configure({ isTopicRoot: true }),
      ],
      content: '<h1>Topic</h1><ul><li><p>Label</p></li></ul>',
    });
    expect(isCanonicalBlbDocument(editor.state.doc, true)).toBe(true);
    editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.commands.insertContent('Renamed');
    expect(editor.getHTML()).toBe('<h1>Renamed</h1><ul><li><p>Label</p></li></ul>');
    editor.commands.focus('end');
    editor.commands.toggleOrderedList();
    expect(editor.getHTML()).toBe('<h1>Renamed</h1><ul><li><p>Label</p></li></ul>');
    editor.destroy();
  });

  it('keeps the canonical seed out of Yjs undo while ordinary text undo and redo remain valid', () => {
    const ydoc = new Y.Doc();
    const observedValidity: boolean[] = [];
    ydoc.on('update', () => {
      // This mirrors the server's validation point: every emitted update must
      // already leave the authoritative shared document canonical.
      observedValidity.push(isBlbYjsDocument(ydoc, false));
    });
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ history: false }) as any,
        BlipKeyboardShortcuts.configure({}),
        Collaboration.configure({ document: ydoc }),
      ],
      content: '',
    });
    setBlbEditorBaseline(editor, BLB);
    editor.commands.focus('end');
    const before = Array.from(Y.encodeStateAsUpdate(ydoc));
    const updatesAfterSeed = observedValidity.length;

    // The old defect: undo popped the empty -> BLB seed directly in Yjs, so
    // the server rejected the update after the client had already diverged.
    expect(editor.commands.undo()).toBe(false);
    expect(editor.commands.redo()).toBe(false);
    expect(Array.from(Y.encodeStateAsUpdate(ydoc))).toEqual(before);
    expect(observedValidity).toHaveLength(updatesAfterSeed);

    editor.commands.insertContent('!');
    expect(editor.getHTML()).toContain('Second label!');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getHTML()).toBe(BLB);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getHTML()).toContain('Second label!');
    expect(observedValidity.length).toBeGreaterThan(updatesAfterSeed);
    expect(observedValidity.every(Boolean)).toBe(true);

    const afterValidRedo = Array.from(Y.encodeStateAsUpdate(ydoc));

    editor.commands.toggleOrderedList();
    editor.commands.toggleBulletList();

    expect(editor.getHTML()).toContain('<ul>');
    expect(Array.from(Y.encodeStateAsUpdate(ydoc))).toEqual(afterValidRedo);
    expect(observedValidity.every(Boolean)).toBe(true);
    editor.destroy();
    ydoc.destroy();
  });

  it('keeps a non-collaborative baseline out of history while preserving text undo', () => {
    const editor = new Editor({
      extensions: [StarterKit as any, BlipKeyboardShortcuts.configure({})],
      content: '<p></p>',
    });
    setBlbEditorBaseline(editor, BLB);
    editor.commands.focus('end');
    editor.commands.insertContent('!');
    expect(editor.getHTML()).toContain('Second label!');
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getHTML()).toBe(BLB);
    expect(editor.commands.undo()).toBe(false);
    expect(editor.getHTML()).toBe(BLB);
    editor.destroy();
  });

  it('rejects empty, formatted, and widget-bearing topic H1 edits before Yjs changes', () => {
    const title = `Tom's "A&B" <C>`;
    const canonical = `<h1>Tom's "A&amp;B" &lt;C&gt;</h1><ul><li><p>Label</p></li></ul>`;
    const ydoc = new Y.Doc();
    const observedValidity: boolean[] = [];
    ydoc.on('update', () => observedValidity.push(isBlbYjsDocument(ydoc, true)));
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ history: false }) as any,
        BlipKeyboardShortcuts.configure({ isTopicRoot: true }),
        Collaboration.configure({ document: ydoc }),
      ],
      content: '',
    });
    setBlbEditorBaseline(editor, canonical);
    expect(editor.getHTML()).toBe(canonical);
    const before = Array.from(Y.encodeStateAsUpdate(ydoc));
    const updatesAfterSeed = observedValidity.length;

    editor.commands.setTextSelection({ from: 1, to: title.length + 1 });
    editor.commands.toggleBold();
    editor.commands.deleteSelection();
    editor.commands.insertContent({ type: 'hardBreak' });

    expect(editor.getHTML()).toBe(canonical);
    expect(Array.from(Y.encodeStateAsUpdate(ydoc))).toEqual(before);
    expect(observedValidity).toHaveLength(updatesAfterSeed);
    expect(observedValidity.every(Boolean)).toBe(true);
    editor.destroy();
    ydoc.destroy();
  });

  it('does not create a child from a topic H1 but still creates one from a BLB label', () => {
    const createChild = vi.fn();
    const editor = new Editor({
      extensions: [
        StarterKit as any,
        BlipKeyboardShortcuts.configure({
          isTopicRoot: true,
          onCreateInlineChildBlip: createChild,
        }),
      ],
      content: '<h1>Topic</h1><ul><li><p>Label</p></li></ul>',
    });

    editor.commands.setTextSelection(2);
    editor.commands.keyboardShortcut('Mod-Enter');
    expect(createChild).not.toHaveBeenCalled();

    editor.commands.focus('end');
    editor.commands.keyboardShortcut('Mod-Enter');
    expect(createChild).toHaveBeenCalledOnce();
    editor.destroy();
  });

  it('preserves authoritative collaborative HTML when edit mode starts with stale props', () => {
    const editor = blbEditor('<ul><li><p>Live collaborator text</p></li></ul>');
    const stale = '<ul><li><p>Stale REST prop</p></li></ul>';

    expect(contentForBlbEditStart(editor, stale, true)).toBe(
      '<ul><li><p>Live collaborator text</p></li></ul>',
    );
    expect(contentForBlbEditStart(editor, stale, false)).toBe(stale);
    editor.destroy();
  });

  it('projects only seeds that differ from sanitized durable Couch content', () => {
    expect(needsBlbSeedProjection(BLB, BLB)).toBe(false);
    expect(needsBlbSeedProjection('<p>Legacy prose</p>', BLB)).toBe(true);
  });
});
