/**
 * Native fractal-render — Renderer.
 *
 * Direct TS port of original Rizzoma's `editor/renderer.coffee:86-121`
 * (the renderContent walk).
 *
 * Walks a flat ContentArray ONCE and builds a real DOM tree:
 *   LINE → start a new <p> with appropriate list/heading classes
 *   TEXT → text node + styling spans (bold/italic/etc.) into current <p>
 *   BLIP → wrap the child blip's container in a BlipThread, insert into
 *           current <p> at the position where this BLIP element appears
 *
 * Multiple BLIP elements with the same threadId batch into one BlipThread
 * (matches the original lastThread logic).
 *
 * To render a child blip's content, callers provide a `resolveChildBlip`
 * callback that returns the child's DOM node (typically built by the
 * caller's BlipView via the same Renderer recursively).
 */

import { BlipThread } from './blip-thread';
import {
  ContentArray,
  ContentElement,
  isAttachment,
  isBlip,
  isLine,
  isText,
  TextEl,
  TextParams,
} from './types';

export interface RenderOptions {
  /**
   * Called when the renderer encounters a BLIP element.
   * Returns the child blip's DOM container (a `<span class="blip-container">`
   * or equivalent). Caller is responsible for instantiating + caching the
   * child's BlipView and returning its container.
   */
  resolveChildBlip: (blipId: string) => HTMLElement | null;
}

/** Build a styled inline span (or plain text node) for a TEXT element. */
const renderTextElement = (el: TextEl): Node => {
  if (!hasStyling(el.params) && !el.params.url) {
    return document.createTextNode(el.text);
  }
  let node: HTMLElement = document.createElement('span');
  if (el.params.url) {
    const a = document.createElement('a');
    a.href = el.params.url;
    a.textContent = el.text;
    node = a;
  } else {
    node.textContent = el.text;
  }
  if (el.params.bold) node.style.fontWeight = 'bold';
  if (el.params.italic) node.style.fontStyle = 'italic';
  if (el.params.underlined) node.style.textDecoration = 'underline';
  if (el.params.struckthrough) {
    node.style.textDecoration =
      (node.style.textDecoration ? node.style.textDecoration + ' ' : '') + 'line-through';
  }
  if (el.params.bgColor) node.style.backgroundColor = el.params.bgColor;
  if (el.params.fgColor) node.style.color = el.params.fgColor;
  return node;
};

const hasStyling = (p: TextParams): boolean =>
  !!(p.bold || p.italic || p.underlined || p.struckthrough || p.bgColor || p.fgColor);

/** Build a fresh <p> (or <li>) for a LINE element, applying list/heading params. */
const startLineElement = (line: ContentElement): { container: HTMLElement; wrapper: HTMLElement | null } => {
  if (!isLine(line)) throw new Error('startLineElement requires a LINE');
  const params = line.params;
  // Heading?
  if (params.heading && params.heading >= 1 && params.heading <= 6) {
    const h = document.createElement(`h${params.heading}`);
    return { container: h, wrapper: null };
  }
  // Bulleted list?
  if (typeof params.bulleted === 'number') {
    const li = document.createElement('li');
    li.className = `bulleted bulleted-type${params.bulleted}`;
    return { container: li, wrapper: null };
  }
  // Numbered list?
  if (typeof params.numbered === 'number') {
    const li = document.createElement('li');
    li.className = `numbered numbered-type${params.numbered}`;
    return { container: li, wrapper: null };
  }
  // Default: plain paragraph.
  const p = document.createElement('p');
  return { container: p, wrapper: null };
};

/**
 * Render a ContentArray into the given empty container.
 *
 * Mirrors original renderer.coffee:86-121 structure. The content is walked
 * once; LINE elements start new lines; TEXT elements append into the current
 * line; BLIP elements get wrapped in a BlipThread (or appended to one if
 * they share a threadId with the previous BLIP) and inserted into the
 * current line.
 */
export const renderContent = (
  container: HTMLElement,
  content: ContentArray,
  opts: RenderOptions,
): void => {
  // Empty target
  while (container.firstChild) container.removeChild(container.firstChild);

  // Track whether we're currently inside a UL/OL block — drives <ul> insertion.
  let currentList: HTMLUListElement | HTMLOListElement | null = null;
  let currentListLevel = -1;
  let currentListKind: 'bulleted' | 'numbered' | null = null;
  let currentLine: HTMLElement | null = null;
  let lastThread: BlipThread | null = null;

  const closeList = (): void => {
    currentList = null;
    currentListLevel = -1;
    currentListKind = null;
  };

  const ensureLineParent = (line: ContentElement): HTMLElement => {
    if (!isLine(line)) throw new Error('ensureLineParent requires LINE');
    const params = line.params;
    if (typeof params.bulleted === 'number') {
      const level = params.bulleted;
      if (currentListKind !== 'bulleted' || currentListLevel !== level) {
        const ul = document.createElement('ul');
        ul.className = `bulleted-list bulleted-list-level${level}`;
        container.appendChild(ul);
        currentList = ul;
        currentListKind = 'bulleted';
        currentListLevel = level;
      }
      return currentList!;
    }
    if (typeof params.numbered === 'number') {
      const level = params.numbered;
      if (currentListKind !== 'numbered' || currentListLevel !== level) {
        const ol = document.createElement('ol');
        ol.className = `numbered-list numbered-list-level${level}`;
        container.appendChild(ol);
        currentList = ol;
        currentListKind = 'numbered';
        currentListLevel = level;
      }
      return currentList!;
    }
    closeList();
    return container;
  };

  for (const element of content) {
    if (isLine(element)) {
      const parent = ensureLineParent(element);
      const { container: lineEl } = startLineElement(element);
      parent.appendChild(lineEl);
      currentLine = lineEl;
      lastThread = null;
      continue;
    }

    if (isText(element)) {
      // Text without a current line gets one by default (matches original behavior).
      if (!currentLine) {
        const p = document.createElement('p');
        container.appendChild(p);
        currentLine = p;
      }
      currentLine.appendChild(renderTextElement(element));
      lastThread = null;
      continue;
    }

    if (isBlip(element)) {
      const childContainer = opts.resolveChildBlip(element.params.id);
      if (!childContainer) {
        // Stranded — child blip not loaded yet. Emit a placeholder; refresh
        // later (caller can re-render once child loads).
        const placeholder = document.createElement('span');
        placeholder.className = 'blip-thread-placeholder';
        placeholder.setAttribute('data-blip-thread', element.params.id);
        placeholder.textContent = '[+]';
        if (currentLine) {
          currentLine.appendChild(placeholder);
        } else {
          container.appendChild(placeholder);
        }
        continue;
      }
      // Same-thread continuation? Append into existing.
      const tid = element.params.threadId || element.params.id;
      if (lastThread && lastThread.getId() === tid) {
        lastThread.appendBlipElement(childContainer);
        continue;
      }
      // New thread.
      const thread: BlipThread = new BlipThread(tid, childContainer);
      lastThread = thread;
      if (!currentLine) {
        const p = document.createElement('p');
        container.appendChild(p);
        currentLine = p;
      }
      currentLine.appendChild(thread.getContainer());
      continue;
    }

    if (isAttachment(element)) {
      // Phase 1: emit a simple <img>; full attachment lifecycle in phase 2.
      const img = document.createElement('img');
      img.src = element.params.url;
      img.alt = '';
      if (!currentLine) {
        const p = document.createElement('p');
        container.appendChild(p);
        currentLine = p;
      }
      currentLine.appendChild(img);
      lastThread = null;
      continue;
    }
  }
};
