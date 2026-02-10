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

/** Default constraints for getUserMedia */
export { defaultConstraints };

/** Adapter object for backward compatibility with tests */
const adapter = {
  requestUserMedia,
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
};

export default adapter;
