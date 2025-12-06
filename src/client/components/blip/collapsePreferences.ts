const STORAGE_KEY = 'blipCollapsePreferences';

type CollapseEntry = { isCollapsed: boolean; updatedAt: number };
type CollapseMap = Record<string, CollapseEntry>;
type CollapseListener = (payload: {
  blipId: string;
  isCollapsed: boolean;
  updatedAt: number;
  source: 'local' | 'storage';
}) => void;

const listeners = new Set<CollapseListener>();
let storageListenerRegistered = false;
let cachedMap: CollapseMap | null = null;

function coerceEntry(value: unknown): CollapseEntry | undefined {
  if (typeof value === 'boolean') {
    return { isCollapsed: value, updatedAt: 0 };
  }
  if (value && typeof value === 'object') {
    const entry = value as { isCollapsed?: unknown; value?: unknown; updatedAt?: unknown };
    const resolvedValue = typeof entry.isCollapsed === 'boolean'
      ? entry.isCollapsed
      : typeof entry.value === 'boolean'
        ? entry.value
        : undefined;
    if (typeof resolvedValue === 'boolean') {
      return {
        isCollapsed: resolvedValue,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
      };
    }
  }
  return undefined;
}

function parseStorageValue(raw: string | null): CollapseMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const map: CollapseMap = {};
    Object.entries(parsed as Record<string, unknown>).forEach(([blipId, value]) => {
      const entry = coerceEntry(value);
      if (entry) {
        map[blipId] = entry;
      }
    });
    return map;
  } catch {
    return {};
  }
}

function readMap(): CollapseMap {
  if (cachedMap) return cachedMap;
  if (typeof window === 'undefined') {
    cachedMap = {};
    return cachedMap;
  }
  cachedMap = parseStorageValue(window.localStorage.getItem(STORAGE_KEY));
  return cachedMap;
}

function writeMap(map: CollapseMap): void {
  if (typeof window === 'undefined') return;
  cachedMap = map;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota/security errors
  }
}

function notify(blipId: string, entry: CollapseEntry, source: 'local' | 'storage'): void {
  listeners.forEach((listener) => {
    try {
      listener({ blipId, isCollapsed: entry.isCollapsed, updatedAt: entry.updatedAt, source });
    } catch {
      // ignore listener failures
    }
  });
}

function ensureStorageListener(): void {
  if (storageListenerRegistered || typeof window === 'undefined') return;
  storageListenerRegistered = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const previous = readMap();
    const next = parseStorageValue(typeof event.newValue === 'string' ? event.newValue : null);
    cachedMap = next;
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    keys.forEach((blipId) => {
      const prevEntry = previous[blipId];
      const nextEntry = next[blipId];
      if (!nextEntry && prevEntry) {
        const defaultEntry: CollapseEntry = { isCollapsed: false, updatedAt: Date.now() };
        notify(blipId, defaultEntry, 'storage');
        return;
      }
      if (
        nextEntry &&
        (!prevEntry || prevEntry.isCollapsed !== nextEntry.isCollapsed || prevEntry.updatedAt !== nextEntry.updatedAt)
      ) {
        notify(blipId, nextEntry, 'storage');
      }
    });
  });
}

export function getCollapsePreference(blipId: string): boolean {
  const map = readMap();
  const entry = map[blipId];
  return typeof entry?.isCollapsed === 'boolean' ? entry.isCollapsed : false;
}

export function getCollapsePreferenceMetadata(blipId: string): { isCollapsed: boolean; updatedAt: number } | undefined {
  const entry = readMap()[blipId];
  if (!entry) return undefined;
  return { isCollapsed: entry.isCollapsed, updatedAt: entry.updatedAt };
}

export function setCollapsePreference(blipId: string, isCollapsed: boolean): number {
  const map = { ...readMap() };
  const entry: CollapseEntry = { isCollapsed, updatedAt: Date.now() };
  map[blipId] = entry;
  writeMap(map);
  notify(blipId, entry, 'local');
  return entry.updatedAt;
}

export function subscribeCollapsePreference(listener: CollapseListener): () => void {
  ensureStorageListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
