export type LocationLike = Pick<Location, 'origin' | 'pathname' | 'search'>;
export type ClipboardLike = Pick<Clipboard, 'writeText'>;

type DocumentLike = Pick<Document, 'body' | 'createElement'> & {
  execCommand?: (commandId: string) => boolean;
};

const ensureLocation = (): LocationLike => {
  if (typeof window !== 'undefined' && window.location) {
    return {
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
    };
  }
  throw new Error('location_unavailable');
};

const ensureDocument = (): DocumentLike => {
  if (typeof document !== 'undefined') {
    return document as DocumentLike;
  }
  throw new Error('document_unavailable');
};

const ensureClipboard = (): ClipboardLike | null => {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard;
  }
  return null;
};

export function buildBlipLink(blipId: string, loc: LocationLike = ensureLocation()): string {
  const colonIdx = blipId.indexOf(':');
  const waveId = colonIdx >= 0 ? blipId.slice(0, colonIdx) : blipId;
  const base = `${loc.origin}${loc.pathname}${loc.search}`;
  const params = new URLSearchParams();
  params.set('focus', blipId);
  return `${base}#/topic/${encodeURIComponent(waveId)}?${params.toString()}`;
}

export async function copyBlipLink(
  blipId: string,
  opts?: {
    location?: LocationLike;
    clipboard?: ClipboardLike | null;
    document?: DocumentLike | null;
  }
): Promise<string> {
  const link = buildBlipLink(blipId, opts?.location ?? ensureLocation());
  const clipboard = opts?.clipboard ?? ensureClipboard();
  if (clipboard && typeof clipboard.writeText === 'function') {
    await clipboard.writeText(link);
    return link;
  }

  const doc = opts?.document ?? ensureDocument();
  if (!doc.body) throw new Error('clipboard_unavailable');
  const textarea = doc.createElement('textarea');
  textarea.value = link;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  doc.body.appendChild(textarea);
  textarea.select();
  const execResult = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
  doc.body.removeChild(textarea);
  if (!execResult) {
    throw new Error('clipboard_unavailable');
  }
  return link;
}
