import { sanitizeRichHtml } from './sanitizeRichHtml';

export type ExportBlip = {
  id: string;
  content?: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string;
  createdAt?: number;
  updatedAt?: number;
  isRead?: boolean;
  isFoldedByDefault?: boolean;
  deleted?: boolean;
  deletedAt?: number;
  parentBlipId?: string | null;
  childBlips?: ExportBlip[];
  permissions?: unknown;
};

export type ExportBlipNode = Omit<ExportBlip, 'childBlips'> & { children: ExportBlipNode[] };

export type TopicExportInput = {
  topicTitle: string;
  topicId: string;
  topicContent?: string;
  blips: ExportBlip[];
  exportedAt?: Date;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function flattenExportBlips(blips: ExportBlip[]): ExportBlip[] {
  const flattened = new Map<string, ExportBlip>();
  const walk = (blip: ExportBlip, inferredParent?: string) => {
    if (!blip?.id || flattened.has(blip.id)) return;
    flattened.set(blip.id, {
      ...blip,
      parentBlipId: blip.parentBlipId || inferredParent || null,
      childBlips: undefined,
    });
    for (const child of blip.childBlips || []) walk(child, blip.id);
  };
  for (const blip of blips) walk(blip);
  return [...flattened.values()];
}

export function buildExportTree(blips: ExportBlip[]): ExportBlipNode[] {
  const flat = flattenExportBlips(blips);
  const nodes = new Map<string, ExportBlipNode>(flat.map((blip) => [blip.id, { ...blip, children: [] }]));
  const roots: ExportBlipNode[] = [];
  for (const blip of flat) {
    const node = nodes.get(blip.id)!;
    const parent = blip.parentBlipId ? nodes.get(blip.parentBlipId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: ExportBlipNode[]) => {
    items.sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

/** Preserve safe formatting while removing every active embedded frame. */
export function sanitizeExportRichHtml(html: string): string {
  const sanitized = sanitizeRichHtml(html || '');
  if (typeof document === 'undefined') return sanitized;
  const container = document.createElement('div');
  container.innerHTML = sanitized;
  for (const figure of Array.from(container.querySelectorAll('figure[data-gadget-type="embed-frame"], figure[data-gadget-type="app-frame"]'))) {
    figure.replaceWith(document.createTextNode('[Embedded content omitted from export]'));
  }
  for (const iframe of Array.from(container.querySelectorAll('iframe'))) iframe.remove();
  return container.innerHTML;
}

export function richHtmlToPlainText(html: string): string {
  if (typeof document === 'undefined') return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const container = document.createElement('div');
  container.innerHTML = sanitizeExportRichHtml(html);
  const blocks = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD', 'FIGCAPTION', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'LI', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TR', 'UL']);
  let text = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    if (element.tagName === 'BR') {
      text += '\n';
      return;
    }
    const isBlock = blocks.has(element.tagName);
    if (isBlock && text && !text.endsWith('\n')) text += '\n';
    for (const child of Array.from(element.childNodes)) walk(child);
    if (isBlock && !text.endsWith('\n')) text += '\n';
  };
  for (const child of Array.from(container.childNodes)) walk(child);
  return text
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .trim();
}

const authorDisplay = (blip: ExportBlipNode): string => {
  if (blip.authorName && blip.authorName !== 'Anonymous') return blip.authorName;
  return blip.authorId ? `User ${blip.authorId.slice(-8)}` : 'Unknown';
};

export function generateTopicHtmlExport(input: TopicExportInput): string {
  const exportedAt = input.exportedAt || new Date();
  const tree = buildExportTree(input.blips);
  const renderBlip = (blip: ExportBlipNode): string => {
    const timestamp = blip.updatedAt || blip.createdAt;
    const children = blip.children.length
      ? `<ul class="blip-children">${blip.children.map((child) => `<li>${renderBlip(child)}</li>`).join('')}</ul>`
      : '';
    return `<article class="blip"><div class="blip-meta"><strong>${escapeHtml(authorDisplay(blip))}</strong>${timestamp ? ` <time>${escapeHtml(new Date(timestamp).toLocaleString())}</time>` : ''}</div><div class="blip-content">${sanitizeExportRichHtml(blip.content || '<p>(empty)</p>')}</div>${children}</article>`;
  };
  const topicBody = sanitizeExportRichHtml(input.topicContent || '');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(input.topicTitle)}</title><style>body{font-family:system-ui,sans-serif;line-height:1.55;max-width:860px;margin:40px auto;padding:0 20px;color:#243447}h1{border-bottom:2px solid #4ea0f1;padding-bottom:10px}.topic-body,.blip{margin:16px 0}.blips-list,.blip-children{padding-left:24px}.blip-meta{font-size:12px;color:#667}.blip-content{overflow-wrap:anywhere}.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:16px;color:#778;font-size:12px}img{max-width:100%;height:auto}</style></head><body>
<h1>${escapeHtml(input.topicTitle)}</h1><p>Exported from Rizzoma on ${escapeHtml(exportedAt.toLocaleString())}</p>
${topicBody ? `<section class="topic-body"><h2>Topic</h2>${topicBody}</section>` : ''}
<section><h2>Conversation</h2><ul class="blips-list">${tree.map((blip) => `<li>${renderBlip(blip)}</li>`).join('')}</ul></section>
<div class="footer">Exported from Rizzoma &bull; Topic ID: ${escapeHtml(input.topicId)}</div></body></html>`;
}

export function generateTopicJsonExport(input: TopicExportInput): string {
  const flat = flattenExportBlips(input.blips);
  const mapBlip = (blip: ExportBlipNode): Record<string, unknown> => ({
    id: blip.id,
    content: sanitizeExportRichHtml(blip.content || ''),
    text: richHtmlToPlainText(blip.content || ''),
    authorId: blip.authorId || null,
    authorName: blip.authorName || null,
    authorAvatar: blip.authorAvatar || null,
    createdAt: blip.createdAt ? new Date(blip.createdAt).toISOString() : null,
    updatedAt: blip.updatedAt ? new Date(blip.updatedAt).toISOString() : null,
    isRead: blip.isRead,
    isFoldedByDefault: Boolean(blip.isFoldedByDefault),
    deleted: Boolean(blip.deleted),
    deletedAt: blip.deletedAt ? new Date(blip.deletedAt).toISOString() : null,
    parentBlipId: blip.parentBlipId || null,
    permissions: blip.permissions,
    children: blip.children.map(mapBlip),
  });
  return JSON.stringify({
    title: input.topicTitle,
    topicId: input.topicId,
    topicContent: sanitizeExportRichHtml(input.topicContent || ''),
    topicText: richHtmlToPlainText(input.topicContent || ''),
    exportedAt: (input.exportedAt || new Date()).toISOString(),
    blipCount: flat.length,
    blips: buildExportTree(input.blips).map(mapBlip),
  }, null, 2);
}

export function generateTopicTextExport(input: TopicExportInput): string {
  const tree = buildExportTree(input.blips);
  const render = (blip: ExportBlipNode, level = 0): string => {
    const text = richHtmlToPlainText(blip.content || '') || '(empty)';
    const prefix = `${'  '.repeat(level)}${level === 0 ? '•' : level === 1 ? '◦' : '▪'} `;
    const lines = text.split('\n');
    const own = lines.map((line, index) => `${index === 0 ? prefix : `${' '.repeat(prefix.length)}`}${line}`).join('\n');
    const children = blip.children.map((child) => render(child, level + 1)).join('\n');
    return children ? `${own}\n${children}` : own;
  };
  const topicText = richHtmlToPlainText(input.topicContent || '');
  const conversation = tree.map((blip) => render(blip)).join('\n\n');
  return `${input.topicTitle}\n${'='.repeat(input.topicTitle.length)}\n${topicText ? `\n${topicText}\n` : ''}\n${conversation}\n\n---\nExported from Rizzoma on ${(input.exportedAt || new Date()).toLocaleString()}\nTopic ID: ${input.topicId}`;
}
