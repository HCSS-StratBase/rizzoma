import type { GadgetType, GadgetUrlResolution } from '../types';
import { resolveIframeEmbed } from './iframe';
import { resolveImageEmbed } from './image';
import { resolveSpreadsheetEmbed } from './spreadsheet';
import { resolveYouTubeEmbed } from './youtube';

export function resolveGadgetUrl(type: GadgetType, raw: string): GadgetUrlResolution {
  switch (type) {
    case 'youtube':
      return resolveYouTubeEmbed(raw);
    case 'spreadsheet':
      return resolveSpreadsheetEmbed(raw);
    case 'iframe':
      return resolveIframeEmbed(raw);
    case 'image':
      return resolveImageEmbed(raw);
    default:
      throw new Error('This gadget does not accept a URL.');
  }
}
