/**
 * Native fractal-render — Y.js CRDT binding for the ContentArray model.
 *
 * Phase 3 (#54): bridges between our authoritative ContentArray (the
 * direct port of original Rizzoma's `editor/model.coffee`) and a Y.js
 * `Y.Array<Y.Map>` representation that all collaborators share.
 *
 * Why Y.Array<Y.Map> rather than Y.XmlFragment:
 *   - ContentArray is a flat ordered list of typed records (LINE / TEXT /
 *     BLIP / ATTACHMENT). That maps 1:1 to a Y.Array of Y.Maps where each
 *     Y.Map holds {type, text, params}.
 *   - Y.XmlFragment models nested XML (TipTap's native Collab type) — we
 *     keep that PER-BLIP for the editable content of each individual blip
 *     (TipTap's Collaboration extension binds to the per-blip Y.XmlFragment
 *     under the hood).
 *   - The OUTER tree (which blips exist, their relative order, their BLIP
 *     element references inside parents) is what this Y.Array<Y.Map>
 *     synchronizes. Per-blip body editing rides on TipTap's existing
 *     Y.XmlFragment plumbing — see CollaborativeProvider.ts.
 *
 * This file does NOT import TipTap or React. Pure Y.js + our types.
 * Phase 3 deliverable: cross-tab sync within 1 second + awareness.
 */

import * as Y from 'yjs';
import {
  ContentArray,
  ContentElement,
  ModelType,
  type LineParams,
  type TextParams,
} from './types';

// ─── Field name constants used inside Y.Map ────────────────────────────
const F_TYPE = 'type';
const F_TEXT = 'text';
const F_PARAMS = 'params';

// ─── ContentArray ↔ Y.Array<Y.Map> conversion ──────────────────────────

/**
 * Materialize a ContentArray into a fresh Y.Array<Y.Map>. Used at first
 * sync (when one client has authoritative state and others have empty Y.Doc).
 *
 * Each ContentElement becomes a Y.Map with three top-level keys: type,
 * text, params. The params is itself a Y.Map so individual fields (e.g.
 * `bulleted`, `bold`) can be updated without rewriting the whole record.
 */
export const elementToYMap = (el: ContentElement): Y.Map<unknown> => {
  const ymap = new Y.Map<unknown>();
  ymap.set(F_TYPE, el.type);
  ymap.set(F_TEXT, el.text);
  // params is a plain JSON object on the Y.Map (NOT a nested Y.Map).
  // Granular CRDT semantics aren't needed at the params level — params is
  // a small struct that's always replaced as a unit by edit operations
  // (toggle bold, set bullet level, etc.). Storing as a plain object gives
  // simpler API + full Y.js sync (whole-record updates atomic).
  ymap.set(F_PARAMS, { ...el.params });
  return ymap;
};

/** Read a Y.Map back into a ContentElement. */
export const yMapToElement = (ymap: Y.Map<unknown>): ContentElement => {
  const type = ymap.get(F_TYPE) as ContentElement['type'];
  const text = ymap.get(F_TEXT) as string;
  const params = (ymap.get(F_PARAMS) as Record<string, unknown>) || {};
  return { type, text, params: { ...params } } as ContentElement;
};

/** Replace the contents of `yarr` with the elements of `arr`, atomically. */
export const seedYArrayFromContent = (yarr: Y.Array<Y.Map<unknown>>, arr: ContentArray, doc?: Y.Doc): void => {
  const tx = (txn?: Y.Transaction) => {
    if (yarr.length > 0) yarr.delete(0, yarr.length);
    yarr.insert(0, arr.map(elementToYMap));
  };
  if (doc) {
    doc.transact(tx);
  } else {
    yarr.doc?.transact(tx) ?? tx();
  }
};

