/**
 * Serializer + round-trip tests (vitest).
 *
 * Validates that serializeContentArrayToHtml() produces HTML that
 * parseHtmlToContentArray() converts back to a structurally-equivalent
 * ContentArray. This is the lock-step contract that lets a BlipView edit
 * a ContentArray in memory and persist it back to the server as HTML.
 *
 * Run via: npx vitest run src/client/native/__tests__/serializer.test.ts
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseHtmlToContentArray } from '../parser';
import { serializeContentArrayToHtml } from '../serializer';
import { ContentArray, ModelType } from '../types';

/** Strip volatile fields so structural-equivalence comparison is meaningful. */
const normalize = (arr: ContentArray): ContentArray =>
  arr.map((el) => {
    if (el.type === ModelType.TEXT) {
      // Collapse whitespace runs to single spaces (the parser already does this).
      return { ...el, text: el.text.replace(/\s+/g, ' ') };
    }
    return { ...el };
  });

const roundTripIsStable = (html: string) => {
  const first = parseHtmlToContentArray(html);
  const re = serializeContentArrayToHtml(first);
  const second = parseHtmlToContentArray(re);
  expect(normalize(second)).toEqual(normalize(first));
};

describe('serializeContentArrayToHtml', () => {
  it('emits empty string for empty content', () => {
    expect(serializeContentArrayToHtml([])).toBe('');
  });

  it('serializes a plain paragraph', () => {
    const html = serializeContentArrayToHtml([
      { type: ModelType.LINE, text: ' ', params: {} },
      { type: ModelType.TEXT, text: 'Hello world', params: {} },
    ]);
    expect(html).toBe('<p>Hello world</p>');
  });

  it('serializes a 3-bullet list at level 0', () => {
    const html = serializeContentArrayToHtml([
      { type: ModelType.LINE, text: ' ', params: { bulleted: 0 } },
      { type: ModelType.TEXT, text: 'First', params: {} },
      { type: ModelType.LINE, text: ' ', params: { bulleted: 0 } },
      { type: ModelType.TEXT, text: 'Second', params: {} },
      { type: ModelType.LINE, text: ' ', params: { bulleted: 0 } },
      { type: ModelType.TEXT, text: 'Third', params: {} },
    ]);
    expect(html).toBe(
      '<ul class="bulleted-list bulleted-list-level0">' +
        '<li class="bulleted bulleted-type0">First</li>' +
        '<li class="bulleted bulleted-type0">Second</li>' +
        '<li class="bulleted bulleted-type0">Third</li>' +
      '</ul>'
    );
  });

  it('opens a fresh UL when level changes', () => {
    const html = serializeContentArrayToHtml([
      { type: ModelType.LINE, text: ' ', params: { bulleted: 0 } },
      { type: ModelType.TEXT, text: 'Outer', params: {} },
      { type: ModelType.LINE, text: ' ', params: { bulleted: 1 } },
      { type: ModelType.TEXT, text: 'Inner', params: {} },
    ]);
    expect(html).toContain('bulleted-list-level0');
    expect(html).toContain('bulleted-list-level1');
    expect(html).toContain('Outer');
    expect(html).toContain('Inner');
  });

  it('emits styled spans for bold + italic', () => {
    const html = serializeContentArrayToHtml([
      { type: ModelType.LINE, text: ' ', params: {} },
      { type: ModelType.TEXT, text: 'plain ', params: {} },
      { type: ModelType.TEXT, text: 'bold', params: { bold: true } },
      { type: ModelType.TEXT, text: ' and ', params: {} },
      { type: ModelType.TEXT, text: 'italic', params: { italic: true } },
    ]);
    expect(html).toBe('<p>plain <b>bold</b> and <i>italic</i></p>');
  });

  it('emits headings', () => {
    const html = serializeContentArrayToHtml([
      { type: ModelType.LINE, text: ' ', params: { heading: 1 } },
      { type: ModelType.TEXT, text: 'Title', params: {} },
      { type: ModelType.LINE, text: ' ', params: {} },
      { type: ModelType.TEXT, text: 'Body', params: {} },
    ]);
    expect(html).toBe('<h1>Title</h1><p>Body</p>');
  });

  it('emits BLIP markers as <span data-blip-thread>', () => {
    const html = serializeContentArrayToHtml([
      { type: ModelType.LINE, text: ' ', params: {} },
      { type: ModelType.TEXT, text: 'Hi ', params: {} },
      { type: ModelType.BLIP, text: ' ', params: { id: 'abc' } },
      { type: ModelType.TEXT, text: ' world', params: {} },
    ]);
    expect(html).toContain('<span class="blip-thread-marker" data-blip-thread="abc">+</span>');
  });

  it('escapes HTML special chars in text content', () => {
    const html = serializeContentArrayToHtml([
      { type: ModelType.LINE, text: ' ', params: {} },
      { type: ModelType.TEXT, text: 'a < b && c > "d"', params: {} },
    ]);
    expect(html).toBe('<p>a &lt; b &amp;&amp; c &gt; &quot;d&quot;</p>');
  });

  it('escapes attribute values in URLs', () => {
    const html = serializeContentArrayToHtml([
      { type: ModelType.LINE, text: ' ', params: {} },
      { type: ModelType.TEXT, text: 'click', params: { url: 'https://x.com/?q=1&r=2' } },
    ]);
    expect(html).toContain('href="https://x.com/?q=1&amp;r=2"');
  });
});

describe('parser <-> serializer round trip', () => {
  it('round-trips a plain paragraph', () => {
    roundTripIsStable('<p>Hello world</p>');
  });

  it('round-trips a 3-bullet flat list', () => {
    roundTripIsStable(
      '<ul class="bulleted-list bulleted-list-level0">' +
        '<li class="bulleted bulleted-type0">First</li>' +
        '<li class="bulleted bulleted-type0">Second</li>' +
        '<li class="bulleted bulleted-type0">Third</li>' +
      '</ul>'
    );
  });

  it('round-trips bold + italic styling', () => {
    roundTripIsStable('<p>plain <b>bold</b> and <i>italic</i></p>');
  });

  it('round-trips heading + paragraph', () => {
    roundTripIsStable('<h1>Title</h1><p>Body</p>');
  });

  it('round-trips a depth-3 fractal-like structure', () => {
    const html =
      '<h1>Try</h1>' +
      '<ul class="bulleted-list bulleted-list-level0">' +
        '<li class="bulleted bulleted-type0">First<span class="blip-thread-marker" data-blip-thread="b1">+</span></li>' +
        '<li class="bulleted bulleted-type0">Second</li>' +
        '<li class="bulleted bulleted-type0">Third</li>' +
      '</ul>';
    roundTripIsStable(html);
  });

  it('round-trips a BLIP marker mid-paragraph', () => {
    roundTripIsStable('<p>before <span class="blip-thread-marker" data-blip-thread="x">+</span> after</p>');
  });
});
