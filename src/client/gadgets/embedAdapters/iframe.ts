import type { GadgetUrlResolution } from '../types';
import { buildIframeHtml, parseHttpUrl } from './common';

export function resolveIframeEmbed(raw: string): GadgetUrlResolution {
  const url = parseHttpUrl(raw);
  return { normalizedUrl: url.toString(), html: buildIframeHtml(url.toString()) };
}
