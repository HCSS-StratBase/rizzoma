import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../client/lib/api', () => ({ api: vi.fn(), ensureCsrf: vi.fn(async () => 'csrf-test') }));

import { InlineHtmlRenderer } from '../client/components/blip/InlineHtmlRenderer';

const CHILD = 'topic-1:b1';
const SIBLING = 'topic-1:b2';
// A tag row whose <li> holds a nested list: the shape a legacy topic body takes
// after BLB normalization (live topic "Russian Red Lines - 2026").
const NESTED_HTML = `<ul><li><p>#RuBase</p><ul>`
  + `<li><p>Oneliner <span class="blip-thread-host"><span class="blip-thread-marker" data-blip-thread="${CHILD}">+</span></span></p></li>`
  + `<li><p>Background <span class="blip-thread-host"><span class="blip-thread-marker" data-blip-thread="${SIBLING}">+</span></span></p></li>`
  + `<li><p>Progress</p></li>`
  + `</ul></li></ul>`;

const child = (id: string) => ({ id, content: '<ul><li><p>child</p></li></ul>', isRead: true }) as any;

describe('parity view: inline child anchors to its own bullet', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const render = (expanded: string[], html = NESTED_HTML) => act(() => {
    root.render(
      <InlineHtmlRenderer
        taskBlipId="topic-1"
        html={html}
        inlineChildren={[child(CHILD), child(SIBLING)]}
        expandedSet={new Set(expanded)}
        renderInlineChild={(id) => <span data-test-child={id}>expanded {id}</span>}
      />,
    );
  });

  it('places a sub-bullet child directly inside that sub-bullet, not after the whole outer item', () => {
    render([CHILD]);
    const placed = container.querySelector(`.inline-child-expanded[data-inline-child="${CHILD}"]`);
    expect(placed).not.toBeNull();
    const ownerLi = placed!.closest('li');
    expect(ownerLi?.textContent).toContain('Oneliner');
    expect(ownerLi?.textContent).not.toContain('Background');
    // It must come before the next sibling bullet in document order.
    const background = [...container.querySelectorAll('li')].find((li) => li.textContent?.startsWith('Background'))!;
    expect(placed!.compareDocumentPosition(background) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll(`[data-inline-child="${CHILD}"]`)).toHaveLength(1);
  });

  it('keeps each expanded child under its own bullet when several are open', () => {
    render([CHILD, SIBLING]);
    const one = container.querySelector(`[data-inline-child="${CHILD}"]`)!.closest('li')!;
    const two = container.querySelector(`[data-inline-child="${SIBLING}"]`)!.closest('li')!;
    expect(one.textContent).toContain('Oneliner');
    expect(two.textContent).toContain('Background');
    expect(one).not.toBe(two);
  });

  it('still anchors a marker in a top-level paragraph after that paragraph', () => {
    render([CHILD], `<p>Lead <span class="blip-thread-host"><span class="blip-thread-marker" data-blip-thread="${CHILD}">+</span></span></p><p>After</p>`);
    const placed = container.querySelector(`[data-inline-child="${CHILD}"]`)!;
    expect(placed.previousElementSibling?.textContent).toContain('Lead');
    expect(placed.nextElementSibling?.textContent).toContain('After');
  });
});
