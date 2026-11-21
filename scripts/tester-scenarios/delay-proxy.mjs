#!/usr/bin/env node
// TCP delay proxy: reproduces a real network's latency on the local stack, for HTTP and WebSocket alike (Chromium's own latency emulation
// does not touch WebSocket frames). Every chunk is delayed by DELAY ms in each direction (round trip = 2 x DELAY), order preserved.
//   node delay-proxy.mjs <listen port> <target port> [delay ms, default 45]
import net from 'node:net';
const [listen, target, delay = '45'] = process.argv.slice(2);
const D = Number(delay);
net.createServer((client) => {
  const up = net.connect(Number(target), '127.0.0.1');
  const pipe = (from, to) => {
    from.on('data', (buf) => setTimeout(() => { if (!to.destroyed) to.write(buf); }, D));
    from.on('end', () => setTimeout(() => to.end(), D));
    from.on('error', () => to.destroy());
  };
  pipe(client, up); pipe(up, client);
  // closing is delayed like the data, or the last chunks are dropped
  client.on('close', () => setTimeout(() => up.destroy(), D + 20)); up.on('close', () => setTimeout(() => client.destroy(), D + 20));
}).listen(Number(listen), '127.0.0.1', () => console.log(`delay proxy :${listen} -> :${target}, ${D} ms each way`));
