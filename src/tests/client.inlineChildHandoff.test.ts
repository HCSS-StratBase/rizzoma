import { describe, expect, it } from 'vitest';
import { nextInlineChildHandoffAction } from '../client/lib/inlineChildHandoff';

describe('topic-root inline child handoff', () => {
  it('reasserts expansion idempotently while the portal remounts', () => {
    expect(nextInlineChildHandoffAction(false, false)).toBe('ensure-expanded');
  });

  it('re-enters edit only after the child container exists', () => {
    expect(nextInlineChildHandoffAction(true, false)).toBe('enter-edit');
    expect(nextInlineChildHandoffAction(true, true)).toBe('done');
  });
});
