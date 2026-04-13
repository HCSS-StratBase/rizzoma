type InlineMarkerSource = {
  id: string;
  anchorPosition?: number | null;
  isRead?: boolean;
};

const hasMarkerFor = (container: HTMLElement, blipId: string): boolean =>
  !!container.querySelector(`[data-blip-thread="${CSS.escape(blipId)}"]`);

const createMarker = (doc: Document, blipId: string, hasUnread: boolean, isExpanded: boolean): HTMLElement => {
  const marker = doc.createElement('span');
  const classes = ['blip-thread-marker'];
  if (hasUnread) classes.push('has-unread');
  if (isExpanded) classes.push('expanded');
  marker.className = classes.join(' ');
  marker.setAttribute('data-blip-thread', blipId);
  marker.textContent = isExpanded ? '\u2212' : '+'; // − when expanded, + when collapsed
  return marker;
};

const insertMarkerAtOffset = (container: HTMLElement, offset: number, blipId: string, hasUnread: boolean, isExpanded = false): void => {
  const doc = container.ownerDocument;
  const safeOffset = Math.max(0, offset);
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  let pos = 0;
  while (current) {
    const text = current.nodeValue || '';
    const nextPos = pos + text.length;
    if (safeOffset <= nextPos) {
      const index = Math.max(0, safeOffset - pos);
      const beforeText = text.slice(0, index);
      const afterText = text.slice(index);
      const beforeNode = doc.createTextNode(beforeText);
      const afterNode = doc.createTextNode(afterText);
      const marker = createMarker(doc, blipId, hasUnread, isExpanded);
      const parent = current.parentNode;
      if (!parent) break;
      parent.insertBefore(beforeNode, current);
      parent.insertBefore(marker, current);
      parent.insertBefore(afterNode, current);
      parent.removeChild(current);
      return;
    }
    pos = nextPos;
    current = walker.nextNode();
  }

  // If no text node or offset beyond text length, append at end.
  container.appendChild(createMarker(doc, blipId, hasUnread, isExpanded));
};

export function injectInlineMarkers(html: string, inlineChildren: InlineMarkerSource[], expandedSet?: Set<string>): string {
  if (!html) return html;
  if (typeof document === 'undefined') return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  // Build a set of known child IDs for orphan detection
  const knownChildIds = new Set(inlineChildren.map(c => c.id));

  // Build a lookup for per-child unread state so we can hydrate
  // the `.has-unread` class on BOTH pre-existing markers (baked
  // into the HTML blob) and newly-injected markers. Without this
  // hydration pass, markers that live in the stored topic.content
  // never show green even when the child blip is unread — the
  // "why don't I see any green in read mode?" bug from the user's
  // 2026-04-14 smoke test (task #39).
  const unreadById = new Map<string, boolean>();
  inlineChildren.forEach((c) => {
    unreadById.set(c.id, c.isRead === false);
  });

  // Update pre-existing markers in the HTML (from original Rizzoma content)
  // — sync expanded state, mark orphaned markers, hydrate unread state
  const existingMarkers = container.querySelectorAll('.blip-thread-marker');
  existingMarkers.forEach(marker => {
    const threadId = marker.getAttribute('data-blip-thread');
    if (!threadId) return;
    if (knownChildIds.has(threadId)) {
      // Known child — update expanded state
      const isExpanded = expandedSet?.has(threadId) ?? false;
      if (isExpanded) {
        marker.classList.add('expanded');
        marker.textContent = '\u2212'; // −
      } else {
        marker.classList.remove('expanded');
        marker.textContent = '+';
      }
      // Hydrate unread state — `.has-unread` drives the green fill
      // in BlipThread.css. Toggled based on the child's current
      // isRead state from the parent's inlineChildren source.
      if (unreadById.get(threadId) === true) {
        marker.classList.add('has-unread');
      } else {
        marker.classList.remove('has-unread');
      }
    } else {
      // Orphaned marker — references a child that doesn't exist in this blip
      marker.classList.add('orphaned');
    }
  });

  // Inject new markers for children that don't have one yet
  if (inlineChildren.length > 0) {
    inlineChildren.forEach((child) => {
      const anchor = child.anchorPosition;
      if (typeof anchor !== 'number' || !Number.isFinite(anchor)) return;
      if (hasMarkerFor(container, child.id)) return;
      const isExpanded = expandedSet?.has(child.id) ?? false;
      insertMarkerAtOffset(container, anchor, child.id, child.isRead === false, isExpanded);
    });
  }

  // Remove stale portal containers, then add fresh ones for expanded markers
  container.querySelectorAll('.inline-child-portal').forEach(el => el.remove());
  if (expandedSet && expandedSet.size > 0) {
    expandedSet.forEach(childId => {
      if (!knownChildIds.has(childId)) return;
      const marker = container.querySelector(`.blip-thread-marker[data-blip-thread="${CSS.escape(childId)}"]`);
      if (!marker) return;
      const portal = document.createElement('div');
      portal.className = 'inline-child-portal';
      portal.setAttribute('data-portal-child', childId);
      // Place portal IMMEDIATELY after the marker's containing
      // inline block (the <p> or <h1> the marker lives in), not at
      // the end of the outermost <li>. Without this the expanded
      // child renders below all nested sibling content of the
      // containing `<li>` — e.g. if the marker is on the header
      // line of "First steps in Rizzoma" which has a nested <ol>
      // of 4 numbered steps, the expansion would appear AFTER all
      // 4 steps instead of directly under the header line.
      // Walk up from the marker until we hit the nearest block
      // ancestor that has a parentNode, then insert the portal as
      // its next sibling.
      const blockAncestor = marker.closest('p, h1, h2, h3, h4, h5, h6');
      if (blockAncestor && blockAncestor.parentNode) {
        blockAncestor.parentNode.insertBefore(portal, blockAncestor.nextSibling);
      } else {
        // Fall back to the old behavior for markers in bare <li>
        // (no wrapping <p>) or other unusual structures.
        const li = marker.closest('li');
        if (li && li.parentNode) {
          li.parentNode.insertBefore(portal, li.nextSibling);
        } else if (marker.parentNode) {
          marker.parentNode.insertBefore(portal, marker.nextSibling);
        }
      }
    });
  }

  return container.innerHTML;
}
