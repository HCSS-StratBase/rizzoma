import { describe, it, expect } from 'vitest';
import { schema } from '@tiptap/pm/schema-basic';
import { Mapping, StepMap } from '@tiptap/pm/transform';
import { buildCommentDecorationSet, splitRangeAcrossTextblocks } from '../client/components/editor/inlineCommentDecorations';
import type { InlineComment } from '@shared/types/comments';

const makeInlineComment = (range: InlineComment['range'], id: string, resolved = false): InlineComment => ({
  id,
  blipId: 'b1',
  userId: 'tester',
  userName: 'Tester',
  content: 'content',
  range,
  createdAt: 0,
  updatedAt: 0,
  resolved,
  resolvedAt: resolved ? Date.now() : null,
});

const groupByRange = (comments: InlineComment[]) => {
  const map = new Map<string, { range: InlineComment['range']; comments: InlineComment[] }>();
  comments.forEach((comment) => {
    const key = `${comment.range.start}:${comment.range.end}`;
    if (!map.has(key)) {
      map.set(key, { range: comment.range, comments: [] });
    }
    map.get(key)!.comments.push(comment);
  });
  return map;
};

const collectBlocks = (doc: any) => {
  const blocks: Array<{ start: number; end: number }> = [];
  doc.descendants((node: any, pos: number) => {
    if (!node.isTextblock) return;
    blocks.push({ start: pos + 1, end: pos + node.nodeSize - 1 });
  });
  return blocks;
};

describe('inline comment decorations', () => {
  it('splits multi-block ranges into block-scoped decorations', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('hello')]),
      schema.node('paragraph', null, [schema.text('world')]),
    ]);
    const [first, second] = collectBlocks(doc);
    const spans = splitRangeAcrossTextblocks(doc, first.start + 1, second.start + 3);

    expect(spans.length).toBe(2);
    expect(spans[0][0]).toBeGreaterThan(first.start);
    expect(spans[1][1]).toBeLessThanOrEqual(second.end);
  });

  it('creates decorations for overlapping ranges', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('abcdef')]),
    ]);
    const [block] = collectBlocks(doc);
    const r1 = { start: block.start + 1, end: block.start + 4, text: 'bcd' };
    const r2 = { start: block.start + 3, end: block.start + 6, text: 'def' };
    const grouped = groupByRange([
      makeInlineComment(r1, 'c1'),
      makeInlineComment(r2, 'c2', true),
    ]);

    const decorations = buildCommentDecorationSet(doc, grouped).find();
    expect(decorations.length).toBe(2);
    const fromPositions = decorations.map((d) => [d.from, d.to]);
    expect(fromPositions.some(([from, to]) => from <= r1.start && to >= r1.end)).toBe(true);
    expect(fromPositions.some(([from, to]) => from <= r2.start && to >= r2.end)).toBe(true);
  });

  it('maps decoration positions forward when document shifts', () => {
    const originalDoc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('hello')]),
    ]);
    const [block] = collectBlocks(originalDoc);
    const range = { start: block.start, end: block.start + 3, text: 'hel' };
    const grouped = groupByRange([makeInlineComment(range, 'c1')]);
    const decorationSet = buildCommentDecorationSet(originalDoc, grouped);
    const firstDeco = decorationSet.find()[0];

    const mapping = new Mapping([StepMap.offset(3)]);
    const shiftedDoc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('***hello')]),
    ]);

    const mapped = decorationSet.map(mapping, shiftedDoc).find();
    expect(mapped[0].from).toBe(firstDeco.from + 3);
    expect(mapped[0].to).toBe(firstDeco.to + 3);
  });
});
