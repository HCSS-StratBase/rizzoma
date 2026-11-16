import { describe, expect, it } from 'vitest';
import { isBlankPlaceholderOverwrite } from '../shared/topicProjectionGuard';

const stored = {
  existingTitle: 'Deep Fractal (8-Level)',
  existingContent: '<h1>Deep Fractal (8-Level)</h1><ul><li><p>Oneliner</p></li><li><p>Background</p></li></ul>',
};

describe('isBlankPlaceholderOverwrite (incident 2026-11-16)', () => {
  it('blocks the exact blank "Untitled" projection over a real topic', () => {
    expect(isBlankPlaceholderOverwrite({
      incomingTitle: 'Untitled',
      incomingContent: '<h1>Untitled</h1><ul><li><p></p></li></ul>',
      ...stored,
    })).toBe(true);
  });
  it('allows a normal edit', () => {
    expect(isBlankPlaceholderOverwrite({
      incomingTitle: 'Deep Fractal (8-Level)',
      incomingContent: '<h1>Deep Fractal (8-Level)</h1><ul><li><p>Edited</p></li></ul>',
      ...stored,
    })).toBe(false);
  });
  it('allows a non-placeholder blank-body retitle', () => {
    expect(isBlankPlaceholderOverwrite({
      incomingTitle: 'New name',
      incomingContent: '<h1>New name</h1><ul><li><p></p></li></ul>',
      ...stored,
    })).toBe(false);
  });
  it('allows Untitled over an already empty or Untitled topic', () => {
    expect(isBlankPlaceholderOverwrite({
      incomingTitle: 'Untitled',
      incomingContent: '<h1>Untitled</h1><ul><li><p></p></li></ul>',
      existingTitle: 'Untitled',
      existingContent: '<h1>Untitled</h1><ul><li><p></p></li></ul>',
    })).toBe(false);
    expect(isBlankPlaceholderOverwrite({
      incomingTitle: 'Untitled',
      incomingContent: '<h1>Untitled</h1><ul><li><p></p></li></ul>',
      existingTitle: 'Real title',
      existingContent: '<h1>Real title</h1><ul><li><p></p></li></ul>',
    })).toBe(false);
  });
  it('allows Untitled with real body text', () => {
    expect(isBlankPlaceholderOverwrite({
      incomingTitle: 'Untitled',
      incomingContent: '<h1>Untitled</h1><ul><li><p>I typed this</p></li></ul>',
      ...stored,
    })).toBe(false);
  });
});
