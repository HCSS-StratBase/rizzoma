// Per-section author attribution for topic body blocks.
//
// The topic body is stored as a single HTML blob in `topic.content`,
// so we can't derive per-block authorship from the data model alone.
// Instead we keep a sidecar `topic.sectionAttribution: Record<hash,
// {authorId, updatedAt}>` that the client maintains on save.
//
// Stamping algorithm: on save, compute a text-hash for every top-level
// block + every <li> descendant in the old and new content. For each
// new hash that wasn't in old, stamp with the current user + now. For
// each old hash that's still in new, carry forward the existing entry.
// For hashes that disappeared, drop them.
//
// Block keys are text-hashes rather than path-based indices so block
// reordering doesn't invalidate attribution. Paragraph edits produce
// a new hash and get stamped; untouched blocks keep their original
// author + date. This matches the legacy Rizzoma feel where each
// section shows "who last touched this" without needing a full CRDT
// diff of the Y.js update log.

export type SectionAttributionEntry = {
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  updatedAt: number;
};

export type SectionAttributionMap = Record<string, SectionAttributionEntry>;

// Small, deterministic non-cryptographic hash (djb2 xor) — plenty for
// distinguishing block texts within a single topic. Returns a base36
// string so it's compact in JSON.
export function hashBlockText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h) ^ normalized.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

// Extract the list of block texts (with their hashes) that we want to
// attribute. Top-level non-list children (<p>, <h1>) + every <li>
// descendant's OWN text (excluding nested <li> content so each list
// item hashes independently of its children).
export function extractBlockHashes(html: string): string[] {
  if (!html || typeof document === 'undefined') return [];
  const container = document.createElement('div');
  container.innerHTML = html;
  const hashes: string[] = [];
  for (const child of Array.from(container.children)) {
    const el = child as HTMLElement;
    const tag = el.tagName;
    if (tag === 'UL' || tag === 'OL') continue;
    const text = (el.textContent || '').trim();
    if (text) {
      const h = hashBlockText(text);
      if (h) hashes.push(h);
    }
  }
  container.querySelectorAll('li').forEach((li) => {
    const clone = li.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('li').forEach((nested) => nested.remove());
    clone.querySelectorAll('ul, ol').forEach((list) => list.remove());
    clone.querySelectorAll('.topic-section-author').forEach((badge) => badge.remove());
    const text = (clone.textContent || '').trim();
    if (text) {
      const h = hashBlockText(text);
      if (h) hashes.push(h);
    }
  });
  return hashes;
}

// Given the previous attribution map + old and new HTML, compute the
// next map. Untouched blocks keep their entry; new blocks get stamped
// with the current user; disappeared blocks are dropped.
export function diffAndStampAttribution(args: {
  prevAttribution: SectionAttributionMap | undefined;
  oldHtml: string;
  newHtml: string;
  currentUserId: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  now: number;
}): SectionAttributionMap {
  const { prevAttribution, oldHtml, newHtml, currentUserId, currentUserName, currentUserAvatar, now } = args;
  const oldHashes = new Set(extractBlockHashes(oldHtml));
  const newHashes = extractBlockHashes(newHtml);
  const newHashSet = new Set(newHashes);
  const next: SectionAttributionMap = {};
  for (const hash of newHashSet) {
    if (oldHashes.has(hash) && prevAttribution?.[hash]) {
      next[hash] = prevAttribution[hash];
    } else {
      next[hash] = {
        authorId: currentUserId,
        authorName: currentUserName,
        authorAvatar: currentUserAvatar,
        updatedAt: now,
      };
    }
  }
  return next;
}
