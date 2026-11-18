// LIVE probe of the empty-root-editor fix: as Fractal Tester 1, N fresh scratch topics, each created through
// the New dialog, Edit, three bullets typed, Done, reload, persisted text confirmed, then deleted by the UI.
// Headed on a private display, human pace. Credentials never printed. env: FS_BASE, FS_N
import fs from 'node:fs';
import { launch, newClient, sleep, TYPE_DELAY, OUT } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
import { EDITOR } from './ops.mjs';

const BASE = (process.env.FS_BASE || 'https://138-201-62-161.nip.io').replace(/\/$/, '');
process.env.FS_BASE = BASE;
const N = Number(process.env.FS_N || 10);
const RUN = Date.now().toString(36);
const STATE = `/home/stephan/rizzoma-fractal-scratch/run/live-t1-${RUN}.json`;
const b = await launch();
const { email } = await signInLive(b, BASE, 1, STATE);
console.log('signed in as tester 1 (state file written, mode 0600)');
const c = await newClient(b, email, { storageState: STATE });
const p = c.page;
const api = (u) => p.evaluate(async (x) => { const r = await fetch(x, { credentials: 'include' }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; }, u);
const lines = ['Live bullet one', 'Live bullet two', 'Live bullet three'];
const made = []; let clean = 0;
for (let i = 1; i <= N; i += 1) {
  const title = `ZZ SCRATCH fractal live ${RUN}-${i}`;
  let ok = false; let why = '';
  try {
    await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(600);
    await p.locator('#topic-title').click(); await p.keyboard.type(title, { delay: TYPE_DELAY });
    await p.locator('.btn-primary').click(); await sleep(4000);
    const id = p.url().split('/topic/')[1]; made.push({ id, title });
    await p.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click(); await sleep(1800);
    const before = await p.evaluate((sel) => document.querySelector(sel)?.textContent || '', EDITOR);
    await p.locator(EDITOR).first().click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
    for (let k = 0; k < lines.length; k += 1) { if (k) await p.keyboard.press('Enter'); await p.keyboard.type(lines[k], { delay: TYPE_DELAY }); }
    await sleep(1500);
    await p.locator('.wave-panel [data-testid="blip-menu-done"]').first().click(); await sleep(2500);
    await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(5000);
    const view = await p.evaluate(() => document.querySelector('.topic-content-view, .blip-text')?.textContent || document.body.innerText);
    const stored = (await api(`/api/topics/${id}`)).j?.content || '';
    const inView = lines.every((l) => view.includes(l)); const inStore = lines.every((l) => stored.includes(l));
    ok = before.includes(title) && inView && inStore;
    why = `editor-had-title=${before.includes(title)} view=${inView} stored=${inStore}`;
    if (i === 1) await p.screenshot({ path: `${OUT}/steps/live-trial-1-after-reload.png` }).catch(() => {});
  } catch (e) { why = `exception ${String(e.message).split('\n')[0].slice(0, 120)}`; }
  if (ok) clean += 1;
  console.log(`live trial ${i}: ${ok ? 'CLEAN' : 'FAIL'} ${why}`);
}
console.log(`RESULT live ${clean} of ${N} clean`);
fs.writeFileSync(`/home/stephan/rizzoma-fractal-scratch/run/live-made-${RUN}.json`, JSON.stringify(made));
console.log('made', made.length, 'scratch topics; ids in live-made-' + RUN + '.json');
await c.ctx.close(); await b.close();
