// Text formatting constants from original Rizzoma
export const TextLevelParams = {
  BOLD: 'T_BOLD',
  ITALIC: 'T_ITALIC', 
  STRUCKTHROUGH: 'T_STRUCKTHROUGH',
  UNDERLINED: 'T_UNDERLINED',
  BG_COLOR: 'T_BG_COLOR',
  URL: 'T_URL'
} as const;

export const LineLevelParams = {
  BULLETED: 'L_BULLETED',
  NUMBERED: 'L_NUMBERED'
} as const;

export const ModelType = {
  TEXT: 'TEXT',
  LINE: 'LINE',
  ATTACHMENT: 'ATTACHMENT',
  RECIPIENT: 'RECIPIENT',
  TASK_RECIPIENT: 'TASK_RECIPIENT',
  GADGET: 'GADGET',
  FILE: 'FILE',
  TAG: 'TAG',
  BLIP: 'BLIP'
} as const;

// Text formatting toolbar options
export interface TextFormattingOptions {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  backgroundColor?: string;
  url?: string;
  bulletList?: boolean;
  numberedList?: boolean;
}

// Gadget types supported by Rizzoma
export const GadgetTypes = {
  IMAGE: 'image',
  VIDEO: 'video',
  MAP: 'map',
  POLL: 'poll',
  EMBED: 'embed'
} as const;

// Default colors for text background
export const DEFAULT_BG_COLORS = [
  '#ffffff', // White (no color)
  '#ffd93d', // Yellow
  '#6bcf7f', // Green
  '#6495ed', // Blue
  '#e78284', // Red
  '#ba8cff', // Purple
  '#ff9a56', // Orange
  '#c0c0c0', // Gray
] as const;