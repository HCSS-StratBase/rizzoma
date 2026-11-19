// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderInlineHtml } from '../client/components/blip/InlineHtmlRenderer';
import { sanitizeRichHtml, isYoutubeFrameSource } from '../client/lib/sanitizeRichHtml';

const render = (html: string): string => renderToStaticMarkup(
  renderInlineHtml({ html, inlineChildren: [], expandedSet: new Set(), renderInlineChild: () => null }) as any,
);

describe('gadgets: what the READ state actually renders', () => {
  it('draws a poll (question, options, counts) instead of an empty box', () => {
    const html = '<figure data-gadget-type="poll" data-poll-question="Lunch?" data-poll-options=\'[{"id":"a","label":"Yes","votes":2},{"id":"b","label":"No","votes":0}]\' class="gadget-block gadget-poll"></figure>';
    const out = render(html);
    expect(out).toContain('Lunch?');
    expect(out).toContain('Yes');
    expect(out).toContain('2 votes');
    expect(out).toContain('gadget-poll-bar-fill');
  });

  it('renders the embed iframe without React attribute warnings and with allowFullScreen', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = render(sanitizeRichHtml('<figure data-gadget-type="embed-frame" data-embed-src="https://www.youtube.com/embed/dQw4w9WgXcQ" data-embed-title="YouTube" data-embed-provider="youtube" data-embed-width="560" data-embed-height="315" class="gadget-block gadget-embed-frame"><div class="gadget-body"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div></figure>'));
    expect(out).toMatch(/allowfullscreen/i);
    expect(err.mock.calls.map((c) => String(c[0])).join('\n')).not.toMatch(/Invalid DOM property/);
    err.mockRestore();
  });

  it('lets the YouTube player keep its own origin, and only that player', () => {
    expect(isYoutubeFrameSource('https://www.youtube.com/embed/x')).toBe(true);
    expect(isYoutubeFrameSource('https://example.org/')).toBe(false);
    const yt = sanitizeRichHtml('<figure data-gadget-type="embed-frame" data-embed-src="https://www.youtube.com/embed/dQw4w9WgXcQ" data-embed-title="YouTube" data-embed-provider="youtube" data-embed-width="560" data-embed-height="315" class="gadget-block gadget-embed-frame"><div class="gadget-body"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div></figure>');
    expect(yt).toMatch(/sandbox="[^"]*allow-same-origin/);
    const other = sanitizeRichHtml('<figure data-gadget-type="embed-frame" data-embed-src="https://example.org/" data-embed-title="x" data-embed-provider="iframe" data-embed-width="600" data-embed-height="400" class="gadget-block gadget-embed-frame"><div class="gadget-body"><iframe src="https://example.org/"></iframe></div></figure>');
    expect(other).toContain('sandbox="allow-scripts allow-presentation allow-popups"');
    expect(other).not.toContain('allow-same-origin');
  });
});