/** Snapshot the current ContentArray represented by a Y.Array<Y.Map>. */
export const yArrayToContentArray = (yarr: Y.Array<Y.Map<unknown>>): ContentArray => {
  const out: ContentArray = [];
  yarr.forEach((m) => out.push(yMapToElement(m)));
  return out;
};

// ─── Mutation helpers (run inside a Y.Doc transaction for atomicity) ───

/** Insert a BLIP element after the LINE at `insertAfterLineIdx` (or at end). */
export const insertBlipMarker = (
  yarr: Y.Array<Y.Map<unknown>>,
  blipId: string,
  insertAfterLineIdx: number,
  threadId?: string,
): void => {
  const target = Math.max(0, Math.min(insertAfterLineIdx + 1, yarr.length));
  yarr.insert(target, [elementToYMap({
    type: ModelType.BLIP,
    text: ' ',
    params: threadId ? { id: blipId, threadId } : { id: blipId },
  })]);
};

/** Insert a TEXT run at the given index. */
export const insertText = (
  yarr: Y.Array<Y.Map<unknown>>,
  text: string,
  idx: number,
  params: TextParams = {},
): void => {
  const target = Math.max(0, Math.min(idx, yarr.length));
  yarr.insert(target, [elementToYMap({
    type: ModelType.TEXT,
    text,
    params,
  })]);
};

/** Insert a LINE break at the given index. */
export const insertLine = (
  yarr: Y.Array<Y.Map<unknown>>,
  idx: number,
  params: LineParams = {},
): void => {
  const target = Math.max(0, Math.min(idx, yarr.length));
  yarr.insert(target, [elementToYMap({
    type: ModelType.LINE,
    text: ' ',
    params,
  })]);
};

/** Remove the element at `idx`. */
export const removeAt = (yarr: Y.Array<Y.Map<unknown>>, idx: number): void => {
  if (idx < 0 || idx >= yarr.length) return;
  yarr.delete(idx, 1);
};

// ─── Observation: subscribe to changes and produce ContentArray snapshots ─

export type ContentArrayListener = (snapshot: ContentArray) => void;

/**
 * Subscribe to all changes in the Y.Array — including deep changes to the
 * Y.Map params (bullet level, styling toggles). Returns an unsubscribe.
 *
 * The handler receives a freshly-materialized ContentArray. Callers can
 * pass this snapshot straight into the renderer for re-rendering.
 */
export const observeContent = (
  yarr: Y.Array<Y.Map<unknown>>,
  listener: ContentArrayListener,
): (() => void) => {
  const fire = () => listener(yArrayToContentArray(yarr));
  yarr.observeDeep(fire);
  return () => yarr.unobserveDeep(fire);
};

// ─── BlipDoc: per-topic Y.Doc helper ──────────────────────────────────

/**
 * One Y.Doc per topic. Holds the Y.Array<Y.Map> at key 'content'. Per-blip
 * editor content uses Y.XmlFragment under separate keys (set up by
 * TipTap's Collaboration extension elsewhere).
 */
export class TopicDoc {
  readonly doc: Y.Doc;
  readonly content: Y.Array<Y.Map<unknown>>;

  constructor(doc?: Y.Doc) {
    this.doc = doc || new Y.Doc();
    this.content = this.doc.getArray<Y.Map<unknown>>('content');
  }

  /** Replace content from a ContentArray (used for first-sync seeding). */
  seed(arr: ContentArray): void {
    seedYArrayFromContent(this.content, arr, this.doc);
  }

  /** Snapshot. */
  snapshot(): ContentArray {
    return yArrayToContentArray(this.content);
  }

  /** Subscribe to all content changes. */
  observe(listener: ContentArrayListener): () => void {
    return observeContent(this.content, listener);
  }

  /** Per-blip XmlFragment for TipTap Collaboration. Lazily created. */
  blipFragment(blipId: string): Y.XmlFragment {
    return this.doc.getXmlFragment(`blip:${blipId}`);
  }

  destroy(): void {
    this.doc.destroy();
  }
}
