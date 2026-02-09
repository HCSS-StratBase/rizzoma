/**
 * Simple word-level diff for HTML content.
 * Strips HTML tags for comparison, outputs inline <ins>/<del> markup.
 */
export function computeDiff(oldText: string, newText: string): string {
  if (!oldText) return newText;
  if (!newText) return '<del style="background:#ffcccc">' + oldText + '</del>';

  const stripHtml = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  const oldPlain = stripHtml(oldText);
  const newPlain = stripHtml(newText);

  if (oldPlain === newPlain) return newText;

  const oldWords = oldPlain.split(/\s+/);
  const newWords = newPlain.split(/\s+/);

  const result: string[] = [];
  let i = 0, j = 0;

  while (i < oldWords.length || j < newWords.length) {
    if (i >= oldWords.length) {
      result.push(`<ins style="background:#ccffcc">${newWords[j]}</ins>`);
      j++;
    } else if (j >= newWords.length) {
      result.push(`<del style="background:#ffcccc">${oldWords[i]}</del>`);
      i++;
    } else if (oldWords[i] === newWords[j]) {
      result.push(newWords[j]);
      i++;
      j++;
    } else {
      const foundInNew = newWords.slice(j).indexOf(oldWords[i]);
      if (foundInNew > 0 && foundInNew < 5) {
        for (let k = 0; k < foundInNew; k++) {
          result.push(`<ins style="background:#ccffcc">${newWords[j + k]}</ins>`);
        }
        j += foundInNew;
      } else {
        result.push(`<del style="background:#ffcccc">${oldWords[i]}</del>`);
        result.push(`<ins style="background:#ccffcc">${newWords[j]}</ins>`);
        i++;
        j++;
      }
    }
  }

  return result.join(' ');
}
