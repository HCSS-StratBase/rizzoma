import { describe, expect, it } from 'vitest';
import {
  isAppInstalled,
  readInstalledAppIds,
  writeInstalledAppIds,
} from '../client/gadgets/apps/installState';

function createStorage(seed?: string) {
  let value = seed ?? null;
  return {
    getItem() {
      return value;
    },
    setItem(_key: string, next: string) {
      value = next;
    },
  };
}

describe('client: gadget app install state', () => {
  it('defaults preview apps to installed when no workspace override exists', () => {
    const storage = createStorage();
    expect(readInstalledAppIds(storage as any)).toEqual([
      'kanban-board',
      'calendar-planner',
      'focus-timer',
      'notes-scratchpad',
    ]);
  });

  it('persists sanitized install state', () => {
    const storage = createStorage();
    const next = writeInstalledAppIds(['focus-timer', 'focus-timer', 'github-workbench', 'bogus'], storage as any);
    expect(next).toEqual(['focus-timer', 'github-workbench']);
    expect(readInstalledAppIds(storage as any)).toEqual(['focus-timer', 'github-workbench']);
  });

  it('answers whether a specific app is installed', () => {
    const storage = createStorage(JSON.stringify(['calendar-planner']));
    expect(isAppInstalled('calendar-planner', storage as any)).toBe(true);
    expect(isAppInstalled('kanban-board', storage as any)).toBe(false);
  });
});
