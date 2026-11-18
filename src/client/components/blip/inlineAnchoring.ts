/**
 * Decides whether a child blip is rendered INLINE (behind a [+] marker inside its parent's
 * text) or as a reply row under the parent.
 *
 * Why the marker check matters: a child created with Ctrl+Enter is a durable document with
 * an `anchorPosition`, but it is only reachable through the `[+]` marker saved in the
 * PARENT's HTML. If that marker never reached the parent's saved content (the editor crashed
 * between the POST and the autosave, a stale save overwrote it, or the parent was edited by
 * someone whose tab had not yet seen the marker) the child used to be filtered out of the
 * reply list as "inline" and rendered nowhere: alive in the database and invisible on the
 * page. Measured on the live database on 18 Nov 2026: 3 such blips in the tester's topic.
 * A child whose marker is missing is therefore shown as a reply row, after a short grace
 * period that covers the normal window in which the marker is still being persisted.
 */
export const ORPHAN_GRACE_MS = 30_000;

export function isInlineAnchored(
  child: { id: string; anchorPosition?: number | null; createdAt?: number },
  parentHtml: string | undefined | null,
  now: number = Date.now(),
): boolean {
  const hasMarker = Boolean(parentHtml && parentHtml.includes(child.id));
  if (hasMarker) return true;
  if (typeof child.anchorPosition !== 'number') return false;
  return now - Number(child.createdAt || 0) < ORPHAN_GRACE_MS;
}
