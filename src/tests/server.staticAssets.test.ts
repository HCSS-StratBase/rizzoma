// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import zlib from 'zlib';
import type { AddressInfo } from 'net';
import { staticAssets, HASHED_ASSET } from '../server/middleware/staticAssets';

// Production served the 1.58 MB bundle uncompressed with `Cache-Control: public, max-age=0` (measured 23 Nov 2026).
// These tests fix what a browser must now see.
let dir: string;
let server: http.Server;
let base: string;
const BIG = `/* ${'x'.repeat(200000)} */\nconsole.log(1);\n`;

function get(p: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    http.get(base + p, { headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-assets-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'main-Bxc0OOCQ.js'), BIG);
  fs.writeFileSync(path.join(dir, 'assets', 'main-DUbK1hR3.css'), `.a{color:red}${' '.repeat(5000)}`);
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><title>x</title>${' '.repeat(3000)}`);
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{"name":"x"}');
  const app = express();
  app.use(staticAssets(dir));
  server = await new Promise<http.Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('static client files', () => {
  it('compresses the hashed JavaScript bundle when the browser offers gzip', async () => {
    const r = await get('/assets/main-Bxc0OOCQ.js', { 'accept-encoding': 'gzip' });
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('gzip');
    expect(String(r.headers['vary'])).toMatch(/Accept-Encoding/i);
    expect(r.body.length).toBeLessThan(BIG.length / 10);
    expect(zlib.gunzipSync(r.body).toString()).toBe(BIG);
  });

  it('compresses CSS and the HTML entry point', async () => {
    expect((await get('/assets/main-DUbK1hR3.css', { 'accept-encoding': 'gzip' })).headers['content-encoding']).toBe('gzip');
    expect((await get('/index.html', { 'accept-encoding': 'gzip' })).headers['content-encoding']).toBe('gzip');
  });

  it('sends the plain bytes to a client that does not accept compression', async () => {
    const r = await get('/assets/main-Bxc0OOCQ.js', { 'accept-encoding': 'identity' });
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.body.toString()).toBe(BIG);
  });

  it('caches a content-hashed file for a year, immutable', async () => {
    for (const f of ['/assets/main-Bxc0OOCQ.js', '/assets/main-DUbK1hR3.css']) {
      expect((await get(f)).headers['cache-control']).toBe('public, max-age=31536000, immutable');
    }
  });

  it('never caches the entry point or the manifest for long (a deploy must be picked up)', async () => {
    expect((await get('/index.html')).headers['cache-control']).toBe('no-cache');
    expect((await get('/manifest.json')).headers['cache-control']).toBe('no-cache');
  });

  it('only treats Vite-hashed names under assets/ as immutable', () => {
    expect(HASHED_ASSET.test('assets/main-Bxc0OOCQ.js')).toBe(true);
    expect(HASHED_ASSET.test('assets/fonts/KaTeX_Main-Regular-abcdef12.woff2')).toBe(true);
    expect(HASHED_ASSET.test('assets/main.js')).toBe(false);
    expect(HASHED_ASSET.test('index.html')).toBe(false);
    expect(HASHED_ASSET.test('gadgets/apps/kanban-board/index.html')).toBe(false);
    expect(HASHED_ASSET.test('assets/short-abc.js')).toBe(false);
  });
});
