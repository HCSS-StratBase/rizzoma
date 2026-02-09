const STORAGE_KEY = 'inlineCommentsVisibility';

type VisibilityEntry = { value: boolean; updatedAt: number };
type VisibilityMap = Record<string, VisibilityEntry>;
type VisibilityListener = (payload: {
  blipId: string;
  isVisible: boolean;
  updatedAt: number;
  source: 'local' | 'storage';
}) => void;

const listeners = new Set<VisibilityListener>();
let storageListenerRegistered = false;
let cachedMap: VisibilityMap | null = null;

function coerceEntry(value: unknown): VisibilityEntry | undefined {
  if (typeof value === 'boolean') {
    return { value, updatedAt: 0 };
  }
  if (value && typeof value === 'object') {
    const entry = value as { value?: unknown; updatedAt?: unknown };
    if (typeof entry.value === 'boolean') {
      return {
        value: entry.value,
        updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
      };
    }
  }
  return undefined;
}

function parseStorageValue(raw: string | null): VisibilityMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const map: VisibilityMap = {};
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

function readVisibilityMap(): VisibilityMap {
  if (cachedMap) return cachedMap;
  if (typeof window === 'undefined') {
    cachedMap = {};
    return cachedMap;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  cachedMap = parseStorageValue(raw);
  return cachedMap;
}

function writeVisibilityMap(map: VisibilityMap): void {
  if (typeof window === 'undefined') return;
  cachedMap = map;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota/security failures
  }
}

function notify(blipId: string, entry: VisibilityEntry, source: 'local' | 'storage'): void {
  listeners.forEach((listener) => {
    try {
      listener({ blipId, isVisible: entry.value, updatedAt: entry.updatedAt, source });
    } catch {
      // swallow listener errors to avoid breaking loop
    }
  });
}

function ensureStorageListener(): void {
  if (storageListenerRegistered || typeof window === 'undefined') return;
  storageListenerRegistered = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const previous = readVisibilityMap();
    const next = parseStorageValue(typeof event.newValue === 'string' ? event.newValue : null);
    cachedMap = next;
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    keys.forEach((blipId) => {
      const prevEntry = previous[blipId];
      const nextEntry = next[blipId];
      if (!nextEntry && prevEntry) {
        const defaultEntry: VisibilityEntry = { value: true, updatedAt: Date.now() };
        notify(blipId, defaultEntry, 'storage');
        return;
      }
      if (
        nextEntry &&
        (!prevEntry || prevEntry.value !== nextEntry.value || prevEntry.updatedAt !== nextEntry.updatedAt)
      ) {
        notify(blipId, nextEntry, 'storage');
      }
    });
  });
}

export function getInlineCommentsVisibility(blipId: string): boolean {
  const map = readVisibilityMap();
  const entry = map[blipId];
  return typeof entry?.value === 'boolean' ? entry.value : true;
}

export function getInlineCommentsVisibilityFromStorage(blipId: string): boolean | undefined {
  const map = readVisibilityMap();
  const entry = map[blipId];
  return typeof entry?.value === 'boolean' ? entry.value : undefined;
}

export function getInlineCommentsVisibilityMetadata(blipId: string): { isVisible: boolean; updatedAt: number } | undefined {
  const entry = readVisibilityMap()[blipId];
  if (!entry) return undefined;
  return { isVisible: entry.value, updatedAt: entry.updatedAt };
}

export function setInlineCommentsVisibility(blipId: string, isVisible: boolean): number {
  const map = { ...readVisibilityMap() };
  const entry: VisibilityEntry = { value: isVisible, updatedAt: Date.now() };
  map[blipId] = entry;
  writeVisibilityMap(map);
  notify(blipId, entry, 'local');
  return entry.updatedAt;
}

export function subscribeInlineCommentsVisibility(listener: VisibilityListener): () => void {
  ensureStorageListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
