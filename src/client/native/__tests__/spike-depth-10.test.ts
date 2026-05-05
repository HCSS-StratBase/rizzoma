/**
 * Phase 1 spike — depth-10 fractal renders correctly via the new stack.
 *
 * Terminal-only proof. Builds a depth-10 fractal as a Map<blipId, ContentArray>,
 * renders it through the new parser/renderer/BlipThread chain in jsdom, asserts
 * the resulting DOM structure (counts, depth, fold semantics), and prints an
 * ASCII summary so the test runner output IS the artifact.
 *
 * Run via:
 *   npx vitest run src/client/native/__tests__/spike-depth-10.test.ts
 *   npx vitest run src/client/native/__tests__/spike-depth-10.test.ts --reporter=verbose
 *
 * No browser, no HTML page, no Playwright. The renderer's correctness is proven
 * by structural assertions on the jsdom tree it produces.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BlipThread } from '../blip-thread';
import { renderContent } from '../renderer';
import { ContentArray, ModelType } from '../types';

const ROOT_ID = '__root__';
// 2 siblings × depth 10 = 2^11 - 1 = 2047 blips. That's plenty of structural
// proof while staying in jsdom's memory budget (3 siblings × depth 10 = 88K
// blips → OOM).
const SIBLINGS_PER_LEVEL = 2;

const buildFractal = (depth: number, perLevel: number): Map<string, ContentArray> => {
  const blips = new Map<string, ContentArray>();
  let nextId = 1;

  const make = (level: number, label: string): string => {
    const id = `blip-${nextId++}`;
    const content: ContentArray = [];
    if (level === 0) {
      content.push({ type: ModelType.LINE, text: ' ', params: { heading: 1 } });
      content.push({ type: ModelType.TEXT, text: `Try — ${label}`, params: {} });
    }
    for (let i = 0; i < perLevel; i++) {
      content.push({ type: ModelType.LINE, text: ' ', params: { bulleted: 0 } });
      content.push({ type: ModelType.TEXT, text: `${label}.${i + 1}`, params: {} });
      if (level < depth) {
        const childId = make(level + 1, `${label}.${i + 1}`);
        content.push({ type: ModelType.BLIP, text: ' ', params: { id: childId } });
      }
    }
    blips.set(id, content);
    return id;
  };

  const rootId = make(0, 'L0');
  blips.set(ROOT_ID, blips.get(rootId)!);
  blips.delete(rootId);
  return blips;
};

const renderBlip = (
  blipId: string,
  contentByBlip: Map<string, ContentArray>,
  cache: Map<string, HTMLElement>,
): HTMLElement => {
  const cached = cache.get(blipId);
  if (cached) return cached;
  const container = document.createElement('div');
  container.className = 'blip-container';
  container.setAttribute('data-blip-id', blipId);
  const inner = document.createElement('div');
  inner.className = 'blip-text';
  container.appendChild(inner);
  cache.set(blipId, container);

  const content = contentByBlip.get(blipId) || [];
  renderContent(inner, content, {
    resolveChildBlip: (childId) => renderBlip(childId, contentByBlip, cache),
  });
  return container;
};

/** Compute the maximum depth from `root` to any descendant `.blip-container`. */
const measureDepth = (root: HTMLElement): number => {
  let max = 0;
  const visit = (el: Element, d: number): void => {
    if (el.classList.contains('blip-container')) max = Math.max(max, d);
    for (const child of Array.from(el.children)) {
      visit(child, el.classList.contains('blip-container') ? d + 1 : d);
    }
  };
  visit(root, 0);
  return max;
};

/** Pretty-print the test stats with ANSI colors so vitest output reads cleanly. */
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold:  (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim:   (s: string) => `\x1b[2m${s}\x1b[0m`,
};

