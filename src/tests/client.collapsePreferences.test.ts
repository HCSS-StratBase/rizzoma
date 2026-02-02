import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCollapsePreference,
  getCollapsePreferenceMetadata,
  setCollapsePreference,
  subscribeCollapsePreference,
} from '../client/components/blip/collapsePreferences';

describe('client: collapse preferences persistence', () => {
  const storageKey = 'blipCollapsePreferences';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to not hidden and persists metadata to localStorage', () => {
    // Default is false (not hidden) unless explicitly set
    expect(getCollapsePreference('wave1:blip1')).toBe(false);
    expect(getCollapsePreferenceMetadata('wave1:blip1')).toBeUndefined();

    const updatedAt = setCollapsePreference('wave1:blip1', true);
    const raw = window.localStorage.getItem(storageKey);
    expect(raw).toBeTruthy();
    const parsed = raw ? JSON.parse(raw) : {};
    expect(parsed['wave1:blip1'].isCollapsed ?? parsed['wave1:blip1']).toBe(true);
    expect(parsed['wave1:blip1'].updatedAt).toBe(updatedAt);
    expect(getCollapsePreference('wave1:blip1')).toBe(true);
    expect(getCollapsePreferenceMetadata('wave1:blip1')).toEqual({ isCollapsed: true, updatedAt });
  });

  it('notifies subscribers with updated metadata', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCollapsePreference(listener);

    const updatedAt = setCollapsePreference('wave1:blip1', true);
    expect(listener).toHaveBeenCalledWith({
      blipId: 'wave1:blip1',
      isCollapsed: true,
      updatedAt,
      source: 'local',
    });
    unsubscribe();
  });

  it('broadcasts storage events from other tabs', () => {
    const listener = vi.fn();
    subscribeCollapsePreference(listener);

    const payload = {
      'wave1:blip1': { isCollapsed: true, updatedAt: 999 },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(payload) }));

    expect(listener).toHaveBeenCalledWith({
      blipId: 'wave1:blip1',
      isCollapsed: true,
      updatedAt: 999,
      source: 'storage',
    });
  });
});
