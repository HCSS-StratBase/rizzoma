import { Editor } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  getBlbListContext,
  normalizeBlbEditorDocument,
  runBlbSafeListAction,
} from '../client/components/editor/blbEditorInvariant';
import {
  BlipKeyboardShortcuts,
  isCanonicalBlbDocument,
} from '../client/components/editor/extensions/BlipKeyboardShortcuts';

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

  it('rejects invalid local edits before the Collaboration plugin emits to Yjs', () => {
    const ydoc = new Y.Doc();
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ history: false }) as any,
        BlipKeyboardShortcuts.configure({}),
        Collaboration.configure({ document: ydoc }),
      ],
      content: '',
    });
    editor.commands.setContent(BLB);
    editor.commands.focus('end');
    const before = Array.from(Y.encodeStateAsUpdate(ydoc));

    editor.commands.toggleOrderedList();
    editor.commands.toggleBulletList();

    expect(editor.getHTML()).toBe(BLB);
    expect(Array.from(Y.encodeStateAsUpdate(ydoc))).toEqual(before);
    editor.destroy();
    ydoc.destroy();
  });
});
