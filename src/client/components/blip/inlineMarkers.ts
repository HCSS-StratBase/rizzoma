type InlineMarkerSource = {
  id: string;
  anchorPosition?: number | null;
  isRead?: boolean;
};

const hasMarkerFor = (container: HTMLElement, blipId: string): boolean =>
  !!container.querySelector(`[data-blip-thread="${CSS.escape(blipId)}"]`);

const createMarker = (doc: Document, blipId: string, hasUnread: boolean): HTMLElement => {
  const marker = doc.createElement('span');
  marker.className = `blip-thread-marker${hasUnread ? ' has-unread' : ''}`;
  marker.setAttribute('data-blip-thread', blipId);
  marker.textContent = '+';
  return marker;
};

const insertMarkerAtOffset = (container: HTMLElement, offset: number, blipId: string, hasUnread: boolean): void => {
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
      const marker = createMarker(doc, blipId, hasUnread);
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
  container.appendChild(createMarker(doc, blipId, hasUnread));
};

export function injectInlineMarkers(html: string, inlineChildren: InlineMarkerSource[]): string {
  if (!html) return html;
  if (!inlineChildren.length) return html;
  if (typeof document === 'undefined') return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  inlineChildren.forEach((child) => {
    const anchor = child.anchorPosition;
    if (typeof anchor !== 'number' || !Number.isFinite(anchor)) return;
    if (hasMarkerFor(container, child.id)) return;
    insertMarkerAtOffset(container, anchor, child.id, child.isRead === false);
  });

  return container.innerHTML;
}
