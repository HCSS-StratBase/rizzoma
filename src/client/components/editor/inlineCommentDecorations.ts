import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { InlineComment } from '@shared/types/comments';

export type CommentGroup = { range: InlineComment['range']; comments: InlineComment[] };

export const splitRangeAcrossTextblocks = (
  doc: ProseMirrorNode,
  start: number,
  end: number
): Array<[number, number]> => {
  const maxPos = Math.max(0, doc.content.size);
  const clampedStart = Math.max(0, Math.min(start, maxPos));
  const clampedEnd = Math.max(clampedStart, Math.min(end, maxPos));
  const segments: Array<[number, number]> = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const blockStart = pos + 1;
    const blockEnd = pos + node.nodeSize - 1;
    if (clampedEnd <= blockStart || clampedStart >= blockEnd) return;
    const segStart = Math.max(blockStart, clampedStart);
    const segEnd = Math.min(blockEnd, clampedEnd);
    if (segStart < segEnd) {
      segments.push([segStart, segEnd]);
    }
  });

  return segments;
};

export const buildCommentDecorationSet = (
  doc: ProseMirrorNode,
  grouped: Map<string, CommentGroup>
): DecorationSet => {
  const decorations: Decoration[] = [];
  grouped.forEach(({ range, comments }, key) => {
    const spans = splitRangeAcrossTextblocks(doc, range.start, range.end);
    spans.forEach(([from, to]) => {
      decorations.push(
        Decoration.inline(
          from,
          to,
          {
            class: 'commented-text',
            'data-comment-range': key,
            'data-comment-count': String(comments.length),
          },
          { inclusiveStart: true, inclusiveEnd: true }
        )
      );
    });
  });
  return DecorationSet.create(doc, decorations);
};
