/**
 * Simple word-level diff for HTML content.
 * Strips HTML tags via inert <template> parsing, HTML-escapes plain tokens,
 * and outputs inline <ins>/<del> markup.
 */
const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const stripHtml = (html: string): string => {
  if (!html) return '';
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return (tpl.content.textContent || '').trim();
};

export function computeDiff(oldText: string, newText: string): string {
  const oldPlain = stripHtml(oldText);
  const newPlain = stripHtml(newText);

  if (!oldPlain) return newText;
  if (!newPlain) return `<del style="background:#ffcccc">${escapeHtml(oldPlain)}</del>`;
  if (oldPlain === newPlain) return newText;

  const oldWords = oldPlain.split(/\s+/);
  const newWords = newPlain.split(/\s+/);

  const result: string[] = [];
  let i = 0, j = 0;

  while (i < oldWords.length || j < newWords.length) {
    if (i >= oldWords.length) {
      result.push(`<ins style="background:#ccffcc">${escapeHtml(newWords[j])}</ins>`);
      j++;
    } else if (j >= newWords.length) {
      result.push(`<del style="background:#ffcccc">${escapeHtml(oldWords[i])}</del>`);
      i++;
    } else if (oldWords[i] === newWords[j]) {
      result.push(escapeHtml(newWords[j]));
      i++;
      j++;
    } else {
      const foundInNew = newWords.slice(j).indexOf(oldWords[i]);
      if (foundInNew > 0 && foundInNew < 5) {
        for (let k = 0; k < foundInNew; k++) {
          result.push(`<ins style="background:#ccffcc">${escapeHtml(newWords[j + k])}</ins>`);
        }
        j += foundInNew;
      } else {
        result.push(`<del style="background:#ffcccc">${escapeHtml(oldWords[i])}</del>`);
        result.push(`<ins style="background:#ccffcc">${escapeHtml(newWords[j])}</ins>`);
        i++;
        j++;
      }
    }
  }

  return result.join(' ');
}
