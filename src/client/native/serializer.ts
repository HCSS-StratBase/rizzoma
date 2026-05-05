/**
 * Native fractal-render — ContentArray → HTML serializer.
 *
 * The inverse of `parser.ts`. Walks a ContentArray once and emits an HTML
 * string equivalent to what the parser would re-parse back to the same
 * ContentArray (modulo whitespace normalization).
 *
 * Used by:
 *   - Phase 2 BlipView when persisting edits back to the server
 *     (ContentArray held in memory → HTML stored in CouchDB).
 *   - Round-trip parser tests (parse → serialize → parse stable).
 *   - The depth-10 spike harness (JSON fixture → HTML → renderer DOM).
 *
 * Keep this in lock-step with `parser.ts`. New tags or styling that one
 * supports must be added to the other.
 */

import {
  ContentArray,
  ContentElement,
  isAttachment,
  isBlip,
  isLine,
  isText,
  LineEl,
  TextEl,
} from './types';

// ─── HTML escaping ────────────────────────────────────────────────────

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]!);

const escapeAttr = escapeHtml;

// ─── Text run rendering ───────────────────────────────────────────────

/**
 * Wrap a TEXT element's text in nested style tags, matching the parser's
 * recognized tags so round-trip is stable.
 *
 * Wrapping order (innermost → outermost): a → b → i → u → s.
 * The parser's tag-walk produces equivalent TextParams regardless of order,
 * but a stable order keeps round-trip serializations byte-stable.
 */
const serializeTextElement = (el: TextEl): string => {
  let inner = escapeHtml(el.text);
  const p = el.params;

  if (p.url) {
    inner = `<a href="${escapeAttr(p.url)}">${inner}</a>`;
  }
  if (p.bold) inner = `<b>${inner}</b>`;
  if (p.italic) inner = `<i>${inner}</i>`;
  if (p.underlined) inner = `<u>${inner}</u>`;
  if (p.struckthrough) inner = `<s>${inner}</s>`;

  // Inline style for color overrides (parser maps these into params; emit as
  // a span only when one of them is present).
  if (p.bgColor || p.fgColor) {
    const styles: string[] = [];
    if (p.fgColor) styles.push(`color: ${p.fgColor}`);
    if (p.bgColor) styles.push(`background-color: ${p.bgColor}`);
    inner = `<span style="${escapeAttr(styles.join('; '))}">${inner}</span>`;
  }

  return inner;
};

// ─── Element-stream → line groups ─────────────────────────────────────

interface LineGroup {
  /** The LINE element that opened this group (null for "stuff before any LINE"). */
  line: LineEl | null;
  /** TEXT / BLIP / ATTACHMENT elements that belong inside this line. */
  inline: ContentElement[];
}

/**
 * Split a ContentArray into discrete line groups. The parser emits one LINE
 * before each <p>/<li>/<h*> and treats subsequent TEXT/BLIP/ATTACHMENT runs as
 * children of that line until the next LINE arrives. We invert that here.
 */
const groupByLine = (content: ContentArray): LineGroup[] => {
  const groups: LineGroup[] = [];
  let current: LineGroup = { line: null, inline: [] };
  for (const el of content) {
    if (isLine(el)) {
      if (current.line !== null || current.inline.length > 0) {
        groups.push(current);
      }
      current = { line: el, inline: [] };
    } else {
      current.inline.push(el);
    }
  }
  if (current.line !== null || current.inline.length > 0) {
    groups.push(current);
  }
  return groups;
};

// ─── Inline element rendering (TEXT / BLIP / ATTACHMENT) ──────────────

const serializeInline = (el: ContentElement): string => {
  if (isText(el)) return serializeTextElement(el);
  if (isBlip(el)) {
    return `<span class="blip-thread-marker" data-blip-thread="${escapeAttr(el.params.id)}">+</span>`;
  }
  if (isAttachment(el)) {
    return `<img src="${escapeAttr(el.params.url)}" alt="" />`;
  }
  return '';
};

const serializeInlineRun = (els: ContentElement[]): string =>
  els.map(serializeInline).join('');

// ─── Block rendering for one line group ───────────────────────────────

const blockTagFor = (line: LineEl | null): { open: string; close: string; isLi: boolean } => {
  if (!line) {
    // Pre-LINE content (rare; parser would have emitted a <p>). Wrap in <p>.
    return { open: '<p>', close: '</p>', isLi: false };
  }
  const p = line.params;
  if (p.heading && p.heading >= 1 && p.heading <= 6) {
    return { open: `<h${p.heading}>`, close: `</h${p.heading}>`, isLi: false };
  }
  if (typeof p.bulleted === 'number') {
    return { open: `<li class="bulleted bulleted-type${p.bulleted}">`, close: '</li>', isLi: true };
  }
  if (typeof p.numbered === 'number') {
    return { open: `<li class="numbered numbered-type${p.numbered}">`, close: '</li>', isLi: true };
  }
  return { open: '<p>', close: '</p>', isLi: false };
};

// ─── Public entry: serializeContentArrayToHtml ─────────────────────────

/**
 * Render a ContentArray to an HTML string.
 *
 * Output is the same shape the parser consumes — feeding the result back
 * through `parseHtmlToContentArray()` produces a structurally-equivalent
 * ContentArray (round-trip stable for all phase-1 styling and structure).
 */
export const serializeContentArrayToHtml = (content: ContentArray): string => {
  if (!content.length) return '';

  const groups = groupByLine(content);
  const out: string[] = [];

  // Track whether we're inside a UL/OL — open/close as level/kind changes.
  let currentListKind: 'bulleted' | 'numbered' | null = null;
  let currentListLevel = -1;

  const closeListIfOpen = (): void => {
    if (currentListKind === 'bulleted') out.push('</ul>');
    else if (currentListKind === 'numbered') out.push('</ol>');
    currentListKind = null;
    currentListLevel = -1;
  };

  for (const group of groups) {
    const tag = blockTagFor(group.line);
    const params = group.line?.params;
    const isBulleted = params && typeof params.bulleted === 'number';
    const isNumbered = params && typeof params.numbered === 'number';

    if (isBulleted) {
      const level = params!.bulleted!;
      if (currentListKind !== 'bulleted' || currentListLevel !== level) {
        closeListIfOpen();
        out.push(`<ul class="bulleted-list bulleted-list-level${level}">`);
        currentListKind = 'bulleted';
        currentListLevel = level;
      }
    } else if (isNumbered) {
      const level = params!.numbered!;
      if (currentListKind !== 'numbered' || currentListLevel !== level) {
        closeListIfOpen();
        out.push(`<ol class="numbered-list numbered-list-level${level}">`);
        currentListKind = 'numbered';
        currentListLevel = level;
      }
    } else {
      closeListIfOpen();
    }

    out.push(tag.open);
    out.push(serializeInlineRun(group.inline));
    out.push(tag.close);
  }

  closeListIfOpen();
  return out.join('');
};
