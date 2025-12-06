import { describe, it, expect, vi } from 'vitest';
import { toggleInlineCommentsVisibility } from '../client/components/editor/extensions/InlineCommentsVisibility';
import * as visibility from '../client/components/editor/inlineCommentsVisibility';

describe('client: inline comment visibility shortcuts', () => {
  it('toggles visibility and persists when shortcuts pressed', () => {
    const setSpy = vi
      .spyOn(visibility, 'setInlineCommentsVisibility')
      .mockImplementation(() => {});
    const onToggle = vi.fn();

    toggleInlineCommentsVisibility({ blipId: 'wave1:blip1', onToggle }, true);
    toggleInlineCommentsVisibility({ blipId: 'wave1:blip1', onToggle }, false);

    expect(setSpy).toHaveBeenNthCalledWith(1, 'wave1:blip1', true);
    expect(setSpy).toHaveBeenNthCalledWith(2, 'wave1:blip1', false);
    expect(onToggle).toHaveBeenCalledTimes(2);
    setSpy.mockRestore();
  });
});
