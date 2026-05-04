import type { ReactNode } from 'react';
import { Fragment, createElement } from 'react';

type InlineChildLike = {
  id: string;
  anchorPosition?: number | null;
  isRead?: boolean;
};

const ATTR_RENAMES: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  cellspacing: 'cellSpacing',
  cellpadding: 'cellPadding',
  rowspan: 'rowSpan',
  colspan: 'colSpan',
  contenteditable: 'contentEditable',
  spellcheck: 'spellCheck',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  crossorigin: 'crossOrigin',
};

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const styleStringToObject = (str: string): Record<string, string> => {
  const out: Record<string, string> = {};
  str.split(';').forEach(decl => {
    const idx = decl.indexOf(':');
    if (idx < 0) return;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop) return;
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  });
  return out;
};

const elementToProps = (el: Element): Record<string, unknown> => {
  const props: Record<string, unknown> = {};
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    const value = attr.value;
    if (name === 'style') {
      props['style'] = styleStringToObject(value);
      continue;
    }
    const reactName = ATTR_RENAMES[name] ?? (name.startsWith('data-') || name.startsWith('aria-') ? name : name);
    props[reactName] = value;
  }
  return props;
};

const renderMarker = (el: Element, blipId: string, hasUnread: boolean, isExpanded: boolean): ReactNode => {
  const classes = ['blip-thread-marker'];
  if (hasUnread) classes.push('has-unread');
  if (isExpanded) classes.push('expanded');
  // Preserve any existing extra classes (e.g., orphaned)
  const existingCls = el.getAttribute('class') || '';
  existingCls.split(/\s+/).forEach(c => {
    if (c && !classes.includes(c) && c !== 'blip-thread-marker' && c !== 'expanded' && c !== 'has-unread') {
      classes.push(c);
    }
  });
  return createElement(
    'span',
    {
      className: classes.join(' '),
      'data-blip-thread': blipId,
    },
    isExpanded ? '−' : '+',
  );
};

export interface InlineHtmlRenderOptions {
  html: string;
  inlineChildren: InlineChildLike[];
  expandedSet: Set<string>;
  /**
   * IDs of children that have ever been expanded this session — they stay mounted
   * after collapse so React state (draft input, scroll, focus) is preserved on
   * re-expand, matching original Rizzoma's CSS-only fold (blip_thread.coffee fold/unfold
   * just toggles a `folded` class on the persistent BlipThread DOM node).
   * If undefined, falls back to expandedSet (mount-on-expand, unmount-on-collapse).
   */
  everMountedSet?: Set<string>;
  renderInlineChild: (childId: string) => ReactNode;
}

/**
 * Walks the saved blip HTML and emits a React tree where:
 *   - .blip-thread-marker spans are rendered as React <span> with current expanded/unread state
 *   - For each expanded marker, the corresponding inline child is rendered as a React node
 *     placed RIGHT AFTER the marker's containing block parent (li or p), matching rizzoma.com's
 *     "child blip nests inside the bullet" structure.
 *   - All other nodes are converted via a recursive HTMLElement → React.createElement walk.
 *
 * No portals. No useLayoutEffect DOM mutation. Single React-owned tree.
 */
