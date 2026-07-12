export type BlipPage<T> = {
  blips?: T[];
  nextBookmark?: string | null;
};

/** Collect every CouchDB bookmark page without silently losing descendants. */
export async function collectBlipPages<T>(
  firstPage: BlipPage<T>,
  fetchNext: (bookmark: string) => Promise<BlipPage<T>>,
  options: { maxPages?: number; maxItems?: number } = {},
): Promise<T[]> {
  const maxPages = options.maxPages ?? 200;
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
  const collected = [...(Array.isArray(firstPage.blips) ? firstPage.blips : [])];
  const seenBookmarks = new Set<string>();
  let bookmark = typeof firstPage.nextBookmark === 'string' && firstPage.nextBookmark
    ? firstPage.nextBookmark
    : null;
  let pageCount = 1;

  while (bookmark && collected.length < maxItems) {
    if (seenBookmarks.has(bookmark)) throw new Error('blip_pagination_repeated_bookmark');
    if (pageCount >= maxPages) throw new Error('blip_pagination_limit_exceeded');
    seenBookmarks.add(bookmark);
    const page = await fetchNext(bookmark);
    collected.push(...(Array.isArray(page.blips) ? page.blips : []));
    bookmark = typeof page.nextBookmark === 'string' && page.nextBookmark
      ? page.nextBookmark
      : null;
    pageCount += 1;
  }

  return collected.slice(0, maxItems);
}
