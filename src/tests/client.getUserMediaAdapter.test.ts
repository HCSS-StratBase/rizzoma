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

  // Hard Gap #22 round 2 (2026-04-13): mobile-focused additions.
  it('stopMediaStream stops every track on the stream', async () => {
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({}) },
    };
    const adapter = await loadAdapter();
    const stopSpyA = vi.fn();
    const stopSpyB = vi.fn();
    const stream: any = {
      getTracks: () => [{ stop: stopSpyA }, { stop: stopSpyB }],
    };
    adapter.stopMediaStream(stream);
    expect(stopSpyA).toHaveBeenCalledTimes(1);
    expect(stopSpyB).toHaveBeenCalledTimes(1);
  });

  it('stopMediaStream is a no-op on null/undefined', async () => {
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: { getUserMedia: vi.fn() },
    };
    const adapter = await loadAdapter();
    expect(() => adapter.stopMediaStream(null)).not.toThrow();
    expect(() => adapter.stopMediaStream(undefined)).not.toThrow();
  });

  it('requestUserMediaWithFallback retries with relaxed constraints on OverconstrainedError', async () => {
    const overconstrained: any = new Error('does not meet constraints');
    overconstrained.name = 'OverconstrainedError';
    const strictStream = { id: 'strict' };
    const relaxedStream = { id: 'relaxed' };
    const getUserMediaSpy = vi.fn()
      .mockRejectedValueOnce(overconstrained)
      .mockResolvedValueOnce(relaxedStream);
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: { getUserMedia: getUserMediaSpy },
    };
    const adapter = await loadAdapter();
    const result = await adapter.requestUserMediaWithFallback({
      audio: true,
      video: { width: 1920, height: 1080 },
    });
    expect(result).toBe(relaxedStream);
    expect(getUserMediaSpy).toHaveBeenCalledTimes(2);
    // First call was the strict constraints
    expect(getUserMediaSpy.mock.calls[0][0]).toEqual({
      audio: true,
      video: { width: 1920, height: 1080 },
    });
    // Second call was the relaxed constraints (audio preserved, video: true)
    expect(getUserMediaSpy.mock.calls[1][0]).toEqual({
      audio: true,
      video: true,
    });
    // Sanity check: strictStream was never actually returned
    void strictStream;
  });

  it('requestUserMediaWithFallback does NOT retry on non-overconstrained errors', async () => {
    const notAllowed: any = new Error('user denied permission');
    notAllowed.name = 'NotAllowedError';
    const getUserMediaSpy = vi.fn().mockRejectedValue(notAllowed);
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: { getUserMedia: getUserMediaSpy },
    };
    const adapter = await loadAdapter();
    await expect(
      adapter.requestUserMediaWithFallback({ audio: true, video: true })
    ).rejects.toThrow('user denied permission');
    expect(getUserMediaSpy).toHaveBeenCalledTimes(1);
  });

  it('subscribeDeviceChanges attaches a devicechange listener and fires once immediately', async () => {
    const addEventListenerSpy = vi.fn();
    const removeEventListenerSpy = vi.fn();
    const enumerateDevicesSpy = vi.fn().mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Microphone' },
      { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime Camera' },
      { kind: 'audiooutput', deviceId: 'speaker-1', label: 'Built-in Speaker' },
    ]);
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: enumerateDevicesSpy,
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
      },
    };
    const adapter = await loadAdapter();
    const handler = vi.fn();
    const unsubscribe = adapter.subscribeDeviceChanges(handler);
    expect(addEventListenerSpy).toHaveBeenCalledWith('devicechange', expect.any(Function));
    // Give the initial enumerate microtask a chance to resolve
    await new Promise((r) => setTimeout(r, 0));
    // Handler should have been called once with the filtered device list
    // (audiooutput is filtered out — only inputs are kept)
    expect(handler).toHaveBeenCalled();
    const lastCall = handler.mock.calls[handler.mock.calls.length - 1][0];
    expect(Array.isArray(lastCall)).toBe(true);
    const kinds = lastCall.map((d: any) => d.kind);
    expect(kinds).toContain('audioinput');
    expect(kinds).toContain('videoinput');
    expect(kinds).not.toContain('audiooutput');
    // Unsubscribe detaches
    unsubscribe();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('devicechange', expect.any(Function));
  });

  it('subscribePermissionChanges attaches a change listener on the PermissionStatus', async () => {
    const addEventListenerSpy = vi.fn();
    const removeEventListenerSpy = vi.fn();
    const status: any = {
      state: 'granted',
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
    };
    (globalThis as any).navigator = {
      userAgent: 'Chrome/122.0.0',
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: { query: vi.fn().mockResolvedValue(status) },
    };
    const adapter = await loadAdapter();
    const handler = vi.fn();
    const unsubscribe = await adapter.subscribePermissionChanges('camera', handler);
    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    // Handler should have been called once immediately with the initial state
    expect(handler).toHaveBeenCalledWith('granted');
    // Unsubscribe detaches
    unsubscribe();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
