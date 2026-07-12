import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const netMock = vi.hoisted(() => ({ createConnection: vi.fn() }));
const originalEnv = { ...process.env };

vi.mock('node:net', () => ({
  default: { createConnection: netMock.createConnection },
}));

class FakeSocket {
  private handlers = new Map<string, Array<(...args: any[]) => void>>();
  write = vi.fn();
  setTimeout = vi.fn();
  destroy = vi.fn();

  on(event: string, handler: (...args: any[]) => void): this {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  emit(event: string, ...args: any[]): void {
    for (const handler of this.handlers.get(event) || []) handler(...args);
  }
}

function scannerResponse(verdict?: string): void {
  netMock.createConnection.mockImplementation((_options: unknown, connected: () => void) => {
    const socket = new FakeSocket();
    queueMicrotask(() => {
      connected();
      queueMicrotask(() => {
        if (verdict !== undefined) socket.emit('data', Buffer.from(verdict));
        socket.emit('close');
      });
    });
    return socket;
  });
}

describe('ClamAV streaming verdicts', () => {
  beforeEach(() => {
    vi.resetModules();
    netMock.createConnection.mockReset();
    process.env['CLAMAV_HOST'] = '127.0.0.1';
    process.env['CLAMAV_PORT'] = '3310';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts only an explicit clean verdict', async () => {
    scannerResponse('stream: OK\n');
    const { scanBuffer } = await import('../server/lib/virusScan');
    await expect(scanBuffer(Buffer.from('clean'))).resolves.toBeUndefined();
  });

  it('reports an explicit malware verdict', async () => {
    scannerResponse('stream: Eicar-Test-Signature FOUND\n');
    const { scanBuffer, VirusDetectedError } = await import('../server/lib/virusScan');
    await expect(scanBuffer(Buffer.from('unsafe'))).rejects.toBeInstanceOf(VirusDetectedError);
  });

  it('fails closed when ClamAV closes without a verdict', async () => {
    scannerResponse();
    const { scanBuffer, VirusScanUnavailableError } = await import('../server/lib/virusScan');
    await expect(scanBuffer(Buffer.from('unknown'))).rejects.toBeInstanceOf(VirusScanUnavailableError);
  });

  it('fails closed in production when ClamAV is not configured', async () => {
    delete process.env['CLAMAV_HOST'];
    process.env['NODE_ENV'] = 'production';
    const { scanBuffer, VirusScanUnavailableError } = await import('../server/lib/virusScan');
    await expect(scanBuffer(Buffer.from('unknown'))).rejects.toBeInstanceOf(VirusScanUnavailableError);
  });
});
