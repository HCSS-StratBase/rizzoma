import net from 'node:net';

const CLAM_HOST = process.env['CLAMAV_HOST'];
const CLAM_PORT = Number(process.env['CLAMAV_PORT'] || 3310);
const MAX_CHUNK = 64 * 1024;

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
      const verdict = response.trim();
      if (/\bOK\s*$/i.test(verdict)) {
        finish();
        return;
      }
      if (/\bFOUND\s*$/i.test(verdict)) {
        finish(new VirusDetectedError(verdict));
        return;
      }
      // An empty response, protocol error, or premature close is not a clean
      // verdict. Fail closed so a scanner outage cannot admit an upload.
      finish(new VirusScanUnavailableError(verdict || 'Virus scanner returned no verdict'));
    });
  });
}
