/**
 * Tests for features 24 (toolbar alignment CSS), 31 (smart space prefix),
 * 32 (auto-enter-edit via pendingInsertRef), and 59 (comment resolve route).
 *
 * These four features were SOURCE-only until this test was written.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('feature 24: inline child toolbar alignment', () => {
  it('CSS has .inline-child-expanded + active .blip-menu-container rules', () => {
    const css = fs.readFileSync(
      path.resolve('src/client/components/blip/RizzomaBlip.css'),
      'utf-8'
    );
    expect(css).toContain('.inline-child-expanded');
    expect(css).toContain('.blip-container.active .blip-menu-container');
    expect(css).toContain('margin-left');
    expect(css).toContain('padding-left');
  });
});

describe('feature 31: smart space prefix in insertTrigger', () => {
  it('RizzomaBlip.tsx contains the space-prefix guard (charBefore check)', () => {
    const src = fs.readFileSync(
      path.resolve('src/client/components/blip/RizzomaBlip.tsx'),
      'utf-8'
    );
    expect(src).toContain('textBetween(from - 1, from)');
    expect(src).toContain("charBefore && charBefore !== ' '");
    expect(src).toContain("prefix + char");
  });
});

describe('feature 32: auto-enter-edit via pendingInsertRef', () => {
  it('RizzomaBlip.tsx implements the pending-insert queue mechanism', () => {
    const src = fs.readFileSync(
      path.resolve('src/client/components/blip/RizzomaBlip.tsx'),
      'utf-8'
    );
    expect(src).toContain('pendingInsertRef');
    expect(src).toContain('handleStartEdit');
    expect(src).toContain('pendingInsertRef.current = action');
    expect(src).toContain('pendingInsertRef.current = null');
  });
});

describe('feature 59: comment resolve route exists', () => {
  it('inlineComments.ts has a PATCH resolve/unresolve endpoint', () => {
    const src = fs.readFileSync(
      path.resolve('src/server/routes/inlineComments.ts'),
      'utf-8'
    );
    expect(src).toContain("'/comments/:commentId/resolve'");
    expect(src).toContain('resolved');
    expect(src).toContain('resolvedAt');
  });
});
