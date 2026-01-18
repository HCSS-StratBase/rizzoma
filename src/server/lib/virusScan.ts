import net from 'node:net';

const CLAM_HOST = process.env['CLAMAV_HOST'];
const CLAM_PORT = Number(process.env['CLAMAV_PORT'] || 3310);
const MAX_CHUNK = 64 * 1024;

export async function scanBuffer(buffer: Buffer): Promise<void> {
  if (!CLAM_HOST || !buffer?.length) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
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
      reject(error);
    });

    socket.on('close', () => {
      const verdict = response.trim();
      if (!verdict || verdict.includes('OK')) {
        resolve();
        return;
      }
      reject(new Error(verdict));
    });
  });
}
