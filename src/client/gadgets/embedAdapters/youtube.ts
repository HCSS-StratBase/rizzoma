import type { GadgetUrlResolution } from '../types';
import { buildIframeHtml, parseHttpUrl } from './common';

function extractYouTubeId(url: URL) {
  if (url.hostname === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0] || null;
  }

  if (url.hostname.endsWith('youtube.com')) {
    if (url.pathname === '/watch') {
      return url.searchParams.get('v');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed' || parts[0] === 'shorts') {
      return parts[1] || null;
    }
  }

  return null;
}

export function resolveYouTubeEmbed(raw: string): GadgetUrlResolution {
  const url = parseHttpUrl(raw, { allowLocalhost: false });
  if (!(url.hostname === 'youtu.be' || url.hostname.endsWith('youtube.com'))) {
    throw new Error('Use a YouTube or youtu.be URL.');
  }

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    throw new Error('Could not determine the YouTube video ID.');
  }

  const normalizedUrl = `https://www.youtube.com/embed/${videoId}`;
  return { normalizedUrl, html: buildIframeHtml(normalizedUrl, '560', '315') };
}