export function renderInlineHtml(opts: InlineHtmlRenderOptions): ReactNode {
  const { html, inlineChildren, expandedSet, everMountedSet, renderInlineChild } = opts;
  if (!html) return null;
  if (typeof document === 'undefined') return null;

  const childById = new Map(inlineChildren.map(c => [c.id, c] as const));
  const knownIds = new Set(inlineChildren.map(c => c.id));
  // Mount any child that's ever been expanded this session, OR is currently
  // expanded. Never unmount — collapse is a CSS-only state change.
  const mountedSet = everMountedSet ?? expandedSet;

  // Parse + insert markers for any anchored child without a pre-existing marker.
  const container = document.createElement('div');
  container.innerHTML = html;
  inlineChildren.forEach(child => {
    const anchor = child.anchorPosition;
    if (typeof anchor !== 'number' || !Number.isFinite(anchor)) return;
    if (container.querySelector(`[data-blip-thread="${CSS.escape(child.id)}"]`)) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    let pos = 0;
    const safe = Math.max(0, anchor);
    while (node) {
      const text = node.nodeValue || '';
      const next = pos + text.length;
      if (safe <= next) {
        const idx = Math.max(0, safe - pos);
        const beforeText = text.slice(0, idx);
        const afterText = text.slice(idx);
        const beforeNode = document.createTextNode(beforeText);
        const afterNode = document.createTextNode(afterText);
        const marker = document.createElement('span');
        marker.className = 'blip-thread-marker';
        marker.setAttribute('data-blip-thread', child.id);
        marker.textContent = '+';
        const parent = node.parentNode;
        if (!parent) break;
        parent.insertBefore(beforeNode, node);
        parent.insertBefore(marker, node);
        parent.insertBefore(afterNode, node);
        parent.removeChild(node);
        break;
      }
      pos = next;
      node = walker.nextNode();
    }
  });

  // Track which markers are expanded and need a child placed after their block parent.
  // We walk the DOM and emit React nodes. When a block parent (li/p) finishes, if any
  // expanded marker lives inside it, we append the child's React node as a sibling.
  let keySeq = 0;
  const nextKey = () => `n${keySeq++}`;

  const childrenAlreadyPlaced = new Set<string>();

  const mountedMarkersInside = (el: Element): string[] => {
    const ids: string[] = [];
    el.querySelectorAll('.blip-thread-marker[data-blip-thread]').forEach(marker => {
      const id = marker.getAttribute('data-blip-thread') || '';
      if (!id || !knownIds.has(id)) return;
      // Mount if currently expanded OR previously expanded (preserve subtree on fold).
      if (!mountedSet.has(id)) return;
      if (childrenAlreadyPlaced.has(id)) return;
      ids.push(id);
    });
    return ids;
  };

  const walkNode = (node: Node): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.nodeValue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // Skip stale portal anchors from old injectInlineMarkers output.
    if (el.classList.contains('inline-child-portal')) {
      return null;
    }

    // Marker span — render with current expanded state.
    if (el.classList.contains('blip-thread-marker')) {
      const blipId = el.getAttribute('data-blip-thread') || '';
      const child = childById.get(blipId);
      const hasUnread = child?.isRead === false;
      const isExpanded = expandedSet.has(blipId) && knownIds.has(blipId);
      return renderMarker(el, blipId, hasUnread, isExpanded);
    }

    const props = elementToProps(el);
    props['key'] = nextKey();

    // Block-parent anchor: when a li / p contains expanded markers, render the
    // bullet content first, then append the inline child blip(s) as siblings
    // immediately AFTER. We do this by wrapping the li in a Fragment whose
    // children are [li, child1, child2, ...].
    const isBlockAnchor = tag === 'li' || tag === 'p';
    const expandedHere = isBlockAnchor ? mountedMarkersInside(el) : [];

    if (VOID_ELEMENTS.has(tag)) {
      const node = createElement(tag, props);
      if (expandedHere.length === 0) return node;
      const followups = expandedHere.map(id => {
        childrenAlreadyPlaced.add(id);
        const isCollapsed = !expandedSet.has(id);
        return createElement(
          'div',
          {
            key: `child-${id}`,
            className: `inline-child-expanded${isCollapsed ? ' inline-child-collapsed' : ''}`,
            'data-inline-child': id,
            'data-collapsed': isCollapsed ? 'true' : 'false',
          },
          renderInlineChild(id),
        );
      });
      return createElement(Fragment, { key: nextKey() }, [node, ...followups]);
    }

    const childNodes = Array.from(el.childNodes).map(walkNode);
    const reactNode = createElement(tag, props, ...childNodes);

    if (expandedHere.length === 0) {
      return reactNode;
    }

    if (tag === 'li') {
      // For <li>, place the inline child INSIDE the li (after its content) so
      // it inherits the bullet's nesting context. This matches rizzoma.com's
      // structure where blip-thread is a child of the LI.
      const followups = expandedHere.map(id => {
        childrenAlreadyPlaced.add(id);
        const isCollapsed = !expandedSet.has(id);
        return createElement(
          'div',
          {
            key: `child-${id}`,
            className: `inline-child-expanded${isCollapsed ? ' inline-child-collapsed' : ''}`,
            'data-inline-child': id,
            'data-collapsed': isCollapsed ? 'true' : 'false',
          },
          renderInlineChild(id),
        );
      });
      const liChildren = [...childNodes, ...followups];
      return createElement(tag, props, ...liChildren);
    }

    // For <p>, place after the paragraph as siblings.
    const followups = expandedHere.map(id => {
      childrenAlreadyPlaced.add(id);
      return createElement(
        'div',
        { key: `child-${id}`, className: 'inline-child-expanded', 'data-inline-child': id },
        renderInlineChild(id),
      );
    });
    return createElement(Fragment, { key: nextKey() }, [reactNode, ...followups]);
  };

  const topNodes = Array.from(container.childNodes).map(walkNode);

  // Any mounted child that didn't find an in-line position (e.g., marker missing
  // entirely, anchor outside the rendered HTML) — render at the end so it's still
  // visible rather than silently dropped.
  const orphanFollowups: ReactNode[] = [];
  mountedSet.forEach(id => {
    if (!knownIds.has(id)) return;
    if (childrenAlreadyPlaced.has(id)) return;
    childrenAlreadyPlaced.add(id);
    const isCollapsed = !expandedSet.has(id);
    orphanFollowups.push(
      createElement(
        'div',
        {
          key: `orphan-child-${id}`,
          className: `inline-child-expanded inline-child-orphan${isCollapsed ? ' inline-child-collapsed' : ''}`,
          'data-inline-child': id,
          'data-collapsed': isCollapsed ? 'true' : 'false',
        },
        renderInlineChild(id),
      ),
    );
  });

  return createElement(Fragment, null, ...topNodes, ...orphanFollowups);
}
