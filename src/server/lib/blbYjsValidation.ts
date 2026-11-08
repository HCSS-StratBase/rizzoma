import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror';

type ProsemirrorNode = {
  type?: unknown;
  attrs?: Record<string, unknown> | null;
  text?: unknown;
  marks?: unknown[];
  content?: ProsemirrorNode[];
};

function isPlainTopicHeading(node: ProsemirrorNode | undefined): boolean {
  if (node?.type !== 'heading' || Number(node.attrs?.['level']) !== 1) return false;
  if (!Array.isArray(node.content) || node.content.length === 0) return false;
  let title = '';
  for (const child of node.content) {
    if (child.type !== 'text' || typeof child.text !== 'string') return false;
    if (Array.isArray(child.marks) && child.marks.length > 0) return false;
    title += child.text;
  }
  return title.trim().length > 0;
}

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
    if (!isPlainTopicHeading(title)) return false;
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
  // A concrete map/text under TipTap's reserved root name poisons later
  // getXmlFragment() calls. Unrelated shared types are allowed only under
  // other names; `default` must always be the editor XmlFragment.
  if (!(sharedType instanceof Y.XmlFragment)) return false;
  try {
    return isBlbProsemirrorDocument(
      yXmlFragmentToProsemirrorJSON(sharedType) as ProsemirrorNode,
      topicRoot,
    );
  } catch {
    // A remote update initially decodes shared roots as AbstractType. Asking
    // for the expected XmlFragment materializes that placeholder, but the
    // retained payload may still have been authored as Y.Text/Y.Map and be
    // impossible for y-prosemirror to serialize. Treat that decodable poison
    // as invalid structure so join recovery can discard and reseed it.
    return false;
  }
}
