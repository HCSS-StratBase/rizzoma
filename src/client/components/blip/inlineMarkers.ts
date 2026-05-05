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

  // Update pre-existing markers in the HTML (from original Rizzoma content)
  // — sync expanded state, mark orphaned markers
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
    } else {
      // Orphaned marker — references a child that doesn't exist in this blip
      marker.classList.add('orphaned');
    }
  });

  // Marker insertion based on numeric anchorPosition is intentionally REMOVED
  // (260505). The marker's PRESENCE in the parent's saved HTML is now the
  // canonical anchor — matches original Rizzoma's structural model. The
  // numeric anchorPosition field is retained as a presence-vs-absence
  // discriminator (typeof === 'number' → inline child, else → list child) but
  // its value is no longer used to position a fallback marker. Children
  // without a marker in the saved HTML get rendered via createPortal at the
  // BlipThreadNode portal anchor (in edit mode) or via renderInlineHtml's
  // orphan-followups loop (in parity view mode); they do NOT get auto-injected
  // at a guessed text offset, since that drifted whenever the user edited
  // the parent's text before the marker.
  // Sentinel reference kept so unused-arg lint stays happy without
  // changing the public API:
  void inlineChildren;
  void hasMarkerFor;
  void insertMarkerAtOffset;

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
      // Place portal after the closest block parent (li or p) so child renders below the line
      const li = marker.closest('li');
      if (li) {
        li.appendChild(portal);
      } else {
        const p = marker.closest('p');
        if (p && p.parentNode) {
          p.parentNode.insertBefore(portal, p.nextSibling);
        } else if (marker.parentNode) {
          marker.parentNode.insertBefore(portal, marker.nextSibling);
        }
      }
    });
  }

  return container.innerHTML;
}
