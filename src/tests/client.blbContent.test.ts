import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_BLB_HTML,
  ensureBlbHtml,
  ensureTopicBlbHtml,
  plainTextToBlbHtml,
  topicSeedHtml,
} from '../shared/blbContent';

describe('BLB creation content', () => {
  it('seeds every new topic with an H1 followed by an empty bullet label', () => {
    const html = topicSeedHtml('A <safe> topic');
    expect(html).toBe('<h1>A &lt;safe&gt; topic</h1><ul><li><p></p></li></ul>');

    const editor = new Editor({ extensions: [StarterKit as any], content: html });
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'A <safe> topic' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      ],
    });
    editor.destroy();
  });

  it('maps plain-text reply lines to separate bullet labels and escapes markup', () => {
    expect(plainTextToBlbHtml('First label\n\nSecond <label>')).toBe(
      '<ul><li><p>First label</p></li><li><p>Second &lt;label&gt;</p></li></ul>',
    );
    expect(ensureBlbHtml('Latency < 5 ms & loss > 0')).toBe(
      '<ul><li><p>Latency &lt; 5 ms &amp; loss &gt; 0</p></li></ul>',
    );
  });

  it('normalizes empty, plain, and paragraph HTML while preserving an existing UL', () => {
    expect(ensureBlbHtml('')).toBe(EMPTY_BLB_HTML);
    expect(ensureBlbHtml('Plain reply')).toBe('<ul><li><p>Plain reply</p></li></ul>');
    expect(ensureBlbHtml('<p>One</p><p>Two</p>')).toBe(
      '<ul><li><p>One</p></li><li><p>Two</p></li></ul>',
    );
    expect(ensureBlbHtml('<ul><li><p>Already BLB</p></li></ul>')).toBe(
      '<ul><li><p>Already BLB</p></li></ul>',
    );
  });

  it('normalizes the topic body without nesting the title in a bullet', () => {
    expect(ensureTopicBlbHtml('Fallback title', '<h1>Stored title</h1><p>One</p><p>Two</p>')).toBe(
      '<h1>Stored title</h1><ul><li><p>One</p></li><li><p>Two</p></li></ul>',
    );
  });
});
