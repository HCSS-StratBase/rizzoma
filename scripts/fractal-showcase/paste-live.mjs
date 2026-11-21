// Live check of the pasted-screenshot fix: Fractal Tester 2 makes a SCRATCH topic, types a reply blip, pastes a 1600x900
// (5 MB) clipboard picture with real Ctrl+V, reloads, and reads where the picture is; then deletes the scratch topic.
import fs from 'node:fs';
import { launch, newClient, sleep, shot } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); process.env.FS_BASE = st.base;
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const b = await launch();
const s2 = await signInLive(b, st.base, 2, '/home/stephan/rizzoma-fractal-scratch/run/pl-t2.json');
const c = await newClient(b, s2.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/pl-t2.json' }); const p = c.page;
await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: st.base }).catch(() => {});
const bad = []; p.on('response', (r) => { if (r.status() === 413) bad.push(r.url()); });
await p.goto(st.base, { waitUntil: 'domcontentloaded' }); await sleep(4000);
await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(600);
await p.locator('#topic-title').click(); await p.keyboard.type('ZZ SCRATCH paste check', { delay: 25 });
await p.locator('.btn-primary').click(); await sleep(5000);
const topicId = p.url().split('/topic/')[1]; log('scratch topic ' + topicId);
await p.locator('.write-reply-input').first().click(); await p.keyboard.type('Blip one text', { delay: 25 }); await p.keyboard.press('Enter'); await sleep(2500);
await p.locator('.write-reply-input').first().click(); await p.keyboard.type('Blip two text', { delay: 25 }); await p.keyboard.press('Enter'); await sleep(2500);
await p.locator('.blip-collapsed-row', { hasText: 'Blip one' }).first().click(); await sleep(1800);
const li = p.locator('.blip-container.nested-blip li', { hasText: /^Blip one/ }).first(); const bx = await li.boundingBox();
await p.mouse.click(bx.x + 40, bx.y + 8); await sleep(1500); await p.keyboard.press('Control+End'); await sleep(400);
await p.evaluate(async () => { const W = 1600, H = 900; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); const d = g.createImageData(W, H); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); window.__bytes = blob.size; await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); });
log('clipboard picture bytes: ' + await p.evaluate(() => window.__bytes));
await p.keyboard.press('Control+v'); await sleep(10000);
await shot(c, 'steps/pl-live-1-after-paste');
await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(8000);
await p.locator('.blip-collapsed-row', { hasText: 'Blip one' }).first().click(); await sleep(2000);
await shot(c, 'steps/pl-live-2-after-reload');
const where = await p.evaluate(async (id) => { const r = await fetch(`/api/blips?waveId=${id}&limit=100`, { credentials: 'include' }); const j = await r.json(); return (j.blips || j).filter((x) => !x.deleted).map((x) => String(x.content).replace(/<img[^>]*src="([^"]{0,40})[^>]*>/g, '[IMG $1]').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)); }, topicId);
log('stored blips: ' + JSON.stringify(where));
log('picture visible after reload: ' + await p.locator('.rizzoma-blip img').filter({ visible: true }).count() + '; 413 responses: ' + bad.length);
// delete the scratch topic (owner = tester 2)
const del = await p.evaluate(async (id) => { await fetch('/api/auth/csrf', { credentials: 'include' }); const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1]) : ''; const r = await fetch(`/api/topics/${id}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' }); return r.status; }, topicId);
log('scratch topic delete status: ' + del);
await c.ctx.close(); await b.close();
