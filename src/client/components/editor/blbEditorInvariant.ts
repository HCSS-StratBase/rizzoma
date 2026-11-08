import { createNodeFromContent, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import * as Y from 'yjs';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
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

type BlbContentEditor = Pick<Editor, 'chain' | 'getHTML'>;

const BLB_SEED_ORIGIN = Symbol('rizzoma-blb-seed');

/**
 * Populate an empty collaborative fragment without giving TipTap a second
 * independent document history to merge on first sync.
 *
 * TipTap's Collaboration extension owns the ProseMirror document. Calling
 * setContent() after that extension is attached can race the initial server
 * snapshot: Yjs then keeps both the local baseline and the authoritative
 * snapshot, yielding two top-level BLB roots. Import directly into the empty
 * shared fragment instead; y-prosemirror renders that one authoritative Yjs
 * transaction back into the editor.
 */
export function seedEmptyBlbYdoc(
  editor: Pick<Editor, 'schema'>,
  ydoc: Y.Doc,
  html: string,
): boolean {
  const fragment = ydoc.getXmlFragment('default');
  if (fragment.length > 0) return false;

  const parsed = createNodeFromContent(html, editor.schema, {
    slice: false,
    errorOnInvalidContent: true,
  }) as ProseMirrorNode;
  if (parsed.type !== editor.schema.topNodeType) {
    throw new Error('invalid_blb_seed_document');
  }

  ydoc.transact(() => {
    prosemirrorToYXmlFragment(parsed, fragment);
  }, BLB_SEED_ORIGIN);
  return true;
}

/**
 * Establish a canonical editor baseline without adding that baseline to undo.
 *
 * Under Collaboration, TipTap undo mutates the Y.Doc before ProseMirror sees
 * the resulting transaction. If the empty shared document -> canonical BLB
 * seed is captured by Y.UndoManager, Ctrl+Z can therefore make the Y.Doc
 * invalid before a ProseMirror transaction filter can reject it.
 * `addToHistory: false` is forwarded by y-prosemirror to the Yjs transaction,
 * so the seed/repair is shared but can never be popped by undo.
 */
export function setBlbEditorBaseline(editor: BlbContentEditor, html: string): boolean {
  return editor.chain()
    .setContent(html)
    .setMeta('addToHistory', false)
    .run();
}

/** Avoid a forced REST projection when Couch already stores the exact seed. */
export function needsBlbSeedProjection(
  sanitizedDurableContent: string,
  authoritativeSeed: string,
): boolean {
  return sanitizedDurableContent !== authoritativeSeed;
}

/**
 * Normalize through an editor transaction, never by mutating the DOM.
 * With the Collaboration extension installed this command creates a Yjs
 * transaction, keeping the visible ProseMirror document and shared Y.Doc in
 * the same state before the Couch projection is materialized.
 */
export function normalizeBlbEditorDocument(
  editor: BlbContentEditor,
  document: BlbEditorDocument,
): { changed: boolean; html: string } {
  const current = editor.getHTML();
  const normalized = document.kind === 'topic'
    ? ensureTopicBlbHtml(document.title, current)
    : ensureBlbHtml(current);

  if (normalized === current) return { changed: false, html: current };
  setBlbEditorBaseline(editor, normalized);
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

/** A topic title is metadata, never a valid anchor for an inline child blip. */
export function selectionIsInTopicHeading(editor: Pick<Editor, 'state'>): boolean {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'heading' && node.attrs?.['level'] === 1) return true;
  }
  return false;
}

/**
 * Never replay a stale REST prop over an editor already backed by non-empty
 * authoritative collaborative state. The Collaboration extension renders the
 * Y.Doc into the editor; its current HTML is therefore the edit-session source
 * of truth.
 */
export function contentForBlbEditStart(
  editor: Pick<Editor, 'getHTML'> | null | undefined,
  fallback: string,
  hasAuthoritativeCollaborationState: boolean,
): string {
  if (!editor || !hasAuthoritativeCollaborationState) return fallback;
  return editor.getHTML();
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
