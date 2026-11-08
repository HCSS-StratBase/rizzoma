/**
 * Modern getUserMedia adapter — TypeScript ES module.
 *
 * Provides a unified API for accessing camera/microphone/screen-sharing.
 * Legacy prefixed APIs (webkit*, moz*, ms*) removed — all modern browsers
 * support the standard APIs (mediaDevices.getUserMedia) since ~2017.
 */

const defaultConstraints: MediaStreamConstraints = { audio: true, video: true };

function safeNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function trace(message: string): void {
  if (!message) return;
  const clean = message.endsWith('\n') ? message.slice(0, -1) : message;
  console.log(`${(safeNow() / 1000).toFixed(3)}: ${clean}`);
}

export function detectBrowser(): { name: string; version: number; userAgent: string } {
  const ua = (navigator?.userAgent ?? '').toLowerCase();
  let name = 'unknown';
  let version = 0;
  let match: RegExpMatchArray | null;

  match = ua.match(/(edge|edg|edgios|edga)\/(\d+)/);
  if (match) {
    name = 'edge';
    version = parseInt(match[2], 10);
  } else if ((match = ua.match(/firefox\/(\d+)/))) {
    name = 'firefox';
    version = parseInt(match[1], 10);
  } else if ((match = ua.match(/chrome\/(\d+)/))) {
    name = 'chrome';
    version = parseInt(match[1], 10);
  } else if (/safari\/\d+/.test(ua) && (match = ua.match(/version\/(\d+)/))) {
    name = 'safari';
    version = parseInt(match[1], 10);
  }

  return { name, version, userAgent: ua };
}

/** Whether the modern mediaDevices.getUserMedia API is available */
export const hasModernApi: boolean =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === 'function';

/** Whether any getUserMedia implementation is available */
export const canRequestMedia: boolean = hasModernApi;

/** Whether getDisplayMedia (screen sharing) is available */
export const supportsDisplayMedia: boolean =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getDisplayMedia === 'function';

/** Whether the Permissions API is available */
export const hasPermissionsApi: boolean =
  typeof navigator !== 'undefined' &&
  !!navigator.permissions &&
  typeof navigator.permissions.query === 'function';

function normalizeConstraints(input?: MediaStreamConstraints | string): MediaStreamConstraints {
  if (!input) return defaultConstraints;
  if (typeof input === 'string') {
    if (input === 'audio') return { audio: true, video: false };
    if (input === 'video') return { audio: false, video: true };
  }
  return input as MediaStreamConstraints;
}

async function queryPermission(name: PermissionName): Promise<string> {
  if (!hasPermissionsApi) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name });
    return status?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Query camera and microphone permission states.
 */
export async function getMediaPermissionStatus(): Promise<{
  camera: string;
  microphone: string;
}> {
  const [camera, microphone] = await Promise.all([
    queryPermission('camera' as PermissionName),
    queryPermission('microphone' as PermissionName),
  ]);
  return { camera, microphone };
}

/**
 * Enumerate audio/video input devices.
 */
export async function enumerateInputDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput' || d.kind === 'videoinput');
  } catch {
    return [];
  }
}

/**
 * Create an ICE server configuration object for WebRTC.
 */
export function createIceServer(
  url: string,
  username?: string,
  password?: string
): RTCIceServer | null {
  if (!url) return null;
  const config: RTCIceServer = { urls: url };
  if (username) config.username = username;
  if (password) config.credential = password;
  return config;
}

/**
 * Attach a MediaStream to an HTML media element.
 */
export function attachMediaStream(
  element: HTMLMediaElement,
  stream: MediaStream
): HTMLMediaElement {
  if (!element) throw new Error('attachMediaStream requires a DOM element');
  if (!stream) throw new Error('attachMediaStream requires a MediaStream');
  trace('Attaching media stream');
  element.srcObject = stream;
  const playResult = element.play();
  playResult?.catch(() => {});
  return element;
}

/**
 * Copy a stream reference from one element to another.
 */
export function reattachMediaStream(
  target: HTMLMediaElement,
  source: HTMLMediaElement | null
): HTMLMediaElement {
  if (!target) throw new Error('reattachMediaStream requires a DOM element');
  trace('Reattaching media stream');
  target.srcObject = source?.srcObject ?? null;
  const playResult = target.play();
  playResult?.catch(() => {});
  return target;
}

/**
 * Request access to user media (camera/microphone).
 * Supports both promise-based and callback-based usage.
 */
export async function requestUserMedia(
  constraints?: MediaStreamConstraints | string,
  callback?: (error: Error | null, stream?: MediaStream) => void
): Promise<MediaStream> {
  if (!canRequestMedia) {
    const err = new Error('Browser does not appear to be WebRTC-capable');
    callback?.(err);
    throw err;
  }

  const finalConstraints = normalizeConstraints(constraints);
  trace(`Requesting access to local media with mediaConstraints:\n  '${JSON.stringify(finalConstraints)}'`);

  try {
    const stream = await navigator.mediaDevices.getUserMedia(finalConstraints);
    callback?.(null, stream);
    return stream;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    callback?.(err);
    throw err;
  }
}

