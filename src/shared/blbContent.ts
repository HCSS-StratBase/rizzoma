/** Canonical creation-time HTML for the Bullet-Label-Blip contract. */
export const EMPTY_BLB_HTML = '<ul><li><p></p></li></ul>';

export function escapeBlbHtml(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

/** Escape element text without encoding quotes that are not delimiters here. */
export function escapeBlbText(value: string): string {
  const replacements: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  };
  return value.replace(/[&<>"]/g, (character) => replacements[character] ?? character);
}

function decodeBlbText(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    '#39': "'",
    '#x27': "'",
  };
  return value.replace(/&(amp|lt|gt|quot|#39|#x27);/gi, (entity, name: string) => (
    entities[name.toLowerCase()] ?? entity
  ));
}

export function plainTextToBlbHtml(value: string): string {
  const labels = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (labels.length === 0) return EMPTY_BLB_HTML;
  return `<ul>${labels.map((label) => `<li><p>${escapeBlbHtml(label)}</p></li>`).join('')}</ul>`;
}

type HtmlTag = {
  end: number;
  name: string;
  closing: boolean;
  selfClosing: boolean;
};

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function isTagNameCharacter(character: string | undefined): boolean {
  if (character === undefined || character === '') return false;
  const code = character.charCodeAt(0);
  return (
    (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || character === '-'
    || character === ':'
  );
}

/**
 * Read one HTML tag without a backtracking regular expression. Attribute
 * values may contain `>`; quoted values are therefore scanned explicitly.
 */
function readHtmlTag(value: string, start: number): HtmlTag | null {
  if (value[start] !== '<') return null;
  if (value.startsWith('<!--', start)) {
    const commentEnd = value.indexOf('-->', start + 4);
    return commentEnd < 0
      ? null
      : { end: commentEnd + 3, name: '', closing: false, selfClosing: true };
  }

  let end = start + 1;
  let quote = '';
  while (end < value.length) {
    const character = value.charAt(end);
    if (quote !== '') {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      break;
    }
    end += 1;
  }
  if (end >= value.length) return null;

  let cursor = start + 1;
  while (/\s/.test(value[cursor] || '')) cursor += 1;
  const closing = value[cursor] === '/';
  if (closing) {
    cursor += 1;
    while (/\s/.test(value[cursor] || '')) cursor += 1;
  }
  const nameStart = cursor;
  while (isTagNameCharacter(value[cursor])) cursor += 1;
  const name = value.slice(nameStart, cursor).toLowerCase();
  const beforeClose = value.slice(start + 1, end).trimEnd();
  return {
    end: end + 1,
    name,
    closing,
    selfClosing: name.length === 0 || beforeClose.endsWith('/') || VOID_ELEMENTS.has(name),
  };
}

/** Return the exclusive end of an element, or -1 for malformed HTML. */
function elementEnd(value: string, start: number, expectedName: string): number {
  const root = readHtmlTag(value, start);
  if (!root || root.closing || root.selfClosing || root.name !== expectedName) return -1;

  let depth = 1;
  let cursor = root.end;
  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);
    if (tagStart < 0) return -1;
    const tag = readHtmlTag(value, tagStart);
    if (!tag) return -1;
    cursor = tag.end;
    if (tag.name !== expectedName || tag.selfClosing) continue;
    depth += tag.closing ? -1 : 1;
    if (depth === 0) return tag.end;
  }
  return -1;
}

function firstOpeningTag(value: string, start = 0): HtmlTag | null {
  const tag = readHtmlTag(value, start);
  return tag && !tag.closing && !tag.selfClosing && tag.name.length > 0 ? tag : null;
}

const TASK_LIST_DATA_TYPE = /\bdata-type\s*=\s*(?:"tasklist"|'tasklist'|tasklist(?=[\s>]))/i;
const TASK_ITEM_DATA_TYPE = /\bdata-type\s*=\s*(?:"taskitem"|'taskitem'|taskitem(?=[\s>]))/i;

function hasOnlyDirectListItems(value: string, root: HtmlTag): boolean {
  let cursor = root.end;
  let itemCount = 0;
  while (cursor < value.length) {
    while (/\s/.test(value[cursor] || '')) cursor += 1;
    if (cursor >= value.length) return false;
    const tag = readHtmlTag(value, cursor);
    if (!tag) return false;
    if (tag.closing && tag.name === 'ul') {
      return itemCount > 0 && tag.end === value.length;
    }
    if (tag.name === '' && tag.selfClosing) {
      cursor = tag.end;
      continue;
    }
    if (tag.closing || tag.selfClosing || tag.name !== 'li') return false;
    if (TASK_ITEM_DATA_TYPE.test(value.slice(cursor, tag.end))) return false;
    const end = elementEnd(value, cursor, 'li');
    if (end < 0) return false;
    itemCount += 1;
    cursor = end;
  }
  return false;
}

