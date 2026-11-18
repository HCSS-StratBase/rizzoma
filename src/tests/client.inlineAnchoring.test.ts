import { describe, it, expect } from 'vitest';
import { isInlineAnchored, ORPHAN_GRACE_MS } from '../client/components/blip/inlineAnchoring';

const now = 1_800_000_000_000;
const withMarker = '<ul><li><p>Liliia<span data-blip-thread="w:b1" class="blip-thread-marker">+</span></p></li></ul>';
const noMarker = '<ul><li><p>Liliia</p></li></ul>';

describe('inline anchoring (tester feedback 2026-11-18: orphaned sub-blips)', () => {
  it('a child whose marker is in the parent HTML is inline', () => {
    expect(isInlineAnchored({ id: 'w:b1', anchorPosition: 0, createdAt: now - 10 * 60_000 }, withMarker, now)).toBe(true);
  });
  it('a long-lived anchored child whose marker is missing is NOT inline, so it shows as a reply row instead of vanishing', () => {
    expect(isInlineAnchored({ id: 'w:b2', anchorPosition: 0, createdAt: now - 10 * 60_000 }, noMarker, now)).toBe(false);
  });
  it('a just-created anchored child stays inline while its marker is still being persisted', () => {
    expect(isInlineAnchored({ id: 'w:b3', anchorPosition: 0, createdAt: now - 2_000 }, noMarker, now)).toBe(true);
    expect(isInlineAnchored({ id: 'w:b3', anchorPosition: 0, createdAt: now - ORPHAN_GRACE_MS - 1 }, noMarker, now)).toBe(false);
  });
  it('a reply (no anchor, no marker) is never inline', () => {
    expect(isInlineAnchored({ id: 'w:b4', createdAt: now }, noMarker, now)).toBe(false);
  });
});
