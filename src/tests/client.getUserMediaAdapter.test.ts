import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const adapterModulePath = '../client/lib/getUserMediaAdapter.js';

async function loadAdapter() {
  const module = await import(adapterModulePath);
  return module.default || module;
}

describe('getUserMediaAdapter', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as any).console = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    (globalThis as any).performance = { now: () => 0 };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).navigator;
    delete (globalThis as any).getUserMedia;
    delete (globalThis as any).requestUserMedia;
    delete (globalThis as any).attachMediaStream;
    delete (globalThis as any).reattachMediaStream;
  });

  it('prefers navigator.mediaDevices.getUserMedia when available', async () => {
    const stream = { id: 'modern-stream' };
    const getUserMediaSpy = vi.fn().mockResolvedValue(stream);
    (globalThis as any).navigator = {
      userAgent: 'Chrome/121.0.0',
      mediaDevices: { getUserMedia: getUserMediaSpy },
    };

    const adapter = await loadAdapter();
    const constraints = { audio: false, video: { width: 1280 } };
    const result = await adapter.requestUserMedia(constraints);

    expect(result).toBe(stream);
    expect(getUserMediaSpy).toHaveBeenCalledWith(constraints);
    expect(typeof (globalThis as any).getUserMedia).toBe('function');

    const success = vi.fn();
    const failure = vi.fn();
    const legacyResult = await (globalThis as any).getUserMedia(constraints, success, failure);
    expect(legacyResult).toBe(stream);
    expect(success).toHaveBeenCalledWith(stream);
    expect(failure).not.toHaveBeenCalled();
  });

  it('falls back to legacy navigator.getUserMedia implementation', async () => {
    const legacyStream = { id: 'legacy-stream' };
    const legacyStub = vi.fn((_, resolve) => {
      resolve(legacyStream);
    });
    (globalThis as any).navigator = {
      userAgent: 'Firefox/123.0',
      getUserMedia: legacyStub,
    };

    const adapter = await loadAdapter();
    const result = await adapter.requestUserMedia();

    expect(result).toBe(legacyStream);
    expect(legacyStub).toHaveBeenCalledTimes(1);
    expect(adapter.hasModernApi).toBe(false);
  });

  it('rejects when no media APIs are available', async () => {
    (globalThis as any).navigator = {
      userAgent: 'Custom/1.0',
    };

    const adapter = await loadAdapter();
    await expect(adapter.requestUserMedia()).rejects.toThrow(/WebRTC-capable/);
  });

  it('attaches media streams via srcObject when supported', async () => {
    (globalThis as any).navigator = {
      userAgent: 'Chrome/121.0.0',
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({}) },
    };

    const adapter = await loadAdapter();
    const play = vi.fn().mockReturnValue(Promise.resolve());
    const element: any = { play, srcObject: null };
    const stream = { id: 'abc' };

    const updatedElement = adapter.attachMediaStream(element, stream);
    expect(updatedElement.srcObject).toBe(stream);
    expect(play).toHaveBeenCalled();
  });

  it('normalizes simple string constraints', async () => {
    const stream = { id: 'only-audio' };
    const getUserMediaSpy = vi.fn().mockResolvedValue(stream);
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: { getUserMedia: getUserMediaSpy },
    };

    const adapter = await loadAdapter();
    const result = await adapter.requestUserMedia('audio');

    expect(result).toBe(stream);
    expect(getUserMediaSpy).toHaveBeenCalledWith({ audio: true, video: false });
  });

  it('enumerates input devices when supported', async () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'mic-1' },
      { kind: 'videoinput', deviceId: 'cam-1' },
      { kind: 'audiooutput', deviceId: 'spk-1' },
    ];
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({}),
        enumerateDevices: vi.fn().mockResolvedValue(devices),
      },
    };

    const adapter = await loadAdapter();
    const result = await adapter.enumerateInputDevices();

    expect(result).toEqual([
      { kind: 'audioinput', deviceId: 'mic-1' },
      { kind: 'videoinput', deviceId: 'cam-1' },
    ]);
  });

  it('reports permission state when Permissions API is available', async () => {
    const queryMock = vi.fn().mockImplementation(({ name }) => {
      return Promise.resolve({ state: name === 'camera' ? 'granted' : 'prompt' });
    });
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({}) },
      permissions: { query: queryMock },
    };

    const adapter = await loadAdapter();
    const status = await adapter.getMediaPermissionStatus();

    expect(adapter.hasPermissionsApi).toBe(true);
    expect(status).toEqual({ camera: 'granted', microphone: 'prompt' });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('detects display media support', async () => {
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({}),
        getDisplayMedia: vi.fn(),
      },
    };

    const adapter = await loadAdapter();
    expect(adapter.supportsDisplayMedia).toBe(true);
  });
});
