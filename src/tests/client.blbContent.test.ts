import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_BLB_HTML,
  ensureBlbHtml,
  ensureTopicBlbHtml,
  isBlbHtml,
  isTopicBlbHtml,
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

    expect(topicSeedHtml(`O'Brien "review" & <scope>`)).toBe(
      `<h1>O'Brien &quot;review&quot; &amp; &lt;scope&gt;</h1><ul><li><p></p></li></ul>`,
    );
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
    expect(isBlbHtml('<ul data-test=">"><li><p>Nested</p><ul><li><p>Leaf</p></li></ul></li></ul>')).toBe(true);
    expect(isBlbHtml('<ul></ul>')).toBe(false);
    expect(isBlbHtml('<ul><p>Not a label</p></ul>')).toBe(false);
    expect(isBlbHtml('<ul>bare text<li><p>Label</p></li></ul>')).toBe(false);

    const taskRoot = '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Task</p></li></ul>';
    expect(isBlbHtml(taskRoot)).toBe(false);
    const normalizedTaskRoot = ensureBlbHtml(taskRoot);
    expect(isBlbHtml(normalizedTaskRoot)).toBe(true);
    const taskEditor = new Editor({ extensions: [StarterKit as any, TaskList, TaskItem], content: normalizedTaskRoot });
    expect(taskEditor.getJSON().content?.[0]?.type).toBe('bulletList');
    taskEditor.destroy();
  });

  it('normalizes the full document instead of accepting a UL with an orphan block', () => {
    const mixed = '<ul><li><p>List label</p></li></ul><p>Orphan</p>';
    expect(isBlbHtml(mixed)).toBe(false);
    expect(ensureBlbHtml(mixed)).toBe(`<ul><li>${mixed}</li></ul>`);
    expect(isBlbHtml(ensureBlbHtml(mixed))).toBe(true);

    const malformed = '<p title="unterminated>text';
    expect(ensureBlbHtml(malformed)).toBe(
      '<ul><li><p>&lt;p title=&quot;unterminated&gt;text</p></li></ul>',
    );
    expect(isBlbHtml(ensureBlbHtml(malformed))).toBe(true);
  });

  it('uses the authoritative topic title and discards a caller-provided H1', () => {
    expect(ensureTopicBlbHtml('Fallback title', '<h1>Stored title</h1><p>One</p><p>Two</p>')).toBe(
      '<h1>Fallback title</h1><ul><li><p>One</p></li><li><p>Two</p></li></ul>',
    );
    expect(ensureTopicBlbHtml('A <safe> title', '<h1 class="stale">Wrong</h1>')).toBe(
      '<h1>A &lt;safe&gt; title</h1><ul><li><p></p></li></ul>',
    );
    expect(isTopicBlbHtml(
      'Fallback title',
      '<h1>Fallback title</h1><ul><li><p>One</p></li></ul>',
    )).toBe(true);
    expect(isTopicBlbHtml(
      'Fallback title',
      '<h1>Wrong title</h1><ul><li><p>One</p></li></ul>',
    )).toBe(false);
    expect(isTopicBlbHtml(
      `O'Brien "review" & <scope>`,
      `<h1>O'Brien "review" &amp; &lt;scope&gt;</h1><ul><li><p>One</p></li></ul>`,
    )).toBe(true);
    expect(isTopicBlbHtml(
      'Formatted title',
      '<h1><strong>Formatted title</strong></h1><ul><li><p>One</p></li></ul>',
    )).toBe(false);
    expect(isTopicBlbHtml('', '<h1></h1><ul><li><p>One</p></li></ul>')).toBe(false);
  });

  it('handles a large malformed block document in bounded time', () => {
    const malformed = '<p>'.repeat(32_768);
    const startedAt = performance.now();
    const normalized = ensureBlbHtml(malformed);
    const elapsedMs = performance.now() - startedAt;
    expect(normalized).toBe(`<ul><li>${malformed}</li></ul>`);
    expect(elapsedMs).toBeLessThan(750);

    const manyBlocks = '<p>label</p>'.repeat(8_192);
    const manyBlocksStartedAt = performance.now();
    const normalizedBlocks = ensureBlbHtml(manyBlocks);
    const manyBlocksElapsedMs = performance.now() - manyBlocksStartedAt;
    expect(normalizedBlocks.startsWith('<ul><li><p>label</p></li>')).toBe(true);
    expect(normalizedBlocks.endsWith('<li><p>label</p></li></ul>')).toBe(true);
    expect(manyBlocksElapsedMs).toBeLessThan(750);
  });
});
