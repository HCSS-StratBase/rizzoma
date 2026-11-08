import * as Y from 'yjs';

export const COLLABORATION_STATE_DIGEST_HEADER = 'x-rizzoma-yjs-state-digest';
export const COLLABORATION_GENERATION_HEADER = 'x-rizzoma-yjs-generation';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function collaborationProjectionHeaders(
  doc?: Y.Doc,
  generation = 0,
): Promise<Record<string, string> | undefined> {
  if (!doc) return undefined;
  const encodedState = Y.encodeStateAsUpdate(doc);
  // Copy into the active browser realm. Besides guaranteeing an exact-sized
  // buffer, this keeps jsdom/WebView implementations with strict BufferSource
  // brand checks from rejecting a Uint8Array created by the Yjs module realm.
  const ArrayBufferConstructor = globalThis.window?.ArrayBuffer ?? ArrayBuffer;
  const Uint8ArrayConstructor = globalThis.window?.Uint8Array ?? Uint8Array;
  const stableBuffer = new ArrayBufferConstructor(encodedState.byteLength);
  new Uint8ArrayConstructor(stableBuffer).set(encodedState);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', stableBuffer);
  return {
    [COLLABORATION_STATE_DIGEST_HEADER]: bytesToHex(new Uint8Array(digest)),
    [COLLABORATION_GENERATION_HEADER]: String(generation),
  };
}
