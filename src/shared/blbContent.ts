/** Canonical creation-time HTML for the Bullet-Label-Blip contract. */
export const EMPTY_BLB_HTML = '<ul><li><p></p></li></ul>';

export function escapeBlbHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
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

function flatBlockHtmlToBlbHtml(value: string): string | null {
  const blocks = Array.from(value.matchAll(/<(p|h[1-6]|blockquote|pre)\b[^>]*>[\s\S]*?<\/\1>/gi));
  if (blocks.length === 0) return null;
  const withoutBlocks = value.replace(/<(p|h[1-6]|blockquote|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, '').trim();
  if (withoutBlocks) return null;
  return `<ul>${blocks.map((match) => `<li>${match[0]}</li>`).join('')}</ul>`;
}

/**
 * Normalize newly-created blip content to a top-level unordered list.
 * Existing rich inline HTML is preserved inside list items; plain-text lines
 * become separate atomic labels.
 */
export function ensureBlbHtml(value: unknown): string {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content) return EMPTY_BLB_HTML;
  if (/^<ul(?:\s|>)/i.test(content)) return content;
  // Angle brackets alone are normal prose (for example, "latency < 5 ms").
  // Treat the value as HTML only when it contains an actual opening tag.
  if (!/<[A-Za-z][^>]*>/.test(content)) return plainTextToBlbHtml(content);
  return flatBlockHtmlToBlbHtml(content) || `<ul><li>${content}</li></ul>`;
}

export function topicSeedHtml(title: string): string {
  return `<h1>${escapeBlbHtml(title.trim())}</h1>${EMPTY_BLB_HTML}`;
}

/** Keep the topic title as H1 while making every body block BLB-shaped. */
export function ensureTopicBlbHtml(title: string, value: unknown): string {
  const content = typeof value === 'string' ? value.trim() : '';
  if (!content) return topicSeedHtml(title);

  const heading = content.match(/^(<h1\b[^>]*>[\s\S]*?<\/h1>)([\s\S]*)$/i);
  if (heading) return `${heading[1]}${ensureBlbHtml(heading[2])}`;
  return `<h1>${escapeBlbHtml(title.trim())}</h1>${ensureBlbHtml(content)}`;
}
