/**
 * Native fractal-render — content lookup builder.
 *
 * WHY THIS EXISTS (Phase 1 recursion fix, 2026-07-16).
 * The native renderer descends into a child only where the parent's
 * ContentArray contains a BLIP element. The parser (parser.ts) emits a BLIP
 * element ONLY where the stored HTML carries a `data-blip-thread` marker span —
 * but the React/TipTap store keeps nesting as (parentId) relationships and
 * injects those markers at RENDER time, not at save time. So a blip's persisted
 * HTML usually has NO marker for its children, and the earlier native lookup —
 * `parseHtmlToContentArray(b.content)` per blip — produced a ContentArray with
 * no BLIP elements. The read path therefore stopped at whatever shallow level
 * happened to have a marker persisted (measured: depth 2), instead of rendering
 * the full stored fractal.
 *
 * This builder ignores persisted markers entirely and synthesizes exactly one
 * BLIP element per child from the authoritative parent→child tree the server
 * returns. Result: the fractal renders to full depth regardless of what markers
 * are (or aren't) in the HTML.
 *
 * Scope note: children are appended after the parent's own content, in the
 * given order (callers pass them pre-sorted, e.g. by createdAt). Honoring an
 * inline `anchorPosition` (placing a child mid-line at a character offset) is a
 * Phase-2 / edit-path concern — and exactly the drift-prone thing the native
 * model exists to avoid. Phase 1 proves full-depth READ render.
 */

import { parseHtmlToContentArray } from './parser';
import { ContentArray, ModelType } from './types';

export interface NativeBlipInput {
  /** Blip id (topic id for the root blip). */
  id: string;
  /** Stored HTML body of the blip. */
  content: string;
  /**
   * Parent blip id, or null for a top-level blip. Top-level blips are treated
   * as children of `rootId` so they render under the topic root.
   */
  parentId: string | null;
}

/**
 * Build a synchronous `blipId → ContentArray` lookup for the native renderer.
 *
 * @param rootId  The topic/root blip id — stands in as the parent of any blip
 *                whose `parentId` is null.
 * @param blips   Every blip in the wave, INCLUDING the root blip itself,
 *                pre-sorted in the order children should render.
 */
export const buildNativeContentLookup = (
  rootId: string,
  blips: NativeBlipInput[],
): ((id: string) => ContentArray | null) => {
  // parent id → ordered child ids
  const childrenOf = new Map<string, string[]>();
  for (const b of blips) {
    if (b.id === rootId) continue; // the root is nobody's child
    const parent = b.parentId || rootId;
    const list = childrenOf.get(parent);
    if (list) list.push(b.id);
    else childrenOf.set(parent, [b.id]);
  }

  // Materialize every blip's content up front so the returned lookup is
  // synchronous (the renderer calls it inside its walk).
  const cache = new Map<string, ContentArray>();
  for (const b of blips) {
    // Drop any BLIP elements that came from stale persisted markers so a child
    // is never rendered twice (once from the marker, once from the tree).
    const base: ContentArray = b.content
      ? parseHtmlToContentArray(b.content).filter((el) => el.type !== ModelType.BLIP)
      : [];
    for (const childId of childrenOf.get(b.id) || []) {
      base.push({ type: ModelType.BLIP, text: ' ', params: { id: childId } });
    }
    cache.set(b.id, base);
  }

  return (id: string): ContentArray | null => cache.get(id) ?? null;
};
