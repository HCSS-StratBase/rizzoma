/**
 * Y.js binding tests — convergence between two Y.Doc instances exchanging
 * updates, and round-trip ContentArray ↔ Y.Array<Y.Map>.
 *
 * Phase 3 (#54). Vitest, no jsdom needed — pure CRDT.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  TopicDoc,
  elementToYMap,
  yMapToElement,
  insertBlipMarker,
  insertText,
  insertLine,
  removeAt,
} from '../yjs-binding';
import { ContentArray, ModelType } from '../types';

const sample = (): ContentArray => [
  { type: ModelType.LINE, text: ' ', params: { bulleted: 0 } },
  { type: ModelType.TEXT, text: 'First', params: {} },
  { type: ModelType.LINE, text: ' ', params: { bulleted: 0 } },
  { type: ModelType.TEXT, text: 'Second', params: { bold: true } },
];

// Helper: integrate a fresh Y.Map into a Y.Array in a Y.Doc and read it back.
// Y.Maps need to be inside a Y.Doc to retain their state on get(); calling
// yMapToElement on an unintegrated map silently returns undefined fields.
const integrate = (el: any): { back: any } => {
  const doc = new Y.Doc();
  const yarr = doc.getArray<Y.Map<unknown>>('test');
  yarr.insert(0, [elementToYMap(el)]);
  return { back: yMapToElement(yarr.get(0)) };
};

describe('elementToYMap / yMapToElement round-trip', () => {
  it('round-trips a TEXT element with styling', () => {
    const { back } = integrate({ type: ModelType.TEXT, text: 'hi', params: { bold: true, italic: true } });
    expect(back.type).toBe('text');
    expect(back.text).toBe('hi');
    expect(back.params).toEqual({ bold: true, italic: true });
  });

  it('round-trips a LINE with bullet level', () => {
    const { back } = integrate({ type: ModelType.LINE, text: ' ', params: { bulleted: 2 } });
    expect(back.params).toEqual({ bulleted: 2 });
  });

  it('round-trips a BLIP with id + threadId', () => {
    const { back } = integrate({ type: ModelType.BLIP, text: ' ', params: { id: 'b1', threadId: 't1' } });
    expect(back.type).toBe('blip');
    expect(back.params).toEqual({ id: 'b1', threadId: 't1' });
  });
});

describe('TopicDoc seed + snapshot', () => {
  it('seeds and snapshots a ContentArray', () => {
    const td = new TopicDoc();
    td.seed(sample());
    const out = td.snapshot();
    expect(out.length).toBe(4);
    expect(out[0].type).toBe('line');
    expect(out[1].text).toBe('First');
    expect(out[3].params).toEqual({ bold: true });
  });

  it('snapshot is empty before seeding', () => {
    expect(new TopicDoc().snapshot()).toEqual([]);
  });

  it('observe fires on content change', () => {
    const td = new TopicDoc();
    td.seed(sample());
    const seen: ContentArray[] = [];
    const off = td.observe((s) => seen.push(s));
    insertText(td.content, 'x', 4);
    insertLine(td.content, td.content.length);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    off();
  });
});

describe('mutation helpers', () => {
  it('inserts BLIP marker after a LINE index', () => {
    const td = new TopicDoc();
    td.seed(sample());
    insertBlipMarker(td.content, 'b1', 0); // after line idx 0
    const out = td.snapshot();
    expect(out.length).toBe(5);
    expect(out[1].type).toBe('blip');
    expect((out[1].params as { id: string }).id).toBe('b1');
  });

  it('inserts TEXT at index', () => {
    const td = new TopicDoc();
    td.seed(sample());
    insertText(td.content, 'inserted', 1);
    const out = td.snapshot();
    expect(out[1].text).toBe('inserted');
  });

  it('inserts LINE at end', () => {
    const td = new TopicDoc();
    td.seed(sample());
    const before = td.content.length;
    insertLine(td.content, before, { heading: 1 });
    const out = td.snapshot();
    expect(out.length).toBe(before + 1);
    expect(out[before].type).toBe('line');
    expect(out[before].params).toEqual({ heading: 1 });
  });

  it('removeAt deletes the element', () => {
    const td = new TopicDoc();
    td.seed(sample());
    removeAt(td.content, 1);
    const out = td.snapshot();
    expect(out.length).toBe(3);
    expect(out[0].type).toBe('line');
    expect(out[1].type).toBe('line');
  });
});

describe('two-Y.Doc convergence (cross-tab simulation)', () => {
  /** Wire two docs to exchange updates bidirectionally. */
  const wire = (a: Y.Doc, b: Y.Doc) => {
    a.on('update', (u) => Y.applyUpdate(b, u));
    b.on('update', (u) => Y.applyUpdate(a, u));
  };

  it('converges after seeding on one side', () => {
    const ta = new TopicDoc();
    const tb = new TopicDoc();
    wire(ta.doc, tb.doc);
    ta.seed(sample());
    expect(tb.snapshot()).toEqual(ta.snapshot());
  });

  it('converges after concurrent insertions', () => {
    const ta = new TopicDoc();
    const tb = new TopicDoc();
    wire(ta.doc, tb.doc);
    ta.seed(sample());
    // Parallel mutations
    insertBlipMarker(ta.content, 'a-from-A', 0);
    insertText(tb.content, 'from-B', 0);
    expect(tb.snapshot()).toEqual(ta.snapshot());
    expect(ta.content.length).toBe(6);
    // Both sides see the BLIP and the new TEXT.
    const ids = ta.snapshot().filter(e => e.type === 'blip').map(e => (e.params as { id: string }).id);
    expect(ids).toContain('a-from-A');
    const texts = ta.snapshot().filter(e => e.type === 'text').map(e => e.text);
    expect(texts).toContain('from-B');
  });

  it('observe fires on REMOTE updates', () => {
    const ta = new TopicDoc();
    const tb = new TopicDoc();
    wire(ta.doc, tb.doc);
    ta.seed(sample());
    let bSnapshots = 0;
    const off = tb.observe(() => { bSnapshots++; });
    insertText(ta.content, 'local-on-A', ta.content.length);
    expect(bSnapshots).toBeGreaterThan(0);
    off();
  });
});

describe('per-blip XmlFragment for TipTap Collaboration', () => {
  it('returns a stable Y.XmlFragment per blipId', () => {
    const td = new TopicDoc();
    const f1 = td.blipFragment('blip-1');
    const f2 = td.blipFragment('blip-1');
    const f3 = td.blipFragment('blip-2');
    expect(f1).toBe(f2);
    expect(f1).not.toBe(f3);
  });
});
