#!/usr/bin/env node
// Capturing SMTP sink for tests: every message is written to <dir>/<n>.eml and delivered nowhere. Point SMTP_HOST/SMTP_PORT of the app under test at it.
//   node mail-sink.mjs <port> <dir>
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
const [port = '2527', dir = '/tmp/mail-sink'] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
let n = fs.readdirSync(dir).length;
net.createServer((sock) => {
  let inData = false; let buf = ''; let msg = '';
  sock.write('220 sink ESMTP\r\n');
  sock.on('data', (d) => {
    buf += d.toString('binary');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (inData) { if (line === '.') { inData = false; n += 1; fs.writeFileSync(path.join(dir, `${String(n).padStart(5, '0')}.eml`), msg, 'binary'); msg = ''; sock.write('250 queued\r\n'); } else msg += (line.startsWith('..') ? line.slice(1) : line) + '\r\n'; continue; }
      const c = line.toUpperCase();
      if (c.startsWith('EHLO')) sock.write('250-sink\r\n250 8BITMIME\r\n'); else if (c.startsWith('HELO')) sock.write('250 sink\r\n');
      else if (c.startsWith('DATA')) { inData = true; sock.write('354 go\r\n'); } else if (c.startsWith('QUIT')) { sock.write('221 bye\r\n'); sock.end(); } else sock.write('250 ok\r\n');
    }
  });
  sock.on('error', () => undefined);
}).listen(Number(port), '127.0.0.1', () => console.log(`mail sink on ${port} -> ${dir}`));
