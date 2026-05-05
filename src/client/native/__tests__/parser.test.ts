/**
 * Parser smoke test (vitest).
 *
 * Verifies HTML → ContentArray for common blip patterns. Phase-1 spike-level
 * coverage; round-trip + dev-DB-coverage tests land in phase 2.
 *
 * Run via: npx vitest run src/client/native/__tests__/parser.test.ts
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseHtmlToContentArray } from '../parser';
import { ModelType, type BlipEl, type LineEl, type TextEl } from '../types';

describe('parseHtmlToContentArray', () => {
  it('parses a plain paragraph', () => {
    const arr = parseHtmlToContentArray('<p>Hello world</p>');
    const texts = arr.filter((e): e is TextEl => e.type === ModelType.TEXT);
    expect(texts.length).toBe(1);
    expect(texts[0].text).toBe('Hello world');
  });

  it('parses a 3-bullet list at level 0', () => {
    const arr = parseHtmlToContentArray('<ul><li>First</li><li>Second</li><li>Third</li></ul>');
    const lines = arr.filter((e): e is LineEl => e.type === ModelType.LINE);
    const texts = arr.filter((e): e is TextEl => e.type === ModelType.TEXT);
    expect(lines.length).toBe(3);
    expect(lines.every((l) => l.params.bulleted === 0)).toBe(true);
    expect(texts.map((t) => t.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('parses nested bullet list with level bump', () => {
    const arr = parseHtmlToContentArray(
      '<ul><li>Outer<ul><li>Inner</li></ul></li></ul>'
    );
    const lines = arr.filter((e): e is LineEl => e.type === ModelType.LINE);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0].params.bulleted).toBe(0);
    expect(lines[lines.length - 1].params.bulleted).toBe(1);
  });

  it('extracts BlipEl from <span data-blip-thread="...">', () => {
    const arr = parseHtmlToContentArray(
      '<p>Hi <span data-blip-thread="abc">+</span> world</p>'
    );
    const blips = arr.filter((e): e is BlipEl => e.type === ModelType.BLIP);
    expect(blips.length).toBe(1);
    expect(blips[0].params.id).toBe('abc');
  });

  it('preserves bold + italic styling', () => {
    const arr = parseHtmlToContentArray('<p>This is <b>bold</b> and <i>italic</i>.</p>');
    const texts = arr.filter((e): e is TextEl => e.type === ModelType.TEXT);
    expect(texts.some((t) => t.params.bold === true)).toBe(true);
    expect(texts.some((t) => t.params.italic === true)).toBe(true);
  });

  it('captures heading level', () => {
    const arr = parseHtmlToContentArray('<h1>Title</h1><p>Body</p>');
    const lines = arr.filter((e): e is LineEl => e.type === ModelType.LINE);
    expect(lines[0]?.params.heading).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseHtmlToContentArray('')).toEqual([]);
    expect(parseHtmlToContentArray('   ')).toEqual([]);
  });

  it('handles a depth-3 fractal-like structure', () => {
    const html = `
      <h1>Try</h1>
      <ul>
        <li>First label by Claude<span data-blip-thread="b1">+</span></li>
        <li>Second label by Claude</li>
        <li>Third label by Claude</li>
      </ul>
    `;
    const arr = parseHtmlToContentArray(html);
    const blips = arr.filter((e): e is BlipEl => e.type === ModelType.BLIP);
    const texts = arr.filter((e): e is TextEl => e.type === ModelType.TEXT);
    expect(blips.length).toBe(1);
    expect(blips[0].params.id).toBe('b1');
    expect(texts.some((t) => t.text.includes('First label by Claude'))).toBe(true);
    expect(texts.some((t) => t.text.includes('Second label by Claude'))).toBe(true);
    expect(texts.some((t) => t.text.includes('Third label by Claude'))).toBe(true);
  });
});
