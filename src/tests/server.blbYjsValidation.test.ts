import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { isBlbProsemirrorDocument, isBlbYjsDocument } from '../server/lib/blbYjsValidation.js';

const paragraph = { type: 'paragraph' };
const bulletList = {
  type: 'bulletList',
  content: [{ type: 'listItem', content: [paragraph] }],
};

describe('BLB ProseMirror document validation', () => {
  it('accepts only unordered-list top-level nodes for ordinary blips', () => {
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [bulletList] }, false)).toBe(true);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [bulletList, bulletList] }, false)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [paragraph] }, false)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [bulletList, paragraph] }, false)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [] }, false)).toBe(false);
  });

  it('requires one H1 followed exclusively by unordered lists for topic roots', () => {
    const title = { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Topic' }] };
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [title, bulletList] }, true)).toBe(true);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [title, bulletList, bulletList] }, true)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [title] }, true)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [title, bulletList, paragraph] }, true)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Topic' }] }, bulletList] }, true)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }, bulletList] }, true)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Topic', marks: [{ type: 'bold' }] }] }, bulletList] }, true)).toBe(false);
    expect(isBlbProsemirrorDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'mention' }] }, bulletList] }, true)).toBe(false);
  });

  it('ignores unrelated shared maps but rejects an empty editor fragment', () => {
    const unrelated = new Y.Doc();
    unrelated.getMap('content').set('value', 'not a TipTap document');
    expect(isBlbYjsDocument(unrelated, false)).toBe(true);

    const emptyEditor = new Y.Doc();
    emptyEditor.getXmlFragment('default');
    expect(isBlbYjsDocument(emptyEditor, false)).toBe(false);

    const poisonedMap = new Y.Doc();
    poisonedMap.getMap('default').set('value', 'wrong shared type');
    expect(isBlbYjsDocument(poisonedMap, false)).toBe(false);

    const poisonedText = new Y.Doc();
    poisonedText.getText('default').insert(0, 'wrong shared type');
    expect(isBlbYjsDocument(poisonedText, false)).toBe(false);

    const remotelyDecodedPoison = new Y.Doc();
    Y.applyUpdate(remotelyDecodedPoison, Y.encodeStateAsUpdate(poisonedText));
    expect(() => isBlbYjsDocument(remotelyDecodedPoison, false)).not.toThrow();
    expect(isBlbYjsDocument(remotelyDecodedPoison, false)).toBe(false);

    unrelated.destroy();
    emptyEditor.destroy();
    poisonedMap.destroy();
    poisonedText.destroy();
    remotelyDecodedPoison.destroy();
  });
});