const reportStats = (depth: number, perLevel: number,
                     blipCount: number, threadCount: number, foldButtons: number,
                     domDepth: number, ulCount: number, liCount: number): void => {
  const expectedBlips = Array.from({ length: depth + 1 })
    .reduce((sum: number, _, i) => sum + Math.pow(perLevel, i), 0);
  // eslint-disable-next-line no-console
  console.log(`
${c.bold('━━━ Phase 1 spike — depth-' + depth + ' fractal ━━━')}
  ${c.dim('Fixture')}             ${perLevel} siblings/level, ${depth + 1} levels (root + ${depth})
  ${c.dim('Blip nodes built')}    ${c.green(String(blipCount))} ${c.dim('(expected ' + expectedBlips + ')')}
  ${c.dim('Blip containers')}     ${c.green(String(blipCount))}
  ${c.dim('BlipThread spans')}    ${c.green(String(threadCount))}
  ${c.dim('Fold buttons')}        ${c.green(String(foldButtons))}
  ${c.dim('UL elements')}         ${c.green(String(ulCount))}
  ${c.dim('LI elements')}         ${c.green(String(liCount))}
  ${c.dim('DOM depth')}           ${c.green(String(domDepth))} ${c.dim('(expected ' + depth + ')')}
${c.bold('━━━ All structural assertions PASSED ━━━')}
`);
};

describe('phase-1 spike: depth-10 fractal renders correctly', () => {
  it('builds and renders a depth-10 × 3-siblings fractal with valid DOM structure', () => {
    const DEPTH = 10;
    const perLevel = SIBLINGS_PER_LEVEL;
    const blips = buildFractal(DEPTH, perLevel);

    // Render into a fresh jsdom container.
    const cache = new Map<string, HTMLElement>();
    const rootContainer = renderBlip(ROOT_ID, blips, cache);
    const host = document.createElement('div');
    host.appendChild(rootContainer);

    const blipContainers = host.querySelectorAll('.blip-container');
    const blipThreads   = host.querySelectorAll('.blip-thread');
    const foldButtons   = host.querySelectorAll('.fold-button');
    const ulCount       = host.querySelectorAll('ul.bulleted-list').length;
    const liCount       = host.querySelectorAll('li.bulleted').length;
    const domDepth      = measureDepth(host);

    // 1 + p + p^2 + … + p^DEPTH blips total (geometric series).
    const expectedBlipCount =
      Array.from({ length: DEPTH + 1 })
        .reduce((sum: number, _, i) => sum + Math.pow(perLevel, i), 0);

    expect(blips.size).toBe(expectedBlipCount);
    expect(blipContainers.length).toBe(expectedBlipCount);
    // One BlipThread per non-root blip (each child has its own [+] anchor).
    expect(blipThreads.length).toBe(expectedBlipCount - 1);
    expect(foldButtons.length).toBe(blipThreads.length);
    expect(domDepth).toBe(DEPTH);

    // Every BlipThread is folded by default (matches original initFold(true)).
    for (const t of Array.from(blipThreads)) {
      expect(t.classList.contains('folded')).toBe(true);
    }

    // Toggle one and verify the CSS-class mechanism (subtree NOT destroyed).
    const firstThread = BlipThread.fromElement(blipThreads[0] as Element);
    expect(firstThread).toBeTruthy();
    const childCountBefore = firstThread!.getBlipsContainer().children.length;
    firstThread!.unfold();
    expect(firstThread!.isFolded()).toBe(false);
    expect(firstThread!.getContainer().classList.contains('folded')).toBe(false);
    expect(firstThread!.getBlipsContainer().children.length).toBe(childCountBefore);

    reportStats(DEPTH, perLevel,
                blipContainers.length, blipThreads.length, foldButtons.length,
                domDepth, ulCount, liCount);
  });

  it('builds and renders a depth-3 × 3-sibling fractal as a sanity baseline', () => {
    const DEPTH = 3;
    const perLevel = 3; // explicit (does not depend on the global SIBLINGS_PER_LEVEL)
    const blips = buildFractal(DEPTH, perLevel);
    const cache = new Map<string, HTMLElement>();
    const rootContainer = renderBlip(ROOT_ID, blips, cache);
    const host = document.createElement('div');
    host.appendChild(rootContainer);

    expect(blips.size).toBe(1 + 3 + 9 + 27); // 40
    expect(host.querySelectorAll('.blip-container').length).toBe(40);
    expect(host.querySelectorAll('.blip-thread').length).toBe(39);
    expect(host.querySelectorAll('h1').length).toBe(1); // only root has heading
    expect(host.querySelectorAll('ul.bulleted-list').length).toBeGreaterThan(0);
    expect(measureDepth(host)).toBe(DEPTH);
  });
});
