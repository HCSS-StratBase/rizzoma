import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
  Fragment,
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sanitizeRichHtml } from '../../lib/sanitizeRichHtml';
import {
  formatTaskDate,
  loadTaskCompletionSnapshot,
  toggleTaskOnServer,
} from '../editor/extensions/TaskWidget';

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
  /** Authoritative completion state for task widgets in this saved HTML. */
  taskCompletions?: ReadonlyMap<string, boolean> | null;
  /** Task IDs the access-checked API allows this reader to toggle. */
  toggleableTaskIds?: ReadonlySet<string>;
  /** Task IDs with a server mutation already in flight. */
  pendingTaskIds?: ReadonlySet<string>;
  /** Server-authoritative, non-optimistic task toggle. */
  onTaskToggle?: (taskId: string) => void;
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
  const {
    html,
    inlineChildren,
    expandedSet,
    everMountedSet,
    renderInlineChild,
    taskCompletions,
    toggleableTaskIds,
    pendingTaskIds,
    onTaskToggle,
  } = opts;
  if (!html) return null;
  if (typeof document === 'undefined') return null;

  const childById = new Map(inlineChildren.map(c => [c.id, c] as const));
  const knownIds = new Set(inlineChildren.map(c => c.id));
  // Mount any child that's ever been expanded this session, OR is currently
  // expanded. Never unmount — collapse is a CSS-only state change.
  const mountedSet = everMountedSet ?? expandedSet;

  // Parse the parent's saved HTML. We do NOT inject new markers based on a
  // numeric anchorPosition field anymore — the marker's PRESENCE in the saved
  // HTML is the canonical anchor (matching original Rizzoma's structural
  // model in editor/renderer.coffee:107-113 where blip-thread elements live
  // in the parent's content array, no separate offset).
  //
  // If a child is in inlineChildren but has no marker in the parent's saved
  // HTML, it'll render via the orphan-followups loop at the bottom of this
  // function — visible but at the end of the parent rather than at a guessed
  // text-offset that would drift after parent edits.
  const container = document.createElement('div');
  container.innerHTML = sanitizeRichHtml(html);

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

    // A task widget in view mode is not a TipTap NodeView. Render it as a
    // React-owned control so the durable task side-document, rather than the
    // stale HTML class, controls the visible checkbox. This is deliberately
    // handled before the generic element walker to avoid a global DOM patch.
    if (el.matches('span[data-task-widget]')) {
      const taskId = el.getAttribute('data-task-id') || '';
      const savedDone = el.classList.contains('task-done');
      const isCompleted = taskId && taskCompletions?.has(taskId)
        ? taskCompletions.get(taskId) === true
        : savedDone;
      const classNames = new Set(
        (el.getAttribute('class') || '').split(/\s+/).filter(Boolean),
      );
      classNames.add('task-widget');
      classNames.delete('task-done');
      classNames.delete('task-overdue');
      if (isCompleted) classNames.add('task-done');

      const dueDate = el.getAttribute('data-due-date') || '';
      if (dueDate && !isCompleted) {
        const date = new Date(dueDate);
        if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) {
          classNames.add('task-overdue');
        }
      }

      const assignee = el.getAttribute('data-assignee') || '';
      const savedLabel = (el.textContent || '').trim().replace(/^[\u2610\u2611]\s*/, '');
      const label = assignee || dueDate
        ? `${assignee}${dueDate ? ` ${formatTaskDate(dueDate)}` : ''}`.trim()
        : savedLabel;
      const props = elementToProps(el);
      const canToggle = Boolean(taskId && toggleableTaskIds?.has(taskId) && onTaskToggle);
      classNames.delete('task-interactive');
      classNames.delete('task-readonly');
      classNames.add(canToggle ? 'task-interactive' : 'task-readonly');
      props['key'] = nextKey();
      props['className'] = [...classNames].join(' ');
      if (canToggle) {
        props['aria-pressed'] = isCompleted;
        if (pendingTaskIds?.has(taskId)) props['aria-busy'] = true;
        props['role'] = 'button';
        props['tabIndex'] = 0;
        props['onClick'] = (event: ReactMouseEvent<HTMLElement>) => {
          event.preventDefault();
          event.stopPropagation();
          onTaskToggle?.(taskId);
        };
        props['onKeyDown'] = (event: { key: string; preventDefault: () => void; stopPropagation: () => void }) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          onTaskToggle?.(taskId);
        };
      }
      return createElement('span', props, `${isCompleted ? '\u2611' : '\u2610'}${label ? ` ${label}` : ''}`);
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
    // Mark THESE markers as placed BEFORE walking children so nested block
    // anchors (e.g. a <p> inside an <li>) don't re-place the same child.
    // Without this, the marker is found by both the LI walker and the inner P
    // walker, producing two .inline-child-expanded divs for the same blip
    // (user-visible: child rendered twice on click).
    for (const id of expandedHere) childrenAlreadyPlaced.add(id);

    if (VOID_ELEMENTS.has(tag)) {
      const node = createElement(tag, props);
      if (expandedHere.length === 0) return node;
      const followups = expandedHere.map(id => {
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

    // For <p>, place after the paragraph as siblings — but only if the marker
    // isn't going to be claimed by an ancestor LI later. We always anchor to the
    // CLOSEST LI ancestor when one exists (matches rizzoma.com structure), so a
    // <p>-anchored followup is rare — only fires when the marker's <p> isn't
    // inside any <li>. The childrenAlreadyPlaced check above (added before
    // walking children) ensures we don't double-place when both apply.
    const followups = expandedHere.map(id => {
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

export interface InlineHtmlRendererProps extends Omit<
  InlineHtmlRenderOptions,
  'taskCompletions' | 'toggleableTaskIds' | 'pendingTaskIds' | 'onTaskToggle'
> {
  /** Blip ID used by the task side-doc API; for topic roots this is topic.id. */
  taskBlipId: string;
}

/**
 * Parity-view renderer with one authoritative task hydration per visible blip.
 * Toggle responses are applied only after the server confirms them. Failed
 * mutations rehydrate and never create a checked-but-unpersisted phantom.
 */
export function InlineHtmlRenderer({ taskBlipId, ...renderOptions }: InlineHtmlRendererProps) {
  const [taskCompletions, setTaskCompletions] = useState<ReadonlyMap<string, boolean> | null>(null);
  const [toggleableTaskIds, setToggleableTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingTaskIds, setPendingTaskIds] = useState<ReadonlySet<string>>(() => new Set());
  const pendingTaskIdsRef = useRef(new Set<string>());
  const hydrationGenerationRef = useRef(0);
  const hydrationControllerRef = useRef<AbortController | null>(null);
  const activeBlipIdRef = useRef(taskBlipId);
  const mountedRef = useRef(true);

  // Rehydrate if the set of task references changes while this view remains
  // mounted (for example after a realtime content update).
  const taskIdsKey = useMemo(() => {
    if (typeof document === 'undefined') return '';
    const container = document.createElement('div');
    container.innerHTML = sanitizeRichHtml(renderOptions.html);
    return Array.from(container.querySelectorAll<HTMLElement>('[data-task-widget][data-task-id]'))
      .map((element) => element.getAttribute('data-task-id') || '')
      .filter(Boolean)
      .sort()
      .join(',');
  }, [renderOptions.html]);

  const hydrate = useCallback(() => {
    const generation = ++hydrationGenerationRef.current;
    hydrationControllerRef.current?.abort();
    const controller = new AbortController();
    hydrationControllerRef.current = controller;
    const requestedBlipId = taskBlipId;

    void loadTaskCompletionSnapshot(requestedBlipId, controller.signal).then((snapshot) => {
      if (
        !mountedRef.current
        || controller.signal.aborted
        || generation !== hydrationGenerationRef.current
        || activeBlipIdRef.current !== requestedBlipId
      ) return;
      // A current denied/failed refresh must revoke previously granted UI
      // authority. Keep the last confirmed completion glyph for continuity,
      // but fail closed so a stale button cannot keep issuing denied writes.
      if (!snapshot) {
        setToggleableTaskIds(new Set());
        return;
      }
      setTaskCompletions(snapshot.completions);
      setToggleableTaskIds(snapshot.toggleableTaskIds);
    });
  }, [taskBlipId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeBlipIdRef.current = taskBlipId;
    setTaskCompletions(null);
    setToggleableTaskIds(new Set());
    pendingTaskIdsRef.current.clear();
    setPendingTaskIds(new Set());
    // Most blips do not contain tasks. Do not turn a large topic into one
    // by-blip request per visible blip when there is nothing to hydrate.
    if (taskIdsKey) hydrate();
    return () => {
      hydrationGenerationRef.current += 1;
      hydrationControllerRef.current?.abort();
      hydrationControllerRef.current = null;
    };
  }, [hydrate, taskBlipId, taskIdsKey]);

  useEffect(() => {
    if (!taskIdsKey) return;
    // A transient/offline refresh deliberately revokes stale authority. Give
    // the same mounted surface a deterministic recovery edge once transport or
    // the current wave's access policy changes; neither event necessarily
    // changes the blip HTML or authenticated owner key.
    const revalidateAuthority = () => hydrate();
    window.addEventListener('online', revalidateAuthority);
    window.addEventListener('rizzoma:access-changed', revalidateAuthority);
    return () => {
      window.removeEventListener('online', revalidateAuthority);
      window.removeEventListener('rizzoma:access-changed', revalidateAuthority);
    };
  }, [hydrate, taskIdsKey]);

  const handleTaskToggle = useCallback((taskId: string) => {
    if (
      !taskId
      || !toggleableTaskIds.has(taskId)
      || pendingTaskIdsRef.current.has(taskId)
    ) return;
    pendingTaskIdsRef.current.add(taskId);
    setPendingTaskIds(new Set(pendingTaskIdsRef.current));

    // A hydration started before this write cannot overwrite the newer server
    // response. The POST is nonqueued and the visible state is not optimistic.
    hydrationGenerationRef.current += 1;
    hydrationControllerRef.current?.abort();
    const requestedBlipId = taskBlipId;

    // Deliberately do not attach the renderer's AbortSignal to this POST. Once
    // sent, aborting on view -> editor unmount would make its commit ambiguous.
    void toggleTaskOnServer(taskId, requestedBlipId).then((isCompleted) => {
      if (!mountedRef.current || activeBlipIdRef.current !== requestedBlipId) return;
      if (isCompleted === null) {
        hydrate();
        return;
      }
      // A full hydrate started by a failed different task may have captured a
      // pre-write snapshot. Confirmed writes always invalidate it first.
      hydrationGenerationRef.current += 1;
      hydrationControllerRef.current?.abort();
      setTaskCompletions((current) => {
        const next = new Map(current || []);
        next.set(taskId, isCompleted);
        return next;
      });
    }).finally(() => {
      if (!mountedRef.current || activeBlipIdRef.current !== requestedBlipId) return;
      pendingTaskIdsRef.current.delete(taskId);
      setPendingTaskIds(new Set(pendingTaskIdsRef.current));
    });
  }, [hydrate, taskBlipId, toggleableTaskIds]);

  return createElement(Fragment, null, renderInlineHtml({
    ...renderOptions,
    taskCompletions,
    toggleableTaskIds,
    pendingTaskIds,
    onTaskToggle: handleTaskToggle,
  }));
}
