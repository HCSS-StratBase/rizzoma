import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';

type ProsemirrorNode = {
  type?: unknown;
  attrs?: Record<string, unknown> | null;
  content?: ProsemirrorNode[];
};

/**
 * Validate the one invariant that makes BLB navigation possible: every
 * top-level body node is an unordered bullet list. Topic-root documents add a
 * single H1 before that bulleted body.
 */
export function isBlbProsemirrorDocument(
  document: ProsemirrorNode,
  topicRoot: boolean,
): boolean {
  if (document.type !== 'doc' || !Array.isArray(document.content)) return false;

  const nodes = document.content;
  if (topicRoot) {
    if (nodes.length !== 2) return false;
    const title = nodes[0];
    if (title?.type !== 'heading' || Number(title.attrs?.['level']) !== 1) return false;
    return nodes[1]?.type === 'bulletList';
  }

  return nodes.length === 1 && nodes[0]?.type === 'bulletList';
}

export function isBlbYjsDocument(document: Y.Doc, topicRoot: boolean): boolean {
  let sharedType: unknown = document.share.get('default');
  // Non-editor Yjs maps may share the document without changing rendered
  // content. Only validate once the canonical TipTap fragment is present.
  if (sharedType === undefined) return true;
  // Remote Yjs updates initially decode root shared types as an untyped
  // AbstractType. Materialize that placeholder as the same XmlFragment TipTap
  // requests on the client before inspecting it.
  if ((sharedType as { constructor?: unknown }).constructor === Y.AbstractType) {
    sharedType = document.getXmlFragment('default');
  }
  if (!(sharedType instanceof Y.XmlFragment)) return true;
  return isBlbProsemirrorDocument(
    yXmlFragmentToProsemirrorJSON(sharedType) as ProsemirrorNode,
    topicRoot,
  );
}
