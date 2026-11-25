/**
 * Reconcile a topic reload with what THIS tab has itself written since the reload was requested.
 *
 * Why (measured 18 Nov 2026, "the child's editor is closed within a second and the typed text is lost"):
 * `load()` replaces the topic and the whole blip tree with the server's answer. A reload that was
 * requested BEFORE this tab created a child (or saved the topic with the new marker) and answered AFTER it
 * hands back the older state: the new child disappears from the tree (its editor is unmounted and the text
 * typed into it is lost), the marker disappears from the topic content, and only the next reload brings the
 * child back, as a brand new mount. Any socket event (this tab's own or a collaborator's) can start such a
 * reload at the wrong moment, and a slow link or a busy CPU widens the window.
 *
 * Fix: record this tab's own completed writes with the time they landed and, when a reload answer arrives,
 * keep every write that landed after the request started. Nothing is held back: a reload still applies in
 * full for everything this tab did not write itself.
 *
 * Pure functions (no React), unit tested in `topicLoadReconcile.test.ts`.
 */
import type { BlipData } from '../components/blip/RizzomaBlip';

export interface LocalWrites {
  /** Blips this tab created, keyed by id (parent and anchor are carried by the BlipData). */
  created: Map<string, { blip: BlipData; at: number }>;
  /** Blip bodies this tab saved successfully. */
  contents: Map<string, { content: string; at: number }>;
  /** The last topic title and content this tab saved successfully. */
  topic: { title: string; content: string; at: number } | null;
}

/** Local writes older than this can no longer be newer than any reload still in flight. */
export const LOCAL_WRITE_TTL_MS = 60_000;

export function createLocalWrites(): LocalWrites {
  return { created: new Map(), contents: new Map(), topic: null };
}

function prune(writes: LocalWrites, now: number): void {
  for (const [id, w] of writes.created) if (now - w.at > LOCAL_WRITE_TTL_MS) writes.created.delete(id);
  for (const [id, w] of writes.contents) if (now - w.at > LOCAL_WRITE_TTL_MS) writes.contents.delete(id);
  if (writes.topic && now - writes.topic.at > LOCAL_WRITE_TTL_MS) writes.topic = null;
}

export function recordCreatedBlip(writes: LocalWrites, blip: BlipData, now = Date.now()): void {
  prune(writes, now);
  writes.created.set(blip.id, { blip, at: now });
}

export function recordSavedBlipContent(writes: LocalWrites, blipId: string, content: string, now = Date.now()): void {
  prune(writes, now);
  writes.contents.set(blipId, { content, at: now });
}

export function recordSavedTopic(writes: LocalWrites, title: string, content: string, now = Date.now()): void {
  prune(writes, now);
  writes.topic = { title, content, at: now };
}

/** A blip was deleted on purpose: never put it back. */
export function forgetBlip(writes: LocalWrites, blipId: string): void {
  writes.created.delete(blipId);
  writes.contents.delete(blipId);
}

/**
 * Overlay this tab's own newer writes onto the freshly built (flat, not yet nested) blip map.
 * Returns true when anything was put back, which means the answer was older than this tab's own state and
 * the caller should reload once more.
 */
export function overlayLocalBlips(
  blipMap: Map<string, BlipData>,
  writes: LocalWrites,
  requestStartedAt: number,
  fallbackContributors: BlipData['contributors'] | ((blip: BlipData) => BlipData['contributors']) = [],
): boolean {
  let applied = false;
  for (const [id, w] of writes.created) {
    if (w.at < requestStartedAt || blipMap.has(id)) continue;
    blipMap.set(id, {
      ...w.blip,
      childBlips: [],
      contributors: w.blip.contributors && w.blip.contributors.length
        ? w.blip.contributors
        : (typeof fallbackContributors === 'function' ? fallbackContributors(w.blip) : fallbackContributors),
    });
    applied = true;
  }
  for (const [id, w] of writes.contents) {
    if (w.at < requestStartedAt) continue;
    const loaded = blipMap.get(id);
    if (!loaded || loaded.content === w.content) continue;
    blipMap.set(id, { ...loaded, content: w.content });
    applied = true;
  }
  return applied;
}

/** The same for the topic itself: keep the title and content this tab saved after the request started. */
export function overlayLocalTopic<T extends { title?: string; content?: string }>(
  loaded: T,
  writes: LocalWrites,
  requestStartedAt: number,
): { topic: T; applied: boolean } {
  const w = writes.topic;
  if (!w || w.at < requestStartedAt) return { topic: loaded, applied: false };
  if (loaded.content === w.content && loaded.title === w.title) return { topic: loaded, applied: false };
  return { topic: { ...loaded, title: w.title, content: w.content }, applied: true };
}
