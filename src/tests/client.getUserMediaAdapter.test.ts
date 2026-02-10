import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const adapterModulePath = '../client/lib/getUserMediaAdapter';

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
    expect(adapter.hasModernApi).toBe(true);
    expect(adapter.canRequestMedia).toBe(true);
  });

  it('rejects when only legacy navigator.getUserMedia is available (no mediaDevices)', async () => {
    (globalThis as any).navigator = {
      userAgent: 'Firefox/123.0',
      getUserMedia: vi.fn(),
    };

    const adapter = await loadAdapter();
    expect(adapter.hasModernApi).toBe(false);
    expect(adapter.canRequestMedia).toBe(false);
    await expect(adapter.requestUserMedia()).rejects.toThrow(/WebRTC-capable/);
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

  it('requestDisplayMedia calls getDisplayMedia', async () => {
    const displayStream = { id: 'screen-share' };
    const getDisplayMediaSpy = vi.fn().mockResolvedValue(displayStream);
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({}),
        getDisplayMedia: getDisplayMediaSpy,
      },
    };

    const adapter = await loadAdapter();
    const result = await adapter.requestDisplayMedia();
    expect(result).toBe(displayStream);
    expect(getDisplayMediaSpy).toHaveBeenCalled();
  });

  it('reattachMediaStream copies srcObject between elements', async () => {
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({}) },
    };

    const adapter = await loadAdapter();
    const stream = { id: 'reattach-test' };
    const source: any = { srcObject: stream, play: vi.fn().mockResolvedValue(undefined) };
    const target: any = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) };

    adapter.reattachMediaStream(target, source);
    expect(target.srcObject).toBe(stream);
    expect(target.play).toHaveBeenCalled();
  });
});
