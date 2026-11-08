import type { GadgetUrlResolution } from '../types';
import { buildIframeHtml, parseHttpUrl } from './common';

export function resolveSpreadsheetEmbed(raw: string): GadgetUrlResolution {
  const url = parseHttpUrl(raw);
  if (!(url.hostname === 'docs.google.com' && url.pathname.includes('/spreadsheets/'))) {
    throw new Error('Use a Google Sheets URL.');
  }

  const normalizedPath = url.pathname.replace(/\/(edit|view)(\/.*)?$/, '/preview');
  const normalizedUrl = `https://docs.google.com${normalizedPath}`;
  return { normalizedUrl, html: buildIframeHtml(normalizedUrl, '720', '420') };
}