/** True only when the complete document is one UL with direct LI children. */
export function isBlbHtml(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const content = value.trim();
  if (content !== value) return false;
  const root = firstOpeningTag(content);
  return root !== null
    && root.name === 'ul'
    && !TASK_LIST_DATA_TYPE.test(content.slice(0, root.end))
    && elementEnd(content, 0, 'ul') === content.length
    && hasOnlyDirectListItems(content, root);
}

/**
 * Split the small set of legacy flat block documents into one BLB label per
 * block. Each character is scanned a bounded number of times; malformed or
 * mixed documents return null and are wrapped as one rich label instead.
 */
function splitFlatBlocks(value: string): string[] | null {
  const blocks: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    while (/\s/.test(value[cursor] || '')) cursor += 1;
    if (cursor >= value.length) break;
    const tag = firstOpeningTag(value, cursor);
    if (!tag || !/^(?:p|h[1-6]|blockquote|pre)$/.test(tag.name)) return null;
    const end = elementEnd(value, cursor, tag.name);
    if (end < 0) return null;
    blocks.push(value.slice(cursor, end));
    cursor = end;
  }
  return blocks.length > 0 ? blocks : null;
}

function stripLeadingHeading(value: string): string {
  const content = value.trim();
  const tag = firstOpeningTag(content);
  if (!tag || tag.name !== 'h1') return content;
  const end = elementEnd(content, 0, 'h1');
  return end < 0 ? content : content.slice(end).trim();
}

/**
 * Normalize complete blip content to exactly one top-level unordered list.
 * Existing rich inline HTML is preserved inside list items; plain-text lines
 * become separate atomic labels. A mixed `<ul>...</ul><p>orphan</p>` document
 * is deliberately not accepted by the fast path and is wrapped as one label.
 */
export function ensureBlbHtml(value: unknown): string {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content) return EMPTY_BLB_HTML;
  if (isBlbHtml(content)) return content;
  // Angle brackets alone are normal prose (for example, "latency < 5 ms").
  // Treat the value as HTML only when it contains an actual opening tag.
  if (!/<[A-Za-z][^>]*>/.test(content)) return plainTextToBlbHtml(content);
  const blocks = splitFlatBlocks(content);
  if (blocks) return `<ul>${blocks.map((block) => `<li>${block}</li>`).join('')}</ul>`;
  const richCandidate = `<ul><li>${content}</li></ul>`;
  if (isBlbHtml(richCandidate)) return richCandidate;
  // Malformed markup must never make the normalizer violate its own
  // postcondition. Preserve it as escaped text when bounded parsing fails.
  return `<ul><li><p>${escapeBlbHtml(content)}</p></li></ul>`;
}

export function topicSeedHtml(title: string): string {
  return `<h1>${escapeBlbText(title.trim())}</h1>${EMPTY_BLB_HTML}`;
}

/** Keep the canonical topic title as H1 while making every body block BLB-shaped. */
export function ensureTopicBlbHtml(title: string, value: unknown): string {
  const content = typeof value === 'string' ? value.trim() : '';
  const body = content ? stripLeadingHeading(content) : '';
  return `<h1>${escapeBlbText(title.trim())}</h1>${ensureBlbHtml(body)}`;
}

/** True only for the canonical title H1 followed by one BLB body list. */
export function isTopicBlbHtml(title: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const content = value.trim();
  if (content !== value || title.trim().length === 0) return false;
  const heading = firstOpeningTag(content);
  if (!heading || heading.name !== 'h1') return false;
  const headingEnd = elementEnd(content, 0, 'h1');
  if (headingEnd < 0) return false;
  const closingStart = content.toLowerCase().lastIndexOf('</h1', headingEnd);
  if (closingStart < heading.end) return false;
  const headingText = content.slice(heading.end, closingStart);
  // Formatting marks and inline widgets create child tags. Topic titles stay
  // plain so metadata and collaborative H1 content cannot diverge.
  if (headingText.includes('<')) return false;
  if (decodeBlbText(headingText.trim()) !== title.trim()) return false;
  return isBlbHtml(content.slice(headingEnd));
}
