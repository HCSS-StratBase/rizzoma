import type { Editor } from '@tiptap/core';
import { ensureBlbHtml, ensureTopicBlbHtml } from '@shared/blbContent';

export type BlbEditorDocument =
  | { kind: 'blip' }
  | { kind: 'topic'; title: string };

export type BlbListContext = {
  inListItem: boolean;
  listDepth: number;
  topLevelListType: string | null;
  isEmptyListItem: boolean;
  isAtFirstTopLevelItemStart: boolean;
};

/**
 * Normalize through `Editor.commands.setContent`, never by mutating the DOM.
 * With the Collaboration extension installed this command creates a Yjs
 * transaction, keeping the visible ProseMirror document and shared Y.Doc in
 * the same state before the Couch projection is materialized.
 */
export function normalizeBlbEditorDocument(
  editor: Pick<Editor, 'getHTML' | 'commands'>,
  document: BlbEditorDocument,
): { changed: boolean; html: string } {
  const current = editor.getHTML();
  const normalized = document.kind === 'topic'
    ? ensureTopicBlbHtml(document.title, current)
    : ensureBlbHtml(current);

  if (normalized === current) return { changed: false, html: current };
  editor.commands.setContent(normalized);
  return { changed: true, html: editor.getHTML() };
}

/** Inspect the selection without relying on rendered DOM nesting. */
export function getBlbListContext(editor: { state?: Editor['state'] } | null | undefined): BlbListContext {
  const selection = editor?.state?.selection;
  if (!selection) {
    return {
      inListItem: false,
      listDepth: 0,
      topLevelListType: null,
      isEmptyListItem: false,
      isAtFirstTopLevelItemStart: false,
    };
  }
  const { $from, empty } = selection;
  let listItemDepth = 0;
  let topLevelListType: string | null = null;
  let listDepth = 0;

  for (let depth = 1; depth <= $from.depth; depth += 1) {
    const nodeName = $from.node(depth).type.name;
    if (nodeName === 'bulletList' || nodeName === 'orderedList' || nodeName === 'taskList') {
      listDepth += 1;
      if (depth === 1) topLevelListType = nodeName;
    }
    if (!listItemDepth && (nodeName === 'listItem' || nodeName === 'taskItem')) {
      listItemDepth = depth;
    }
  }

  const inListItem = listItemDepth > 0;
  const isEmptyListItem = Boolean(
    inListItem
    && empty
    && $from.node(listItemDepth).textContent.length === 0,
  );
  const isAtFirstTopLevelItemStart = Boolean(
    inListItem
    && listDepth === 1
    && empty
    && $from.parentOffset === 0
    && $from.index(listItemDepth) === 0
    && $from.index(1) === 0,
  );

  return {
    inListItem,
    listDepth,
    topLevelListType,
    isEmptyListItem,
    isAtFirstTopLevelItemStart,
  };
}

export function selectionIsInCanonicalTopLevelList(editor: { state?: Editor['state'] } | null | undefined): boolean {
  const context = getBlbListContext(editor);
  return context.listDepth >= 1 && context.topLevelListType === 'bulletList';
}

/** Preserve the user's editable H1 when repairing only the topic body shape. */
export function currentTopicEditorTitle(editor: Pick<Editor, 'state'>, fallback: string): string {
  if (editor.state.doc.childCount < 1) return fallback;
  const first = editor.state.doc.child(0);
  if (first.type.name !== 'heading' || first.attrs?.['level'] !== 1) return fallback;
  return first.textContent.trim() || fallback;
}

/**
 * A BLB bullet button may repair a non-list selection, but it can never toggle
 * the canonical outer UL off. Numbered/task conversion is likewise blocked
 * while the selection belongs to that outer UL.
 */
export function runBlbSafeListAction(
  editor: Editor,
  action: 'bullet' | 'ordered' | 'task',
): boolean {
  if (selectionIsInCanonicalTopLevelList(editor)) return false;
  const chain = editor.chain().focus();
  if (action === 'bullet') return chain.toggleBulletList().run();
  if (action === 'ordered') return chain.toggleOrderedList().run();
  return chain.toggleTaskList().run();
}

/** Top-level outdent would turn the BLB label back into prose. */
export function runBlbSafeOutdent(editor: Editor): boolean {
  if (getBlbListContext(editor).listDepth <= 1) return false;
  return editor.chain().focus().liftListItem('listItem').run();
}
