import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderInlineHtml } from '../client/components/blip/InlineHtmlRenderer';
import { sanitizeRichHtml } from '../client/lib/sanitizeRichHtml';

const hostile = `
  <p class="auth-modal-overlay rizzoma-layout blip-thread-marker" onclick="globalThis.pwned=1" style="color: red; background-image: url(javascript:alert(1)); text-align: center">
    <strong data-type="task" data-task-id="t1">Kept formatting</strong>
    <a href="java&#x0a;script:alert(1)" target="_blank">bad link</a>
    <img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" onerror="alert(1)">
    <span class="blip-thread-marker" data-blip-thread="child-1">+</span>
    <custom-box><script>alert(1)</script><img src="x" onerror="nestedPwn()"><em>safe child</em></custom-box>
    <a href="https://example.test" target="_top">unsafe target</a>
  </p>
  <iframe srcdoc="<script>alert(1)</script>"></iframe>
  <object data="javascript:alert(1)"></object><embed src="javascript:alert(1)">
  <form action="javascript:alert(1)"><input autofocus></form><meta http-equiv="refresh" content="0;javascript:alert(1)"><link rel="import" href="javascript:alert(1)">
  <svg><a xlink:href="javascript:alert(1)">svg</a></svg>
`;

describe('stored rich HTML sanitization', () => {
  it('removes executable markup while preserving Rizzoma formatting and data attributes', () => {
    const legitimateClasses = `
      <ul class="bulleted-list bulleted-list-level2"><li class="bulleted bulleted-type0">Bullet</li></ul>
      <ol class="numbered-list numbered-list-level3"><li class="numbered numbered-type1">Number</li></ol>
      <mark class="highlight">Marked</mark><a class="editor-link" href="https://example.test">Link</a>
      <span class="tag-widget commented-text collaboration-selection">Decorated text</span>
      <figure class="gadget-block gadget-chart"><div class="gadget-header gadget-body gadget-chip gadget-title gadget-preview">Gadget</div></figure>
      <span class="task-widget task-done task-overdue mention">Task</span>
      <span class="gadget-admin-panel app-frame-overlay task-delete-button inline-comment-nav text-danger is-selected">Hostile classes</span>
    `;
    const clean = sanitizeRichHtml(hostile + legitimateClasses);
    const container = document.createElement('div');
    container.innerHTML = clean;

    expect(clean).toContain('<strong data-type="task" data-task-id="t1">Kept formatting</strong>');
    expect(clean).toContain('data-blip-thread="child-1"');
    expect(clean).toContain('<em>safe child</em>');
    expect(clean).toContain('color: red');
    expect(clean).toContain('text-align: center');
    expect(clean).not.toMatch(/script|iframe|object|embed|<form|<input|<meta|<link|<svg/i);
    expect(clean).not.toMatch(/\son\w+=|javascript:|data:image\/svg|background-image|srcdoc/i);
    expect(container.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(container.querySelector('a')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(clean).not.toContain('nestedPwn');
    expect(clean).not.toContain('target="_top"');
    expect(clean).not.toMatch(/auth-modal-overlay|rizzoma-layout/);
    expect(clean).toContain('class="blip-thread-marker"');
    for (const token of [
      'bulleted-list', 'bulleted-list-level2', 'bulleted', 'bulleted-type0',
      'numbered-list', 'numbered-list-level3', 'numbered', 'numbered-type1',
      'highlight', 'editor-link', 'tag-widget', 'commented-text', 'collaboration-selection',
      'gadget-block', 'gadget-chart', 'gadget-header', 'gadget-body', 'gadget-chip', 'gadget-title', 'gadget-preview',
      'task-widget', 'task-done', 'task-overdue', 'mention',
    ]) expect(clean).toContain(token);
    for (const hostileClass of ['gadget-admin-panel', 'app-frame-overlay', 'task-delete-button', 'inline-comment-nav', 'text-danger', 'is-selected']) {
      expect(clean).not.toContain(hostileClass);
    }
  });

  it('applies the same sanitizer inside the inline BLB renderer', () => {
    const tree = renderInlineHtml({
      html: hostile,
      inlineChildren: [{ id: 'child-1', isRead: true }],
      expandedSet: new Set(),
      renderInlineChild: () => null,
    });
    const markup = renderToStaticMarkup(createElement(Fragment, null, tree));
    expect(markup).toContain('data-blip-thread="child-1"');
    expect(markup).toContain('Kept formatting');
    expect(markup).not.toMatch(/script|iframe|object|embed|javascript:|onerror=|onclick=/i);
  });

  it('preserves only constrained gadget frames and forces their security attributes', () => {
    const html = `
      <figure class="gadget-embed-frame" data-gadget-type="embed-frame" data-embed-src="https://www.youtube.com/embed/abc">
        <div class="gadget-body"><iframe src="https://www.youtube.com/embed/abc" width="99999" height="1" srcdoc="bad" onload="pwn()"></iframe></div>
      </figure>
      <figure class="gadget-app-frame" data-gadget-type="app-frame" data-app-id="kanban-board" data-app-instance-id="app-safe" data-app-src="/gadgets/apps/kanban-board/index.html" data-app-height="430">
        <iframe src="/gadgets/apps/kanban-board/index.html"></iframe>
      </figure>
      <figure data-gadget-type="app-frame" data-app-src="/admin"><iframe src="/admin"></iframe></figure>
      <figure data-gadget-type="embed-frame" data-embed-src="/admin"><iframe src="/admin"></iframe></figure>
      <figure data-gadget-type="embed-frame" data-embed-src="${window.location.origin}/admin"><iframe src="${window.location.origin}/admin"></iframe></figure>
      <custom-box><iframe src="https://evil.example"></iframe></custom-box>
    `;
    const clean = sanitizeRichHtml(html);
    const container = document.createElement('div');
    container.innerHTML = clean;
    const frames = [...container.querySelectorAll('iframe')];
    expect(frames).toHaveLength(2);
    expect(frames[0].getAttribute('width')).toBe('2000');
    expect(frames[0].getAttribute('height')).toBe('100');
    expect(frames[0].getAttribute('sandbox')).toContain('allow-scripts');
    expect(frames[0].getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frames[0].hasAttribute('srcdoc')).toBe(false);
    expect(frames[0].hasAttribute('onload')).toBe(false);
    expect(frames[1].getAttribute('src')).toBe('/gadgets/apps/kanban-board/index.html');
    expect(frames[1].getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups');
    expect(clean).not.toContain('/admin');
    expect(clean).not.toContain('evil.example');
  });
});
