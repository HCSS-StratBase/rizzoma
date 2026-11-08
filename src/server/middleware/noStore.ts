import type { RequestHandler } from 'express';

/**
 * Middleware that sets `Cache-Control: no-store` on the response.
 *
 * Use this on any GET route whose body embeds per-user dynamic state
 * (unread counts, read/follow flags, mentions, ticket state, etc.).
 * Without it, Express's default weak ETag generation can collide
 * across back-to-back responses that happen to have the same body
 * length — the browser then sends `If-None-Match` with the stale
 * ETag, Express returns 304 with no body, and the browser replays
 * the cached body containing the OLD per-user state. Symptom: the
 * UI doesn't update after the user takes an action that should
 * have changed their per-user view of a resource.
 *
 * This is exactly the bug that caused the sidebar green bar to go
 * stale after mark-read (BUG #56, 2026-04-15). The fix there was
 * inline on `/api/topics`; this helper extracts the pattern so
 * every other at-risk endpoint can opt in with one line.
 *
 * Usage:
 *   import { noStore } from '../middleware/noStore.js';
 *   router.get('/', noStore, async (req, res) => { ... });
 */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
