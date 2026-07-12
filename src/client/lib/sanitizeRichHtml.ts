const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup', 'dd', 'del', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'iframe', 'img', 'ins', 'kbd',
  'li', 'mark', 'ol', 'p', 'pre', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);

const DROP_WITH_CONTENT = new Set([
  'base', 'button', 'embed', 'form', 'input', 'link', 'math', 'meta', 'object', 'script',
  'select', 'style', 'svg', 'template', 'textarea',
]);

const GLOBAL_ATTRS = new Set(['class', 'dir', 'lang', 'role', 'title']);
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  col: new Set(['span']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
};
const SAFE_STYLE_PROPS = new Set([
  'background-color', 'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing',
  'line-height', 'margin-left', 'margin-right', 'text-align', 'text-decoration', 'text-indent',
  'text-transform', 'vertical-align', 'white-space',
]);
const URL_ATTRS = new Set(['href', 'src']);
const SAFE_STATIC_CLASS_TOKENS = new Set([
  'blip-thread-host', 'blip-thread-marker', 'expanded', 'has-unread', 'orphaned', 'inline-child-portal',
  'bulleted-list', 'bulleted', 'numbered-list', 'numbered',
  'highlight', 'editor-link', 'tag-widget', 'mention', 'commented-text', 'collaboration-selection',
  'gadget-block', 'gadget-chart', 'gadget-embed-frame', 'gadget-poll', 'gadget-app-frame',
  'gadget-header', 'gadget-chip', 'gadget-title', 'gadget-body', 'gadget-preview',
  'task-widget', 'task-done', 'task-overdue',
]);
const SAFE_STRUCTURAL_CLASS_TOKEN = /^(?:bulleted-list-level\d+|bulleted-type\d+|numbered-list-level\d+|numbered-type\d+)$/i;
const SAFE_BLIP_ID = /^[a-z0-9:_-]{1,200}$/i;

export function isSafeRichUrl(value: string, attribute: 'href' | 'src'): boolean {
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) ? '' : character;
  }).join('').toLowerCase();
  if (!normalized || normalized.startsWith('#') || normalized.startsWith('/') || normalized.startsWith('./') || normalized.startsWith('../')) return true;
  if (normalized.startsWith('https:') || normalized.startsWith('http:')) return true;
  if (attribute === 'href' && (normalized.startsWith('mailto:') || normalized.startsWith('tel:'))) return true;
  return attribute === 'src' && /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(normalized);
}

function sanitizeStyle(value: string): string {
  const safe: string[] = [];
  for (const declaration of value.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 1) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const propertyValue = declaration.slice(colon + 1).trim();
    if (!SAFE_STYLE_PROPS.has(property)) continue;
    if (!propertyValue || /(?:url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|javascript:|data:|\\)/i.test(propertyValue)) continue;
    safe.push(`${property}: ${propertyValue}`);
  }
  return safe.join('; ');
}

function safeGadgetFrameSource(value: string, gadgetType: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    if (gadgetType === 'app-frame') {
      return url.origin === window.location.origin
        && /^\/gadgets\/apps\/[a-z0-9-]+\/index\.html$/i.test(url.pathname)
        && !url.search
        && !url.hash;
    }
    // Generic embeds may execute scripts, so never combine their sandbox with
    // same-origin content. Same-origin frames are limited to the audited
    // app-frame path above; generic embeds must be absolute and cross-origin.
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && (value.startsWith('http://') || value.startsWith('https://'))
      && url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

function boundedDimension(value: string | null, fallback: number): string {
  const parsed = Math.round(Number(value));
  return String(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 100), 2000) : fallback);
}

