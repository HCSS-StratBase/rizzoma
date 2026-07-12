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
});
