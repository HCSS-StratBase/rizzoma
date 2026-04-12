import { api, ensureCsrf } from '../../lib/api';
import { GADGET_APP_CATALOG } from './catalog';

export const GADGET_APP_INSTALLS_KEY = 'rizzoma:gadget-app-installs';
export const GADGET_APP_INSTALL_EVENT = 'rizzoma:gadget-app-install-state';

const VALID_APP_IDS = new Set(GADGET_APP_CATALOG.map((manifest) => manifest.id));
export const DEFAULT_INSTALLED_APP_IDS = GADGET_APP_CATALOG
  .filter((manifest) => manifest.availability === 'preview')
  .map((manifest) => manifest.id);

type GadgetPreferencesPayload = {
  installedAppIds?: string[];
  defaultInstalledAppIds?: string[];
  scope?: 'user';
  schemaVersion?: number;
};

function sanitizeInstalledAppIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_INSTALLED_APP_IDS];
  const valid = value.filter((entry): entry is string => typeof entry === 'string' && VALID_APP_IDS.has(entry));
  return Array.from(new Set(valid));
}

export function readInstalledAppIds(storage: Pick<Storage, 'getItem'> | null | undefined = typeof window !== 'undefined' ? window.localStorage : null): string[] {
  try {
    const raw = storage?.getItem(GADGET_APP_INSTALLS_KEY);
    if (!raw) return [...DEFAULT_INSTALLED_APP_IDS];
    return sanitizeInstalledAppIds(JSON.parse(raw));
  } catch {
    return [...DEFAULT_INSTALLED_APP_IDS];
  }
}

function emitInstalledAppIds(installedAppIds: string[]) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GADGET_APP_INSTALL_EVENT, { detail: { installedAppIds } }));
  }
}

export function isAppInstalled(appId: string, storage?: Pick<Storage, 'getItem'> | null): boolean {
  return readInstalledAppIds(storage).includes(appId);
}

export function writeInstalledAppIds(nextIds: string[], storage: Pick<Storage, 'setItem'> | null | undefined = typeof window !== 'undefined' ? window.localStorage : null): string[] {
  const sanitized = sanitizeInstalledAppIds(nextIds);
  try {
    storage?.setItem(GADGET_APP_INSTALLS_KEY, JSON.stringify(sanitized));
  } catch {}
  return sanitized;
}

export function setAppInstalled(appId: string, installed: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined = typeof window !== 'undefined' ? window.localStorage : null): string[] {
  const current = new Set(readInstalledAppIds(storage));
  if (installed) current.add(appId);
  else current.delete(appId);
  const next = writeInstalledAppIds([...current], storage);
  emitInstalledAppIds(next);
  return next;
}

export async function syncInstalledAppIdsFromServer(): Promise<string[]> {
  const response = await api<GadgetPreferencesPayload>('/api/gadgets/preferences');
  if (!response.ok || !response.data || typeof response.data !== 'object') {
    throw new Error('Failed to load gadget preferences');
  }
  const installedAppIds = sanitizeInstalledAppIds((response.data as GadgetPreferencesPayload).installedAppIds);
  writeInstalledAppIds(installedAppIds);
  emitInstalledAppIds(installedAppIds);
  return installedAppIds;
}

export async function saveInstalledAppIdsToServer(installedAppIds: string[]): Promise<string[]> {
  await ensureCsrf();
  const response = await api<GadgetPreferencesPayload>('/api/gadgets/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ installedAppIds }),
  });
  if (!response.ok || !response.data || typeof response.data !== 'object') {
    throw new Error('Failed to save gadget preferences');
  }
  const next = sanitizeInstalledAppIds((response.data as GadgetPreferencesPayload).installedAppIds);
  writeInstalledAppIds(next);
  emitInstalledAppIds(next);
  return next;
}

export async function resetInstalledAppIdsToServer(): Promise<string[]> {
  await ensureCsrf();
  const response = await api<GadgetPreferencesPayload>('/api/gadgets/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ reset: true }),
  });
  if (!response.ok || !response.data || typeof response.data !== 'object') {
    throw new Error('Failed to reset gadget preferences');
  }
  const next = sanitizeInstalledAppIds((response.data as GadgetPreferencesPayload).installedAppIds);
  writeInstalledAppIds(next);
  emitInstalledAppIds(next);
  return next;
}
