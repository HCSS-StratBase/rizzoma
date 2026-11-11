// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginChildTypeahead,
  cancelChildTypeahead,
  flushChildTypeahead,
  isChildTypeaheadActive,
  peekChildTypeahead,
  type TypeaheadToken,
} from '../client/lib/inlineChildTypeahead';

const press = (key: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(ev);
  return ev;
};

afterEach(() => {
  cancelChildTypeahead(() => {});
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('inline child type-ahead (Ctrl+Enter)', () => {
  it('holds typed keys so they never reach the parent, then replays them into the child', () => {
    beginChildTypeahead({ insert: () => {} });
    const ev = press('L');
    'L2 label'.slice(1).split('').forEach((k) => press(k));
    expect(ev.defaultPrevented).toBe(true);
    expect(peekChildTypeahead()).toEqual([{ text: 'L2 label' }]);

    const child = document.createElement('div');
    child.tabIndex = 0;
    document.body.appendChild(child);
    const got: TypeaheadToken[][] = [];
    flushChildTypeahead(child, (_t, tokens) => got.push(tokens));
    expect(got).toEqual([[{ text: 'L2 label' }]]);
    expect(document.activeElement).toBe(child);
    expect(isChildTypeaheadActive()).toBe(false);
  });

  it('applies Backspace to held text and keeps Enter as a structural key', () => {
    beginChildTypeahead({ insert: () => {} });
    ['a', 'b', 'Backspace', 'c', 'Enter', 'd'].forEach((k) => press(k));
    expect(peekChildTypeahead()).toEqual([{ text: 'ac' }, { key: 'Enter' }, { text: 'd' }]);
  });

  it('swallows a second Ctrl+Enter but lets other shortcuts through', () => {
    beginChildTypeahead({ insert: () => {} });
    expect(press('Enter', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(press('c', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(peekChildTypeahead()).toEqual([]);
  });

  it('returns held text to where it was typed if the child never becomes ready', () => {
    vi.useFakeTimers();
    const parent = document.createElement('div');
    parent.tabIndex = 0;
    document.body.appendChild(parent);
    parent.focus();
    const got: Array<[HTMLElement, TypeaheadToken[]]> = [];
    beginChildTypeahead({ timeoutMs: 1000, insert: (t, tokens) => got.push([t, tokens]) });
    press('x');
    vi.advanceTimersByTime(1001);
    expect(got).toEqual([[parent, [{ text: 'x' }]]]);
    expect(isChildTypeaheadActive()).toBe(false);
  });
});
