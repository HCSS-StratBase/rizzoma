import { beforeEach, describe, expect, it, vi } from 'vitest';

const csrf = vi.hoisted(() => {
  let resolve: (() => void) | undefined;
  return {
    wait: vi.fn(() => new Promise<void>((done) => { resolve = done; })),
    resolve: () => resolve?.(),
  };
});

vi.mock('../client/lib/api', () => ({
  ensureCsrf: csrf.wait,
  readCookie: vi.fn(() => 'csrf-token'),
}));

class FakeXMLHttpRequest {
  static readonly UNSENT = 0;
  static instances: FakeXMLHttpRequest[] = [];
  readyState = FakeXMLHttpRequest.UNSENT;
  responseType = '';
  response: unknown = null;
  status = 0;
  withCredentials = false;
  upload: { onprogress?: (event: ProgressEvent) => void } = {};
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onload: (() => void) | null = null;
  open = vi.fn(() => { this.readyState = 1; });
  setRequestHeader = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => { this.onabort?.(); });

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }
}

describe('upload cancellation', () => {
  beforeEach(() => {
    csrf.wait.mockClear();
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  it('does not open or send an upload cancelled while CSRF setup is pending', async () => {
    const { createUploadTask } = await import('../client/lib/upload');
    const file = new File(['safe'], 'safe.txt', { type: 'text/plain' });
    const task = createUploadTask(file, { blipId: 'blip-1' });
    task.cancel();
    csrf.resolve();

    await expect(task.promise).rejects.toThrow('upload_aborted');
    expect(FakeXMLHttpRequest.instances).toHaveLength(1);
    expect(FakeXMLHttpRequest.instances[0]!.open).not.toHaveBeenCalled();
    expect(FakeXMLHttpRequest.instances[0]!.send).not.toHaveBeenCalled();
  });

  it('binds multipart upload bytes to the canonical blip context', async () => {
    const { createUploadTask } = await import('../client/lib/upload');
    const file = new File(['safe'], 'safe.txt', { type: 'text/plain' });
    const task = createUploadTask(file, { blipId: 'blip-42', waveId: 'wave-7' });
    csrf.resolve();

    await vi.waitFor(() => expect(FakeXMLHttpRequest.instances[0]!.send).toHaveBeenCalledOnce());
    const xhr = FakeXMLHttpRequest.instances[0]!;
    const form = xhr.send.mock.calls[0]![0] as FormData;
    expect(form.get('file')).toBe(file);
    expect(form.get('blipId')).toBe('blip-42');
    expect(form.get('waveId')).toBe('wave-7');

    xhr.status = 201;
    xhr.response = {
      upload: {
        id: 'upload:known',
        url: '/uploads/upload%3Aknown',
        originalName: 'safe.txt',
        mimeType: 'text/plain',
        size: 4,
      },
    };
    xhr.onload?.();
    await expect(task.promise).resolves.toMatchObject({ id: 'upload:known' });
  });
});
