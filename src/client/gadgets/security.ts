import { getAppManifest } from './apps/catalog';

export type EmbedProvider = 'youtube' | 'iframe' | 'spreadsheet';

const APP_INSTANCE_ID = /^[A-Za-z0-9:_-]{1,200}$/;

function currentOrigin(): string {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://rizzoma.invalid';
}

function boundedDimension(value: unknown, fallback: number, min = 100, max = 2_000): string {
  const parsed = Math.round(Number(value));
  return String(Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback);
}

export function normalizeEmbedFrameAttrs(raw: Record<string, unknown>): {
  src: string;
  title: string;
  provider: EmbedProvider;
  width: string;
  height: string;
} | null {
  const provider = String(raw['provider'] || 'iframe') as EmbedProvider;
  if (!['youtube', 'iframe', 'spreadsheet'].includes(provider)) return null;
  const source = String(raw['src'] || '').trim();
  let url: URL;
  try { url = new URL(source); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  if (url.origin === currentOrigin()) return null;
  if (provider === 'youtube') {
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || !/^\/embed\/[A-Za-z0-9_-]+$/.test(url.pathname)) return null;
  }
  if (provider === 'spreadsheet') {
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !url.pathname.includes('/spreadsheets/') || !url.pathname.endsWith('/preview')) return null;
  }
  return {
    src: url.toString(),
    title: String(raw['title'] || (provider === 'spreadsheet' ? 'Spreadsheet' : 'Embedded content')).slice(0, 200),
    provider,
    width: boundedDimension(raw['width'], provider === 'youtube' ? 560 : provider === 'spreadsheet' ? 720 : 600),
    height: boundedDimension(raw['height'], provider === 'youtube' ? 315 : provider === 'spreadsheet' ? 420 : 400),
  };
}

export function normalizeAppFrameAttrs(raw: Record<string, unknown>): {
  appId: string;
  instanceId: string;
  title: string;
  src: string;
  height: string;
} | null {
  const appId = String(raw['appId'] || '').trim();
  const manifest = getAppManifest(appId);
  if (!manifest || manifest.availability !== 'preview') return null;
  const src = String(raw['src'] || '').trim();
  if (src !== manifest.entry) return null;
  const instanceId = String(raw['instanceId'] || 'app-frame');
  if (!APP_INSTANCE_ID.test(instanceId)) return null;
  return {
    appId: manifest.id,
    instanceId,
    title: manifest.label,
    src: manifest.entry,
    height: boundedDimension(raw['height'], Number(manifest.defaultHeight) || 430, 320, 1_200),
  };
}
