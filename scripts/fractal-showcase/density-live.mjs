// Live look at the level spacing as Fractal Tester 2: open the showcase, open the spine, screenshot at 1366 wide.
import fs from 'node:fs';
import { launch, newClient, sleep, shot } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); process.env.FS_BASE = st.base;
const b = await launch();
const s2 = await signInLive(b, st.base, 2, '/home/stephan/rizzoma-fractal-scratch/run/dl-t2.json');
const c = await newClient(b, s2.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/dl-t2.json' }); const p = c.page;
await p.goto(`${st.base}/?layout=rizzoma#/topic/${st.topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(9000);
await p.locator('.blip-collapsed-row', { hasText: 'Spine' }).first().click().catch(() => {}); await sleep(1800);
for (let i = 0; i < 8; i += 1) {
  const m = p.locator('.blip-thread-marker').filter({ visible: true }); const n = await m.count(); let did = false;
  for (let k = 0; k < n; k += 1) { const t = m.nth(k); const txt = ((await t.textContent()) || '').trim(); if (txt === '+') { await t.click().catch(() => {}); did = true; await sleep(1100); break; } }
  if (!did) break;
}
const ys = await p.evaluate(() => Array.from(document.querySelectorAll('li > p')).filter((e) => e.getBoundingClientRect().height > 0 && /^Spine level/.test((e.textContent || '').trim())).map((e) => Math.round(e.getBoundingClientRect().y)));
console.log('spine label y positions:', JSON.stringify(ys), 'pitches:', JSON.stringify(ys.slice(1).map((y, i) => y - ys[i])));
await shot(c, 'steps/dl-live-spine');
await c.ctx.close(); await b.close();