/**
 * Request display media (screen sharing).
 */
export async function requestDisplayMedia(
  constraints?: DisplayMediaStreamOptions
): Promise<MediaStream> {
  if (!supportsDisplayMedia) {
    throw new Error('getDisplayMedia is not supported in this browser');
  }
  trace('Requesting display media');
  return navigator.mediaDevices.getDisplayMedia(constraints);
}

// Hard Gap #22 round 2 (2026-04-13): mobile-focused additions.
// The first modernization sweep landed basic enumerate + permission query.
// Round 2 adds the observer and lifecycle helpers that mobile browsers
// actually exercise: users plug/unplug headsets, revoke camera access
// mid-call, and hit OverconstrainedError when requesting 1080p on a
// phone camera that only supports 720p.

/**
 * Subscribe to MediaDevices devicechange events (e.g., headset plugged
 * in/out, external webcam connected). Returns an unsubscribe function.
 *
 * On mobile this fires when the user plugs in a wired headset or
 * connects a Bluetooth mic. Useful for re-rendering a device picker
 * without forcing a full page reload.
 */
export function subscribeDeviceChanges(
  handler: (devices: MediaDeviceInfo[]) => void
): () => void {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return () => undefined;
  }
  const refresh = async () => {
    try {
      const devices = await enumerateInputDevices();
      handler(devices);
    } catch {
      // Silently ignore enumeration failures — the next devicechange
      // event will retry.
    }
  };
  const listener = () => {
    void refresh();
  };
  try {
    navigator.mediaDevices.addEventListener('devicechange', listener);
  } catch {
    return () => undefined;
  }
  // Fire once immediately so the handler gets the initial device list.
  void refresh();
  return () => {
    try {
      navigator.mediaDevices.removeEventListener('devicechange', listener);
    } catch {
      // best effort
    }
  };
}

/**
 * Subscribe to camera OR microphone permission state changes. Fires
 * when the user grants/revokes/prompts for permission via browser
 * settings without reloading the page. Returns an unsubscribe function.
 *
 * On iOS Safari this is particularly useful — the user can revoke
 * camera access from Settings → Safari → Camera at any time, and the
 * app should react without requiring a reload.
 */
export async function subscribePermissionChanges(
  permission: 'camera' | 'microphone',
  handler: (state: string) => void
): Promise<() => void> {
  if (!hasPermissionsApi) return () => undefined;
  try {
    const status = await navigator.permissions.query({ name: permission as PermissionName });
    if (!status) return () => undefined;
    const listener = () => handler(status.state);
    status.addEventListener('change', listener);
    // Fire once immediately with the current state so the handler can
    // sync up without waiting for a change.
    handler(status.state);
    return () => {
      try {
        status.removeEventListener('change', listener);
      } catch {
        // best effort
      }
    };
  } catch {
    return () => undefined;
  }
}

/**
 * Stop all tracks on a MediaStream and detach it from any HTML media
 * elements that currently reference it. Safe to call with null/undefined.
 *
 * This is the correct way to release a camera/mic on mobile — just
 * dropping the reference doesn't immediately release the hardware, and
 * users will see the camera-in-use indicator lingering until GC fires.
 */
export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    trace('Stopping media stream tracks');
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // best effort per-track
      }
    }
  } catch {
    // best effort — stream may already be torn down
  }
}

/**
 * Request user media with automatic constraint fallback on
 * OverconstrainedError. On mobile a user asking for 1920x1080 video
 * will fail on most phone cameras; this helper retries with a relaxed
 * constraint (video:true, audio preserved from the original request)
 * so the call still succeeds with whatever the device CAN provide.
 */
export async function requestUserMediaWithFallback(
  constraints?: MediaStreamConstraints | string
): Promise<MediaStream> {
  try {
    return await requestUserMedia(constraints);
  } catch (error) {
    const name = (error as { name?: string })?.name || '';
    const isOverconstrained = name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError';
    if (!isOverconstrained) throw error;
    trace(`OverconstrainedError caught — retrying with relaxed constraints`);
    const original = normalizeConstraints(constraints);
    const relaxed: MediaStreamConstraints = {
      audio: original.audio ?? true,
      video: original.video ? true : false,
    };
    return requestUserMedia(relaxed);
  }
}

/** Default constraints for getUserMedia */
export { defaultConstraints };

/** Adapter object for backward compatibility with tests */
const adapter = {
  requestUserMedia,
  requestUserMediaWithFallback,
  requestDisplayMedia,
  attachMediaStream,
  reattachMediaStream,
  createIceServer,
  detectBrowser,
  hasModernApi,
  canRequestMedia,
  defaultConstraints,
  supportsDisplayMedia,
  hasPermissionsApi,
  getMediaPermissionStatus,
  enumerateInputDevices,
  subscribeDeviceChanges,
  subscribePermissionChanges,
  stopMediaStream,
};

export default adapter;
