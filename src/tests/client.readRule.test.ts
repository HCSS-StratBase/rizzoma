import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldMarkReadOnRender } from '../client/lib/readRule';

// SDS, 4 Jul 2022: opening a green blip without clicking in it or changing anything leaves it green;
// Next, a click inside it, or an edit ungreens it.
describe('follow-the-green read rule', () => {
  it('marks only the topic root read on render', () => {
    expect(shouldMarkReadOnRender({ isRoot: true, isRead: false })).toBe(true);
    expect(shouldMarkReadOnRender({ isRoot: true, isRead: true })).toBe(false);
    expect(shouldMarkReadOnRender({ isRoot: false, isRead: false })).toBe(false);
  });

  const src = readFileSync(resolve(__dirname, '../client/components/blip/RizzomaBlip.tsx'), 'utf8');

  it('unfolding a row does not mark the blip read', () => {
    const body = src.slice(src.indexOf('const handleToggleExpand = () => {'), src.indexOf('const handleCollapse = () => {'));
    expect(body.length).toBeGreaterThan(50);
    expect(body).not.toContain('onBlipRead');
  });

  it('an open inline child is not marked read on render, the render effect uses the rule', () => {
    expect(src).toContain('shouldMarkReadOnRender({ isRoot, isRead: blip.isRead })');
    expect(src).not.toMatch(/\(isRoot \|\| isInlineChild\) && !blip\.isRead/);
  });

  it('a click inside the blip still marks it read', () => {
    const body = src.slice(src.indexOf('const handleBlipClick = '), src.indexOf('// Inline children: hide toolbar when clicking outside'));
    expect(body).toContain('onBlipRead?.(blip.id)');
  });
});
