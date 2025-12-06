import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getInlineCommentsVisibility,
  getInlineCommentsVisibilityFromStorage,
  getInlineCommentsVisibilityMetadata,
  setInlineCommentsVisibility,
  subscribeInlineCommentsVisibility,
} from '../client/components/editor/inlineCommentsVisibility';

describe('client: inline comments visibility persistence', () => {
  const storageKey = 'inlineCommentsVisibility';

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to visible and persists updates to localStorage', () => {
    expect(getInlineCommentsVisibility('wave1:blip1')).toBe(true);
    expect(getInlineCommentsVisibilityFromStorage('wave1:blip1')).toBeUndefined();

    const updatedAt = setInlineCommentsVisibility('wave1:blip1', false);

    const raw = window.localStorage.getItem(storageKey);
    expect(raw).toBeTruthy();
    const parsed = raw ? JSON.parse(raw) : {};
    expect(parsed['wave1:blip1'].value ?? parsed['wave1:blip1']).toBe(false);
    expect(parsed['wave1:blip1'].updatedAt).toBe(updatedAt);
    expect(getInlineCommentsVisibility('wave1:blip1')).toBe(false);
    expect(getInlineCommentsVisibilityFromStorage('wave1:blip1')).toBe(false);
    expect(getInlineCommentsVisibilityMetadata('wave1:blip1')).toEqual({ isVisible: false, updatedAt });
  });

  it('notifies subscribers when visibility changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeInlineCommentsVisibility(listener);

    const updatedAt = setInlineCommentsVisibility('wave1:blip1', false);

    expect(listener).toHaveBeenCalledWith({
      blipId: 'wave1:blip1',
      isVisible: false,
      updatedAt,
      source: 'local',
    });
    unsubscribe();
  });

  it('emits changes when another tab updates localStorage', () => {
    const listener = vi.fn();
    subscribeInlineCommentsVisibility(listener);

    const payload = {
      'wave1:blip1': { value: false, updatedAt: 123 },
      'wave1:blip2': { value: true, updatedAt: 456 },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(payload) }));

    expect(listener).toHaveBeenCalledWith({
      blipId: 'wave1:blip1',
      isVisible: false,
      updatedAt: 123,
      source: 'storage',
    });
  });
});
