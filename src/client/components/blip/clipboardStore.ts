export interface BlipClipboardPayload {
  blipId: string;
  html: string;
  text: string;
  createdAt: number;
}

type ClipboardState = Record<string, BlipClipboardPayload>;

const STORAGE_KEY = 'rizzoma:inlineClipboard';
let memoryState: ClipboardState | null = null;

const hasWindow = (): boolean => typeof window !== 'undefined';

const readFromStorage = (): ClipboardState => {
  if (!hasWindow()) return memoryState || {};
  if (memoryState) return memoryState;
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      memoryState = {};
      return memoryState;
    }
    const parsed = JSON.parse(raw) as ClipboardState;
    memoryState = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    memoryState = {};
  }
  return memoryState!;
};

const persist = (): void => {
  if (!hasWindow()) return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(memoryState || {}));
  } catch {
    // Swallow storage quota errors; clipboard stays memory-only
  }
};

export const setBlipClipboardPayload = (blipId: string, payload: Omit<BlipClipboardPayload, 'blipId' | 'createdAt'>): BlipClipboardPayload => {
  const next: BlipClipboardPayload = {
    blipId,
    html: payload.html,
    text: payload.text,
    createdAt: Date.now(),
  };
  const state = readFromStorage();
  state[blipId] = next;
  memoryState = state;
  persist();
  return next;
};

export const getBlipClipboardPayload = (blipId: string): BlipClipboardPayload | null => {
  const state = readFromStorage();
  return state[blipId] ?? null;
};

export const clearBlipClipboardPayload = (blipId: string): void => {
  const state = readFromStorage();
  if (!state[blipId]) return;
  delete state[blipId];
  memoryState = state;
  persist();
};

// Test-only helper to reset in-memory + storage state.
export const __dangerousResetInlineClipboardStoreForTests = (): void => {
  memoryState = {};
  if (!hasWindow()) return;
  try {
    window.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
