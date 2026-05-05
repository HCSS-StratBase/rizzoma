/**
 * Native fractal-render — HTML → ContentArray parser.
 *
 * Direct TS port of original Rizzoma's `share/parser.coffee` HtmlParser.
 *
 * Walks an HTML document fragment depth-first, emitting LINE / TEXT / BLIP
 * elements into a flat ContentArray. The output is the same shape original
 * Rizzoma's editor consumed — see types.ts for the model.
 *
 * Coverage (phase-1 scope):
 *   - Bold / italic / underline / strikethrough
 *   - Bulleted + numbered lists, nested
 *   - Headings (1-6)
 *   - Links
 *   - Plain paragraphs (<p>) → LINE break before each
 *   - <br> → LINE break
 *   - <span data-blip-thread="ID"> → BlipEl (existing markers from saved HTML)
 *
 * Out of scope for phase 1 (will land in phase 2 alongside editor mounting):
 *   - Inline images / attachments (recognized but emitted as TEXT for now)
 *   - Tables / blockquotes (rare; falls through as block break + text)
 *   - Mentions / hashtags / tasks (per-blip TipTap features; survive as text)
 */

import {
  ContentArray,
  LineParams,
  ModelType,
  TextParams,
} from './types';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'INPUT', 'TEXTAREA',
  'SELECT', 'CANVAS', 'AUDIO', 'VIDEO', 'NOSCRIPT', 'TITLE', 'META',
  'HEAD', 'LINK',
]);

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'TABLE', 'TR', 'TD', 'TH', 'SECTION', 'ARTICLE',
  'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'HR',
]);

const isBlockElement = (el: Element): boolean => BLOCK_TAGS.has(el.tagName);

const isMarkerSpan = (el: Element): boolean =>
  el.tagName === 'SPAN' &&
  (el.classList.contains('blip-thread-marker') ||
    el.hasAttribute('data-blip-thread'));

const isSkipped = (el: Element): boolean => SKIP_TAGS.has(el.tagName);

/** Map an element's intrinsic styling to TextParams. */
const elementToTextParams = (el: Element, parent: TextParams): TextParams => {
  const p: TextParams = { ...parent };
  switch (el.tagName) {
    case 'B':
    case 'STRONG':
      p.bold = true;
      break;
    case 'I':
    case 'EM':
    case 'DFN':
    case 'VAR':
      p.italic = true;
      break;
    case 'U':
    case 'INS':
      p.underlined = true;
      break;
    case 'STRIKE':
    case 'DEL':
    case 'S':
      p.struckthrough = true;
      break;
    case 'A': {
      const href = (el as HTMLAnchorElement).getAttribute('href');
      if (href) p.url = href;
      break;
    }
  }
  // Inline style overrides (best-effort; matches original _mapStyle).
  const style = (el as HTMLElement).style;
  if (style) {
    if (style.fontWeight === 'bold' || style.fontWeight === 'bolder') p.bold = true;
    if (style.fontWeight === 'normal') delete p.bold;
    if (style.fontStyle === 'italic') p.italic = true;
    if (style.fontStyle === 'normal') delete p.italic;
    if (style.textDecoration?.includes('underline')) p.underlined = true;
    if (style.textDecoration?.includes('line-through')) p.struckthrough = true;
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
      p.bgColor = style.backgroundColor;
    }
    if (style.color) {
      p.fgColor = style.color;
    }
  }
  return p;
};

interface ParseState {
  ops: ContentArray;
  textParams: TextParams;
  lineParams: LineParams;
  /** Tracks whether the previous emitted element was a LINE — avoids double-line breaks. */
  lastWasLine: boolean;
  /** Track whether we just exited a block element — pending LINE on next text. */
  pendingBlockBreak: boolean;
}

const pushLine = (s: ParseState, params: LineParams = {}): void => {
  // Don't emit consecutive LINEs.
  if (s.lastWasLine && Object.keys(params).length === 0) return;
  s.ops.push({
    type: ModelType.LINE,
    text: ' ',
    params: { ...s.lineParams, ...params },
  });
  s.lastWasLine = true;
  s.pendingBlockBreak = false;
};

