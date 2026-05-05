/**
 * WaveView tests (vitest, jsdom).
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { WaveView } from '../wave-view';
import { ContentArray, ModelType } from '../types';

const makeContent = (text: string): ContentArray => [
  { type: ModelType.LINE, text: ' ', params: {} },
  { type: ModelType.TEXT, text, params: {} },
];

const buildLookup = (data: Record<string, ContentArray>) =>
  (id: string): ContentArray | null => data[id] ?? null;

describe('WaveView', () => {
  it('lazily materializes a BlipView and seeds content from the lookup', () => {
    const lookup = buildLookup({ root: makeContent('Hello') });
    const wv = new WaveView({ contentByBlipId: lookup });
    const v = wv.getOrCreateView('root');
    expect(v.getId()).toBe('root');
    expect(v.getInner().textContent).toContain('Hello');
    expect(wv.size()).toBe(1);
  });

  it('memoizes — same id returns the same instance', () => {
    const wv = new WaveView({ contentByBlipId: () => null });
    const a = wv.getOrCreateView('x');
    const b = wv.getOrCreateView('x');
    expect(a).toBe(b);
  });

  it('setRoot installs the root BlipView container into rootContainer', () => {
    const lookup = buildLookup({ r: makeContent('Root content') });
    const wv = new WaveView({ contentByBlipId: lookup });
    wv.setRoot('r');
    expect(wv.getRootBlipId()).toBe('r');
    expect(wv.getRootContainer().children.length).toBe(1);
    expect(wv.getRootContainer().textContent).toContain('Root content');
  });

  it('resolves child references via the renderer\'s resolveChildBlip callback', () => {
    // Parent has a BLIP element pointing at child id "c".
    const data: Record<string, ContentArray> = {
      r: [
        { type: ModelType.LINE, text: ' ', params: {} },
        { type: ModelType.TEXT, text: 'parent ', params: {} },
        { type: ModelType.BLIP, text: ' ', params: { id: 'c' } },
      ],
      c: makeContent('child content'),
    };
    const wv = new WaveView({ contentByBlipId: buildLookup(data) });
    wv.setRoot('r');
    // Root render triggered child materialization.
    expect(wv.size()).toBe(2);
    expect(wv.getView('c')).toBeTruthy();
    expect(wv.getRootContainer().textContent).toContain('parent');
  });

  it('findViewForElement walks up the DOM via data-blip-id', () => {
    const wv = new WaveView({ contentByBlipId: buildLookup({ a: makeContent('A') }) });
    const v = wv.getOrCreateView('a');
    const inner = v.getInner();
    const span = document.createElement('span');
    inner.appendChild(span);
    expect(wv.findViewForElement(span)).toBe(v);
  });

  it('emits blip-added when a view is materialized', () => {
    const wv = new WaveView({ contentByBlipId: buildLookup({ a: makeContent('A') }) });
    const spy = vi.fn();
    wv.on('blip-added', spy);
    wv.getOrCreateView('a');
    wv.getOrCreateView('a'); // memoized — should not re-emit
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('removeView tears down the view + emits blip-removed', () => {
    const wv = new WaveView({ contentByBlipId: buildLookup({ a: makeContent('A') }) });
    const v = wv.getOrCreateView('a');
    const spy = vi.fn();
    wv.on('blip-removed', spy);
    wv.removeView('a');
    expect(wv.getView('a')).toBeUndefined();
    expect(v.isDestroyed()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('destroy() tears down all views, clears registry + emits destroyed', () => {
    const wv = new WaveView({ contentByBlipId: buildLookup({ a: makeContent('A'), b: makeContent('B') }) });
    wv.getOrCreateView('a');
    wv.getOrCreateView('b');
    const spy = vi.fn();
    wv.on('destroyed', spy);
    wv.destroy();
    expect(wv.size()).toBe(0);
    expect(wv.isDestroyed()).toBe(true);
    expect(wv.getRootContainer().children.length).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('getOrCreateView throws after destroy', () => {
    const wv = new WaveView({ contentByBlipId: () => null });
    wv.destroy();
    expect(() => wv.getOrCreateView('x')).toThrow(/destroyed/);
  });
});
