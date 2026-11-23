// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderInlineHtml } from '../client/components/blip/InlineHtmlRenderer';
import { sanitizeRichHtml, isYoutubeFrameSource } from '../client/lib/sanitizeRichHtml';
import { latexRuns, latexWidgetHtml } from '../client/components/editor/extensions/LatexPreview';

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

  it('draws the read poll as the same card as the editor: badge, total, question, share and bar per option', () => {
    const html = '<figure data-gadget-type="poll" data-poll-question="Lunch?" data-poll-options=\'[{"id":"a","label":"Yes","votes":2},{"id":"b","label":"No","votes":1},{"id":"c","label":"Maybe","votes":0}]\' class="gadget-block gadget-poll"></figure>';
    const out = render(html);
    expect(out).toContain('gadget-poll-top');
    expect(out).toContain('Collaborative decision point');
    expect(out).toContain('3 total votes');
    expect(out).toContain('67%');
    expect(out).toContain('33%');
    expect(out).toContain('0%');
    expect(out).toContain('width:67%');
    expect(render(html.replace('"votes":2', '"votes":1').replace('"votes":1},{"id":"b"', '"votes":0},{"id":"b"'))).toContain('1 total vote<');
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

  it('never shows raw dollar signs for an EMPTY LaTeX gadget stored before the fix', () => {
    const out = render('<ul><li><p>$$  $$</p></li></ul>');
    expect(out).toContain('type a formula');
    expect(out).not.toContain('$$');
  });

  it('finds LaTeX runs for the editor preview and typesets them', () => {
    expect(latexRuns('see $$ x^2 $$ and $$  $$ end')).toEqual([
      { from: 4, to: 13, formula: ' x^2 ' },
      { from: 18, to: 24, formula: '  ' },
    ]);
    expect(latexWidgetHtml('x^2').html).toContain('<sup>2</sup>');
    expect(latexWidgetHtml('   ').empty).toBe(true);
  });

  it('keeps a bullet that holds only a poll (no text of its own) in the read view', () => {
    const html = '<ul><li><p>Row</p></li><li><p></p><figure data-gadget-type="poll" data-poll-question="Q?" data-poll-options=\'[{"id":"a","label":"Alpha","votes":1}]\' class="gadget-block gadget-poll"></figure></li></ul>';
    const out = render(html);
    expect(out).toContain('Q?');
    expect(out).toContain('Alpha');
  });
});
