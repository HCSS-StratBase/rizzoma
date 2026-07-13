import { describe, expect, it } from 'vitest';
import { nextInlineChildHandoffAction } from '../client/lib/inlineChildHandoff';

describe('topic-root inline child handoff', () => {
  it('waits instead of collapsing the retained expansion while the portal remounts', () => {
    expect(nextInlineChildHandoffAction(false, false)).toBe('wait');
  });

  it('re-enters edit only after the child container exists', () => {
    expect(nextInlineChildHandoffAction(true, false)).toBe('enter-edit');
    expect(nextInlineChildHandoffAction(true, true)).toBe('done');
  });
});
