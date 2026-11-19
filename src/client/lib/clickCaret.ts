/**
 * Where the person clicked in a blip's READ view, as a number of text characters from the start of the blip's own
 * text, so that the caret can be put at the same place when the editor takes over.
 *
 * Why not screen coordinates: switching to edit mode inserts the toolbar and moves the text, so for blips deeper
 * in the tree the old click coordinates fall outside the new editor and `posAtCoords` answers null (measured
 * 18 Nov 2026: hit null on a level 2 blip), which sent the caret to the END of the blip: "my cursor jumped away".
 * The text offset does not depend on layout.
 */

/** Text that belongs to the blip itself: not the [+] marker glyphs and not nested child blips. */
function isOwnText(node: Node, root: Node): boolean {
  for (let el: Node | null = node.parentNode; el && el !== root; el = el.parentNode) {
    if (el.nodeType !== 1) continue;
    const e = el as Element;
    if (e.classList.contains('blip-thread-marker') || e.classList.contains('inline-child-expanded') || e.classList.contains('rizzoma-blip')) return false;
  }
  return true;
}

/** Characters of the blip's own text before (node, offset) inside `root`; null when the point is not inside it. */
export function ownTextOffsetOfPoint(root: Node, node: Node, offset: number): number | null {
  if (!root.contains(node)) return null;
  const walker = (root.ownerDocument || document).createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!isOwnText(n, root)) continue;
    if (n === node) return total + Math.min(offset, (n.nodeValue || '').length);
    total += (n.nodeValue || '').length;
  }
  // the point sits in an element (e.g. between nodes): count all own text before it
  if (node.nodeType === 1) {
    const kids = Array.from(node.childNodes).slice(0, offset);
    let t = 0;
    const w2 = (root.ownerDocument || document).createTreeWalker(root, 4);
    for (let n = w2.nextNode(); n; n = w2.nextNode()) {
      if (!isOwnText(n, root)) continue;
      if (kids.some((k) => k === n || k.contains(n))) t += (n.nodeValue || '').length;
    }
    return t;
  }
  return null;
}

/** The caret point under a client position (Chrome: caretRangeFromPoint; standard: caretPositionFromPoint). */
export function caretPointFromClient(doc: Document, x: number, y: number): { node: Node; offset: number } | null {
  const d = doc as any;
  if (typeof d.caretPositionFromPoint === 'function') {
    const p = d.caretPositionFromPoint(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
  }
  if (typeof d.caretRangeFromPoint === 'function') {
    const r = d.caretRangeFromPoint(x, y);
    if (r) return { node: r.startContainer, offset: r.startOffset };
  }
  return null;
}

/** ProseMirror position for a text offset: the doc is walked text node by text node (atoms such as [+] are skipped). */
export function docPosForTextOffset(doc: { descendants: (cb: (node: any, pos: number) => boolean | void) => void; content: { size: number } }, textOffset: number): number | null {
  let remaining = textOffset;
  let found: number | null = null;
  doc.descendants((node: any, pos: number) => {
    if (found !== null) return false;
    if (node.isText) {
      const len = (node.text || '').length;
      if (remaining <= len) { found = pos + remaining; return false; }
      remaining -= len;
    }
    return true;
  });
  return found;
}