/** Render-time sanitizer for both current and legacy stored rich text. */
export function sanitizeRichHtml(html: string): string {
  if (!html || typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = html;

  const sanitizeNode = (node: Node): void => {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    const gadgetFigure = tag === 'figure' ? element : element.closest('figure[data-gadget-type]');
    const gadgetType = gadgetFigure?.getAttribute('data-gadget-type') || '';
    if (tag === 'figure' && (gadgetType === 'embed-frame' || gadgetType === 'app-frame')) {
      const dataSource = element.getAttribute(gadgetType === 'app-frame' ? 'data-app-src' : 'data-embed-src') || '';
      if (!safeGadgetFrameSource(dataSource, gadgetType)) {
        element.remove();
        return;
      }
      if (gadgetType === 'app-frame') {
        const inferredAppId = dataSource.match(/^\/gadgets\/apps\/([a-z0-9-]+)\/index\.html$/i)?.[1] || '';
        const safe = normalizeAppFrameAttrs({
          appId: element.getAttribute('data-app-id') || inferredAppId,
          instanceId: element.getAttribute('data-app-instance-id') || 'app-frame',
          src: dataSource,
          height: element.getAttribute('data-app-height') || '430',
        });
        if (!safe) {
          element.remove();
          return;
        }
        element.setAttribute('data-app-id', safe.appId);
        element.setAttribute('data-app-instance-id', safe.instanceId);
        element.setAttribute('data-app-title', safe.title);
        element.setAttribute('data-app-src', safe.src);
        element.setAttribute('data-app-height', safe.height);
      } else {
        const safe = normalizeEmbedFrameAttrs({
          src: dataSource,
          title: element.getAttribute('data-embed-title') || 'Embedded content',
          provider: element.getAttribute('data-embed-provider') || 'iframe',
          width: element.getAttribute('data-embed-width') || '600',
          height: element.getAttribute('data-embed-height') || '400',
        });
        if (!safe) {
          element.remove();
          return;
        }
        element.setAttribute('data-embed-src', safe.src);
        element.setAttribute('data-embed-title', safe.title);
        element.setAttribute('data-embed-provider', safe.provider);
        element.setAttribute('data-embed-width', safe.width);
        element.setAttribute('data-embed-height', safe.height);
      }
    }
    if (tag === 'iframe') {
      const source = element.getAttribute('src') || '';
      const canonicalSource = gadgetFigure?.getAttribute(gadgetType === 'app-frame' ? 'data-app-src' : 'data-embed-src') || '';
      if (
        !['embed-frame', 'app-frame'].includes(gadgetType)
        || source !== canonicalSource
        || !safeGadgetFrameSource(source, gadgetType)
      ) {
        element.remove();
        return;
      }
      const width = boundedDimension(element.getAttribute('width'), 600);
      const height = boundedDimension(element.getAttribute('height') || gadgetFigure?.getAttribute('data-app-height') || null, 400);
      const title = element.getAttribute('title') || (gadgetType === 'app-frame' ? 'Rizzoma app' : 'Embedded content');
      for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
      element.setAttribute('src', source);
      element.setAttribute('title', title.slice(0, 200));
      element.setAttribute('width', width);
      element.setAttribute('height', height);
      element.setAttribute('loading', 'lazy');
      element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      if (gadgetType === 'app-frame') {
        element.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
        element.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
      } else {
        // Never combine scripts with allow-same-origin: a frame that reaches
        // our origin could otherwise remove its sandbox at runtime.
        element.setAttribute('sandbox', 'allow-scripts allow-presentation allow-popups');
        element.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share');
        element.setAttribute('allowfullscreen', 'true');
      }
      return;
    }
    if (DROP_WITH_CONTENT.has(tag)) {
      element.remove();
      return;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      for (const child of Array.from(element.childNodes)) sanitizeNode(child);
      const parent = element.parentNode;
      if (!parent) return;
      while (element.firstChild) parent.insertBefore(element.firstChild, element);
      element.remove();
      return;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const allowed = GLOBAL_ATTRS.has(name)
        || name.startsWith('data-')
        || name.startsWith('aria-')
        || TAG_ATTRS[tag]?.has(name)
        || name === 'style';
      if (!allowed || name.startsWith('on') || name === 'srcdoc') {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (URL_ATTRS.has(name) && !isSafeRichUrl(attribute.value, name as 'href' | 'src')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'style') {
        const style = sanitizeStyle(attribute.value);
        if (style) element.setAttribute('style', style);
        else element.removeAttribute('style');
      }
      if (name === 'class') {
        const markerId = element.getAttribute('data-blip-thread') || '';
        const isRealMarker = tag === 'span' && SAFE_BLIP_ID.test(markerId);
        const classes = attribute.value.split(/\s+/).filter((token) => {
          if (!SAFE_STATIC_CLASS_TOKENS.has(token) && !SAFE_STRUCTURAL_CLASS_TOKEN.test(token)) return false;
          if (['blip-thread-marker', 'expanded', 'has-unread', 'orphaned'].includes(token.toLowerCase())) {
            return isRealMarker;
          }
          return true;
        });
        if (classes.length > 0) element.setAttribute('class', classes.join(' '));
        else element.removeAttribute('class');
      }
      if (name === 'target' && attribute.value !== '_blank') {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.hasAttribute('data-blip-thread') && !SAFE_BLIP_ID.test(element.getAttribute('data-blip-thread') || '')) {
      element.removeAttribute('data-blip-thread');
    }
    if (tag === 'a' && element.getAttribute('target') === '_blank') {
      element.setAttribute('rel', 'noopener noreferrer');
    }
    for (const child of Array.from(element.childNodes)) sanitizeNode(child);
  };

  for (const child of Array.from(template.content.childNodes)) sanitizeNode(child);
  return template.innerHTML;
}
import { normalizeAppFrameAttrs, normalizeEmbedFrameAttrs } from '../gadgets/security';
