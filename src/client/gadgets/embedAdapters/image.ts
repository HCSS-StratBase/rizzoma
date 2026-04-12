import type { GadgetUrlResolution } from '../types';
import { buildImageHtml, parseHttpUrl } from './common';

export function resolveImageEmbed(raw: string): GadgetUrlResolution {
  const url = parseHttpUrl(raw);
  return { normalizedUrl: url.toString(), html: buildImageHtml(url.toString()) };
}
