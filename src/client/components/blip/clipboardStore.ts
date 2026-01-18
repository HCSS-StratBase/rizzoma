export interface BlipClipboardPayload {
  blipId: string;
  html: string;
  text: string;
  createdAt: number;
  isCut?: boolean; // Indicates this was a cut operation
  waveId?: string; // For cross-wave paste
  parentId?: string | null; // Original parent for reference
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
    isCut: payload.isCut,
    waveId: payload.waveId,
    parentId: payload.parentId,
  };
  const state = readFromStorage();
  state[blipId] = next;
  memoryState = state;
  persist();
  return next;
};

// Get the global clipboard (most recent cut/copy)
export const getGlobalClipboard = (): BlipClipboardPayload | null => {
  const state = readFromStorage();
  const entries = Object.values(state);
  if (entries.length === 0) return null;
  // Return most recent
  return entries.reduce((latest, current) =>
    current.createdAt > latest.createdAt ? current : latest
  );
};

// Clear cut state from a specific blip
export const clearCutState = (blipId: string): void => {
  const state = readFromStorage();
  if (state[blipId] && state[blipId].isCut) {
    state[blipId] = { ...state[blipId], isCut: false };
    memoryState = state;
    persist();
  }
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
