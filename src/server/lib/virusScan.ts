import net from 'node:net';

const CLAM_HOST = process.env['CLAMAV_HOST'];
const CLAM_PORT = Number(process.env['CLAMAV_PORT'] || 3310);
const MAX_CHUNK = 64 * 1024;

function normalizeClamdVerdictFrame(response: string): string | null {
  let verdict = response.trim();

  // Commands using clamd's `z` prefix are framed with one trailing NUL byte.
  // Keep newline-only replies compatible, but reject embedded or repeated NULs
  // so a malformed/multi-frame response can never be mistaken for a verdict.
  if (verdict.endsWith('\0')) {
    verdict = verdict.slice(0, -1).trim();
  }

  return verdict.length > 0 && !verdict.includes('\0') ? verdict : null;
}

export type VirusScannerHealth = {
  status: 'ok' | 'error';
  ms: number;
  error?: string;
};

export class VirusDetectedError extends Error {
  constructor(message = 'Virus detected') {
    super(message);
    this.name = 'VirusDetectedError';
  }
}

export class VirusScanUnavailableError extends Error {
  constructor(message = 'Virus scanner unavailable') {
    super(message);
    this.name = 'VirusScanUnavailableError';
  }
}

/** Readiness probe for the production upload security dependency. */
export async function virusScannerHealth(timeoutMs = 2_000): Promise<VirusScannerHealth> {
  const startedAt = Date.now();
  if (!CLAM_HOST) {
    return process.env['NODE_ENV'] === 'production'
      ? { status: 'error', ms: Date.now() - startedAt, error: 'Virus scanner is not configured' }
      : { status: 'ok', ms: Date.now() - startedAt };
  }

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };
      const socket = net.createConnection({ host: CLAM_HOST, port: CLAM_PORT }, () => {
        socket.write('zPING\0');
      });
      let response = '';
      socket.setTimeout(timeoutMs, () => finish(new Error('Virus scanner PING timed out')));
      socket.on('data', (data) => {
        response += data.toString();
        if (response.replace(/\0/g, '').trim().toUpperCase() === 'PONG') finish();
      });
      socket.on('error', (error) => finish(error));
      socket.on('close', () => {
        if (!settled) finish(new Error(response.trim() || 'Virus scanner returned no PING verdict'));
      });
    });
    return { status: 'ok', ms: Date.now() - startedAt };
  } catch (error: any) {
    return {
      status: 'error',
      ms: Date.now() - startedAt,
      error: error?.message || 'Virus scanner is unreachable',
    };
  }
}

export async function scanBuffer(buffer: Buffer): Promise<void> {
  if (!buffer?.length) {
    return;
  }
  if (!CLAM_HOST) {
    // Local development and unit tests may run without ClamAV. Production
    // uploads must never silently bypass malware scanning.
    if (process.env['NODE_ENV'] === 'production') {
      throw new VirusScanUnavailableError('Virus scanner is not configured');
    }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    const socket = net.createConnection({ host: CLAM_HOST, port: CLAM_PORT }, () => {
      socket.write('zINSTREAM\0');
      let offset = 0;
      while (offset < buffer.length) {
        const chunk = buffer.subarray(offset, offset + MAX_CHUNK);
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(chunk.length, 0);
        socket.write(sizeBuf);
        socket.write(chunk);
        offset += chunk.length;
      }
      socket.write(Buffer.alloc(4));
    });

    let response = '';
    socket.setTimeout(15000, () => {
      socket.destroy(new Error('Virus scan timeout'));
    });

    socket.on('data', (data) => {
      response += data.toString();
    });

    socket.on('error', (error) => {
      socket.destroy();
      finish(new VirusScanUnavailableError(error.message));
    });

    socket.on('close', () => {
      const verdict = normalizeClamdVerdictFrame(response);
      if (verdict !== null && /\bOK\s*$/i.test(verdict)) {
        finish();
        return;
      }
      if (verdict !== null && /\bFOUND\s*$/i.test(verdict)) {
        finish(new VirusDetectedError(verdict));
        return;
      }
      // An empty response, protocol error, or premature close is not a clean
      // verdict. Fail closed so a scanner outage cannot admit an upload.
      finish(
        new VirusScanUnavailableError(
          verdict ??
            (response.trim().length > 0
              ? 'Virus scanner returned malformed verdict'
              : 'Virus scanner returned no verdict'),
        ),
      );
    });
  });
}
