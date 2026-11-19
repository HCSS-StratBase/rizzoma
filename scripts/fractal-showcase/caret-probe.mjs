// Caret probe on a scratch chain (root > Probe level 1..4) on any host: click into the level 2 blip and type,
// recording where the caret is before and after every keystroke. Read-only page probes; real mouse and keys.
// env: FS_BASE, FS_LIVE=1, FS_PROBE_TOPIC (topic id), FS_STATE_IN (json with topicId)
import fs from 'node:fs';
import { launch, newClient, signInUi, seedUser, sleep, shot, TYPE_DELAY, OUT } from './lib.mjs';
import { signInLive } from './liveauth.mjs';

const BASE = (process.env.FS_BASE || 'http://127.0.0.1:3105').replace(/\/$/, ''); process.env.FS_BASE = BASE;
const topicId = process.env.FS_PROBE_TOPIC || JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')).topicId;
const b = await launch();
let c;
if (process.env.FS_LIVE === '1') { const st = '/home/stephan/rizzoma-fractal-scratch/run/live-t1-probe.json'; const { email } = await signInLive(b, BASE, 1, st); c = await newClient(b, email, { storageState: st }); }
else { await seedUser('fs-alice@example.com'); c = await newClient(b, 'fs-alice@example.com'); await signInUi(c); }
const p = c.page;
const probe = () => p.evaluate(() => {
  const s = getSelection(); const a = document.activeElement;
  const be = a?.closest?.('[data-blip-id]');
  const pm = a?.closest?.('.ProseMirror');
  return { blip: (be?.getAttribute('data-blip-id') || '-').slice(-5), anchor: (s?.anchorNode?.textContent || '').slice(0, 26), off: s?.anchorOffset ?? -1, focus: `${a?.tagName}.${String(a?.className || '').slice(0, 18)}`, editors: document.querySelectorAll('.ProseMirror[contenteditable="true"]').length, text: (pm?.textContent || '').slice(0, 50) };
});
const show = (lab, o) => console.log(`${lab.padEnd(16)} blip=${o.blip} off=${String(o.off).padStart(2)} anchor="${o.anchor}" editors=${o.editors} focus=${o.focus} pm="${o.text}"`);
const expandChain = async (upto) => {
  for (let i = 0; i < upto; i += 1) {
    const m = p.locator('.blip-thread-marker').filter({ visible: true });
    const n = await m.count(); let did = false;
    for (let k = 0; k < n; k += 1) { const el = m.nth(k); const txt = await el.evaluate((e) => e.closest('.rizzoma-blip')?.textContent?.slice(0, 40) || ''); if (/expanded/.test((await el.getAttribute('class')) || '')) continue; try { await el.click({ timeout: 2000 }); did = true; await sleep(900); break; } catch { /* next */ } }
    if (!did) break;
  }
};
const l2 = () => p.locator('.rizzoma-blip').filter({ hasText: 'Probe level 2' }).last();
const typeProbe = async (label, text) => {
  show(`${label} before`, await probe());
  for (const ch of text) { await p.keyboard.type(ch, { delay: TYPE_DELAY }); await sleep(250); show(`${label} '${ch}'`, await probe()); }
  await sleep(2500); show(`${label} +2.5s`, await probe());
};
const open = async () => { await p.goto(`${BASE}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(7000); await expandChain(4); await sleep(1200); };

console.log('=== S1: click into level 2 (view state) and type');
await open();
await shot(c, 'steps/probe-s1-opened');
console.log('rows:', await p.evaluate(() => Array.from(document.querySelectorAll('.rizzoma-blip')).map((e) => (e.textContent || '').slice(0, 30)).join(' | ')));
const li = l2().locator('li').first(); const bx = await li.boundingBox();
await p.mouse.click(bx.x + 60, bx.y + 8); await sleep(900);
await typeProbe('S1', 'AB');
await shot(c, 'steps/probe-s1-typed');
await p.keyboard.press('Control+End');

console.log('=== S2: after reload, click into level 2 and type');
await open();
const li2 = l2().locator('li').first(); const bx2 = await li2.boundingBox();
await p.mouse.click(bx2.x + 60, bx2.y + 8); await sleep(900);
await typeProbe('S2', 'CD');
await shot(c, 'steps/probe-s2-typed');

console.log('=== S3: add a level 3 child at the end of level 2 (Ctrl+Enter), type, then click back into level 2 and type');
await p.keyboard.press('Control+End'); show('S3 pre-CE', await probe());
await p.keyboard.press('Control+Enter'); await sleep(2500); show('S3 after CE', await probe());
await p.keyboard.type('Extra child', { delay: TYPE_DELAY }); await sleep(1500); show('S3 child typed', await probe());
const li3 = l2().locator('li').first(); const bx3 = await li3.boundingBox();
await p.mouse.click(bx3.x + 60, bx3.y + 8); await sleep(900);
await typeProbe('S3 back', 'EF');
await shot(c, 'steps/probe-s3-typed');

console.log('=== S4: collapse and expand level 2 chain, then click and type');
await p.keyboard.press('Control+e').catch(() => {}); await sleep(800);
const markers = p.locator('.blip-thread-marker').filter({ visible: true }); const mc = await markers.count();
await markers.first().click().catch(() => {}); await sleep(900); await markers.first().click().catch(() => {}); await sleep(900);
const li4 = l2().locator('li').first(); const bx4 = await li4.boundingBox().catch(() => null);
if (bx4) { await p.mouse.click(bx4.x + 60, bx4.y + 8); await sleep(900); await typeProbe('S4', 'GH'); }
await shot(c, 'steps/probe-s4-typed');
const stored = await p.evaluate(async (id) => { const r = await fetch(`/api/blips?waveId=${id}&limit=100`, { credentials: 'include' }); const j = await r.json(); return (j.blips || j).filter((x) => !x.deleted).map((x) => String(x.content).replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '[+]').replace(/<[^>]+>/g, '').slice(0, 60)); }, topicId);
console.log('STORED:', JSON.stringify(stored));
console.log('problems:', c.problems.length);
await c.ctx.close(); await b.close();
