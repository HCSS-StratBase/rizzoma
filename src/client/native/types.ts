/**
 * Native fractal-render — content array type definitions.
 *
 * Direct port of the original Rizzoma's content model:
 *   - share/parser.coffee  (the HTML <-> array conversion)
 *   - editor/model.coffee  (the type/params/text record shape)
 *
 * A blip's content is a flat ordered array of typed records.
 * The renderer (renderer.ts) walks that array once and builds DOM.
 *
 * Position is structural — a BLIP element's anchor IS its index in the
 * array, between the surrounding LINE elements. Drift is impossible by
 * construction. There is no separate numeric "anchorPosition" field.
 *
 * See docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md for the
 * full model rationale and source citations.
 */

/** Element type discriminator — matches original's ModelType enum. */
export const ModelType = {
  TEXT: 'text',
  LINE: 'line',
  BLIP: 'blip',
  ATTACHMENT: 'attachment',
} as const;

export type ModelTypeValue = typeof ModelType[keyof typeof ModelType];

/** Per-text-element styling params (subset of original's TextLevelParams). */
export interface TextParams {
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  struckthrough?: boolean;
  url?: string;
  bgColor?: string;
  fgColor?: string;
}

/** Per-line params (matches original's LineLevelParams). */
export interface LineParams {
  /** Bulleted-list nesting level: 0 = top, 1 = nested, ... */
  bulleted?: number;
  /** Numbered-list nesting level (alternative to bulleted). */
  numbered?: number;
  /** Heading level (1-6). */
  heading?: number;
}

/** A single styled text run. */
export interface TextEl {
  type: typeof ModelType.TEXT;
  text: string;
  params: TextParams;
}

/** A line break / paragraph boundary. Carries optional list/heading params. */
export interface LineEl {
  type: typeof ModelType.LINE;
  /** Always ' ' (single space) — matches original's __insertLineOp. */
  text: ' ';
  params: LineParams;
}

/** A reference to a child blip. Position is the array index between LINEs. */
export interface BlipEl {
  type: typeof ModelType.BLIP;
  /** Always ' ' — placeholder; real content is in the referenced blip. */
  text: ' ';
  params: {
    /** Server-side blip ID (waveId:blipId or just blipId, depending on server). */
    id: string;
    /** Thread ID — multiple BLIPs with same threadId batch into one BlipThread. */
    threadId?: string;
  };
}

/** An inline image / attachment (rare; survives the port for completeness). */
export interface AttachmentEl {
  type: typeof ModelType.ATTACHMENT;
  text: ' ';
  params: {
    url: string;
  };
}

/** Discriminated union of all element types. */
export type ContentElement = TextEl | LineEl | BlipEl | AttachmentEl;

/** A blip's content as the original modeled it. */
export type ContentArray = ContentElement[];

/** Type guards for the discriminator. */
export const isText = (e: ContentElement): e is TextEl => e.type === ModelType.TEXT;
export const isLine = (e: ContentElement): e is LineEl => e.type === ModelType.LINE;
export const isBlip = (e: ContentElement): e is BlipEl => e.type === ModelType.BLIP;
export const isAttachment = (e: ContentElement): e is AttachmentEl => e.type === ModelType.ATTACHMENT;
