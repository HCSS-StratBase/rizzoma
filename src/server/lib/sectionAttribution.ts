// Server-side block text-hash + attribution stamping.
//
// Mirrors src/client/lib/sectionAttribution.ts so the POST/PATCH
// handlers can compute initial attribution from HTML without requiring
// the client to send the map. Uses parse5 instead of jsdom because
// jsdom takes ~30s to load over the WSL2 /mnt/c filesystem (huge
// dependency tree of Windows-side files), blocking backend startup.
// parse5 is a lightweight HTML5 tokenizer that loads in ~340ms.
import { parseFragment } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
type TextNode = DefaultTreeAdapterMap['textNode'];

export type SectionAttributionEntry = {
  authorId: string;
  updatedAt: number;
};

export type SectionAttributionMap = Record<string, SectionAttributionEntry>;

export function hashBlockText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h) ^ normalized.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const isElement = (n: Node): n is Element =>
  typeof (n as Element).tagName === 'string';

const isTextNode = (n: Node): n is TextNode =>
  (n as Node).nodeName === '#text';

function collectOwnText(node: Node, skipDescendantList: boolean, isEntry: boolean): string {
  if (isTextNode(node)) {
    return (node as TextNode).value || '';
  }
  if (!isElement(node)) return '';
  const el = node as Element;
  // At non-entry depth, skip nested <li>/<ul>/<ol> so the outer list
  // item's "own text" doesn't include its children's text.
  if (skipDescendantList && !isEntry && (el.tagName === 'li' || el.tagName === 'ul' || el.tagName === 'ol')) {
    return '';
  }
  const children = el.childNodes || [];
  let out = '';
  for (const child of children) {
    out += collectOwnText(child, skipDescendantList, false);
  }
  return out;
}

function walkElements(node: Node, callback: (el: Element) => void): void {
  if (isElement(node)) {
    callback(node);
    const children = (node as Element).childNodes || [];
    for (const child of children) walkElements(child, callback);
  } else {
    const children = (node as any).childNodes || [];
    for (const child of children) walkElements(child, callback);
  }
}

export function extractBlockHashes(html: string): string[] {
  if (!html) return [];
  const frag = parseFragment(html);
  const hashes: string[] = [];
  // Top-level non-list children get hashed on full textContent.
  const topChildren = (frag.childNodes || []).filter(isElement);
  for (const el of topChildren) {
    const tag = el.tagName;
    if (tag === 'ul' || tag === 'ol') continue;
    const text = collectOwnText(el, false, true).trim();
    if (text) {
      const h = hashBlockText(text);
      if (h) hashes.push(h);
    }
  }
  // Every <li> at any depth gets hashed on its OWN text (excluding
  // nested <li>/<ul>/<ol> content so each bullet hashes independently
  // of its children).
  walkElements(frag as unknown as Node, (el) => {
    if (el.tagName === 'li') {
      const text = collectOwnText(el, true, true).trim();
      if (text) {
        const h = hashBlockText(text);
        if (h) hashes.push(h);
      }
    }
  });
  return hashes;
}

// Initial stamping for a newly-created topic: every block gets the
// creator's userId + createdAt as the first author.
export function stampInitialAttribution(args: {
  html: string;
  authorId: string;
  now: number;
}): SectionAttributionMap {
  const { html, authorId, now } = args;
  const hashes = new Set(extractBlockHashes(html));
  const map: SectionAttributionMap = {};
  for (const h of hashes) {
    map[h] = { authorId, updatedAt: now };
  }
  return map;
}

// Diff old vs new HTML: carry forward entries for unchanged blocks,
// stamp new blocks with current user/timestamp, drop vanished blocks.
export function diffAndStampAttribution(args: {
  prevAttribution: SectionAttributionMap | undefined;
  oldHtml: string;
  newHtml: string;
  currentUserId: string;
  now: number;
}): SectionAttributionMap {
  const { prevAttribution, oldHtml, newHtml, currentUserId, now } = args;
  const oldHashes = new Set(extractBlockHashes(oldHtml));
  const newHashes = extractBlockHashes(newHtml);
  const next: SectionAttributionMap = {};
  for (const hash of new Set(newHashes)) {
    if (oldHashes.has(hash) && prevAttribution?.[hash]) {
      next[hash] = prevAttribution[hash];
    } else {
      next[hash] = { authorId: currentUserId, updatedAt: now };
    }
  }
  return next;
}
