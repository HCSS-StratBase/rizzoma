/**
 * Phase 1 recursion fix — the native content lookup drives full-depth render
 * from parentId-only data (NO `data-blip-thread` markers in the HTML).
 *
 * This is the exact condition that made the read path stop at depth 2: the
 * React store keeps nesting as parentId relationships and injects markers only
 * at render time, so persisted HTML carries no child markers. buildNativeContentLookup
 * must synthesize the BLIP elements from the tree so WaveView recurses all the
 * way down.
 *
 * Unlike spike-depth-10.test.ts (which used an ad-hoc recursive resolver), this
 * test drives the REAL WaveView.resolveChild → getOrCreateView → setContent →
 * render cascade, i.e. the production path.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildNativeContentLookup, type NativeBlipInput } from '../content-lookup';
import { WaveView } from '../wave-view';
import { ModelType } from '../types';

/** Build a linear chain root → c1 → c2 → … of the given depth, markerless HTML. */
const buildChain = (rootId: string, depth: number): NativeBlipInput[] => {
  const blips: NativeBlipInput[] = [
    { id: rootId, content: '<h1>Root label</h1>', parentId: null },
  ];
  let parent = rootId;
  for (let i = 1; i <= depth; i++) {
    const id = `b${i}`;
    // Deliberately markerless: a plain bulleted label, no data-blip-thread span.
    blips.push({ id, content: `<ul><li>Label ${i}</li></ul>`, parentId: parent });
    parent = id;
  }
  return blips;
};

/** Build a balanced tree: `perLevel` children per node, `depth` levels deep. */
const buildTree = (rootId: string, depth: number, perLevel: number): NativeBlipInput[] => {
  const blips: NativeBlipInput[] = [
    { id: rootId, content: '<h1>Root</h1>', parentId: null },
  ];
  let next = 1;
  const grow = (parentId: string, level: number): void => {
    if (level > depth) return;
    for (let i = 0; i < perLevel; i++) {
      const id = `n${next++}`;
      blips.push({ id, content: `<ul><li>node ${id}</li></ul>`, parentId });
      grow(id, level + 1);
    }
  };
  grow(rootId, 1);
  return blips;
};

describe('buildNativeContentLookup — synthesizes BLIP elements from the tree', () => {
  it('emits one BLIP element per child, ignoring absent markers', () => {
    const blips = buildChain('root', 3);
    const lookup = buildNativeContentLookup('root', blips);

    const rootContent = lookup('root')!;
    const blipEls = rootContent.filter((e) => e.type === ModelType.BLIP);
    expect(blipEls.length).toBe(1);
    expect((blipEls[0] as { params: { id: string } }).params.id).toBe('b1');

    // The last blip in the chain has no children → no BLIP elements.
    expect(lookup('b3')!.filter((e) => e.type === ModelType.BLIP).length).toBe(0);
    // Unknown id → null (renderer emits a placeholder, never crashes).
    expect(lookup('does-not-exist')).toBeNull();
  });

  it('drops persisted markers so a child is never rendered twice', () => {
    const blips: NativeBlipInput[] = [
      { id: 'root', content: '<h1>Root</h1>', parentId: null },
      // This parent's HTML DOES carry a stale marker for its child.
      { id: 'p', content: '<ul><li>Has marker <span data-blip-thread="c"></span></li></ul>', parentId: 'root' },
      { id: 'c', content: '<ul><li>Child</li></ul>', parentId: 'p' },
    ];
    const lookup = buildNativeContentLookup('root', blips);
    const pBlips = lookup('p')!.filter((e) => e.type === ModelType.BLIP);
    expect(pBlips.length).toBe(1); // exactly one, not two
    expect((pBlips[0] as { params: { id: string } }).params.id).toBe('c');
  });

  it('WaveView renders a markerless depth-10 chain to full depth', () => {
    const DEPTH = 10;
    const blips = buildChain('root', DEPTH);
    const lookup = buildNativeContentLookup('root', blips);

    const wv = new WaveView({ contentByBlipId: lookup });
    wv.setRoot('root');
    const host = document.createElement('div');
    host.appendChild(wv.getRootContainer());

    // root + 10 descendants = 11 containers, 10 threads.
    expect(host.querySelectorAll('.blip-container').length).toBe(DEPTH + 1);
    expect(host.querySelectorAll('.blip-thread').length).toBe(DEPTH);
    // No stranded placeholders — every BLIP element resolved to a real child.
    expect(host.querySelectorAll('.blip-thread-placeholder').length).toBe(0);

    // Deepest container is nested DEPTH threads down.
    const deepest = host.querySelector('[data-blip-id="b10"]');
    expect(deepest).toBeTruthy();
    let threadsAbove = 0;
    let cur: Element | null = deepest;
    while (cur) {
      if (cur.classList?.contains('blip-thread')) threadsAbove++;
      cur = cur.parentElement;
    }
    expect(threadsAbove).toBe(DEPTH);
  });

  it('WaveView renders a balanced 3×3 tree from parentId data', () => {
    const blips = buildTree('root', 3, 3); // 1 + 3 + 9 + 27 = 40
    const lookup = buildNativeContentLookup('root', blips);
    const wv = new WaveView({ contentByBlipId: lookup });
    wv.setRoot('root');
    const host = document.createElement('div');
    host.appendChild(wv.getRootContainer());

    expect(host.querySelectorAll('.blip-container').length).toBe(40);
    expect(host.querySelectorAll('.blip-thread').length).toBe(39);
    expect(host.querySelectorAll('.blip-thread-placeholder').length).toBe(0);
  });
});
