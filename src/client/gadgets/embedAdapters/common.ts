function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildIframeHtml(url: string, width = '600', height = '400') {
  return `<iframe width="${width}" height="${height}" src="${escapeHtmlAttr(url)}" frameborder="0" allowfullscreen></iframe>`;
}

export function buildImageHtml(url: string) {
  return `<img src="${escapeHtmlAttr(url)}" alt="image" />`;
}

export function parseHttpUrl(raw: string, { allowLocalhost = true }: { allowLocalhost?: boolean } = {}) {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a full URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }

  if (!allowLocalhost && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    throw new Error('Localhost URLs are not allowed for this gadget.');
  }

  return url;
}