const pushText = (s: ParseState, text: string): void => {
  if (!text) return;
  if (s.pendingBlockBreak) {
    pushLine(s);
  }
  // Original collapses runs of whitespace except inside <pre>; we follow.
  const collapsed = text.replace(/\s+/g, ' ');
  if (!collapsed.trim() && s.lastWasLine) {
    // Skip pure-whitespace right after a LINE — matches original's _isLastCharWhiteSpace handling.
    return;
  }
  s.ops.push({
    type: ModelType.TEXT,
    text: collapsed,
    params: { ...s.textParams },
  });
  s.lastWasLine = false;
  s.pendingBlockBreak = false;
};

const pushBlip = (s: ParseState, id: string, threadId?: string): void => {
  s.ops.push({
    type: ModelType.BLIP,
    text: ' ',
    params: { id, ...(threadId ? { threadId } : {}) },
  });
  s.lastWasLine = false;
  s.pendingBlockBreak = false;
};

const walk = (node: Node, s: ParseState): void => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue || '';
    pushText(s, text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (isSkipped(el)) return;

  // <br> → LINE
  if (el.tagName === 'BR') {
    pushLine(s);
    return;
  }

  // BlipThread marker span → BLIP element
  if (isMarkerSpan(el)) {
    const id = el.getAttribute('data-blip-thread');
    if (id) pushBlip(s, id);
    return;
  }

  // BlipThread host span — recurse into the marker; ignore the rest (portal anchors etc.)
  if (el.classList.contains('blip-thread-host')) {
    const marker = el.querySelector('[data-blip-thread]');
    if (marker) walk(marker, s);
    return;
  }

  const block = isBlockElement(el);
  // List context: bump nesting on UL / OL.
  let listLevelChange: { kind: 'bulleted' | 'numbered'; prev: number | undefined } | null = null;
  if (block && (el.tagName === 'UL' || el.tagName === 'OL')) {
    const kind = el.tagName === 'UL' ? 'bulleted' : 'numbered';
    const prev = s.lineParams[kind];
    listLevelChange = { kind, prev };
    s.lineParams[kind] = (prev ?? -1) + 1;
  }

  // Heading
  let prevHeading: number | undefined;
  if (/^H[1-6]$/.test(el.tagName)) {
    prevHeading = s.lineParams.heading;
    s.lineParams.heading = parseInt(el.tagName[1], 10);
  }

  // <li> and <h1..h6> emit a LINE BEFORE their content (carries the current
  // list/heading params). Headings need an explicit pushLine even at start of
  // input because their LINE element carries the heading param.
  if (el.tagName === 'LI' || /^H[1-6]$/.test(el.tagName)) {
    pushLine(s);
  } else if (block) {
    // Other block elements: emit a LINE before children if needed.
    if (s.ops.length > 0 && !s.lastWasLine) {
      s.pendingBlockBreak = true;
    }
  }

  // Apply text-level styling for this element to the cascade.
  const prevTextParams = s.textParams;
  s.textParams = elementToTextParams(el, prevTextParams);

  // Recurse.
  let child = el.firstChild;
  while (child) {
    walk(child, s);
    child = child.nextSibling;
  }

  // Restore text params.
  s.textParams = prevTextParams;

  // Heading restore.
  if (prevHeading !== undefined) {
    s.lineParams.heading = prevHeading;
  } else if (/^H[1-6]$/.test(el.tagName)) {
    delete s.lineParams.heading;
  }

  // List-level restore.
  if (listLevelChange) {
    if (listLevelChange.prev === undefined) {
      delete s.lineParams[listLevelChange.kind];
    } else {
      s.lineParams[listLevelChange.kind] = listLevelChange.prev;
    }
  }

  // Block exit → flag pending break for next text.
  if (block && el.tagName !== 'UL' && el.tagName !== 'OL' && el.tagName !== 'LI') {
    s.pendingBlockBreak = true;
  }
};

/**
 * Parse an HTML string into a ContentArray.
 *
 * Mirrors the structural shape produced by original Rizzoma's HtmlParser.
 * Returns an empty array for empty / whitespace-only input.
 */
export const parseHtmlToContentArray = (html: string): ContentArray => {
  if (!html || !html.trim()) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return [];
  const state: ParseState = {
    ops: [],
    textParams: {},
    lineParams: {},
    lastWasLine: false,
    pendingBlockBreak: false,
  };
  let child = root.firstChild;
  while (child) {
    walk(child, state);
    child = child.nextSibling;
  }
  return state.ops;
};
