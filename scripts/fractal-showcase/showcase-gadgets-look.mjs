// Look at how the 11 gadget blips of the live showcase topic ACTUALLY render (a person's view): expand the
// Gadgets branch with real clicks, screenshot every gadget blip, print DOM facts, console and network problems.
import fs from 'node:fs';
import { launch, newClient, sleep, OUT } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); process.env.FS_BASE = st.base;
const b = await launch();
const s = await signInLive(b, st.base, 1, '/home/stephan/rizzoma-fractal-scratch/run/look-t1.json');
const c = await newClient(b, s.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/look-t1.json' });
const p = c.page; const cons = []; const net = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) cons.push(`${m.type()}: ${m.text().slice(0, 160)}`); });
p.on('response', (r) => { if (r.status() >= 400) net.push(`${r.status()} ${r.url().slice(0, 110)}`); });
p.on('requestfailed', (r) => net.push(`FAILED ${r.url().slice(0, 100)} ${r.failure()?.errorText}`));
await p.goto(`${st.base}/?layout=rizzoma#/topic/${st.topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
const clickMarkerAfter = async (text) => { const m = p.locator('.rizzoma-blip').filter({ hasText: text }).last().locator('.blip-thread-marker').first(); await m.scrollIntoViewIfNeeded().catch(() => {}); await m.click({ timeout: 4000 }).catch((e) => console.log('marker click err', text, String(e.message).split('\n')[0].slice(0, 50))); await sleep(1000); };
await clickMarkerAfter('Gadgets branch');
const names = ['Code block gadget', 'Poll gadget', 'LaTeX gadget', 'YouTube gadget', 'Iframe gadget', 'Spreadsheet gadget', 'Image gadget', 'Kanban app gadget', 'Planner app gadget', 'Focus timer gadget', 'Notes app gadget'];
for (const n of names) {
  // the row label's own marker opens its leaf
  const row = p.locator('.rizzoma-blip').filter({ hasText: n }).last();
  const mk = row.locator('.blip-thread-marker').first();
  await mk.scrollIntoViewIfNeeded().catch(() => {}); await mk.click({ timeout: 4000 }).catch(() => {}); await sleep(1800);
  const leaf = p.locator('.rizzoma-blip').filter({ hasText: `${n} body` }).last();
  const facts = await leaf.evaluate((el) => {
    const r = (x) => { const b = x.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}`; };
    const parts = [];
    for (const x of el.querySelectorAll('iframe, img, pre, code, .katex, .rizzoma-latex, canvas, table, [data-gadget-type], .gadget-node-view, figure')) parts.push(`${x.tagName.toLowerCase()}${x.getAttribute('data-gadget-type') ? '#' + x.getAttribute('data-gadget-type') : ''}${x.getAttribute('src') ? '[' + x.getAttribute('src').slice(0, 50) + ']' : ''} ${r(x)}`);
    return { text: (el.textContent || '').replace(/\s+/g, ' ').slice(0, 90), parts: parts.slice(0, 6) };
  }).catch(() => ({ text: 'NOT FOUND', parts: [] }));
  const f = `${OUT}/steps/showcase-gadget-${n.split(' ')[0].toLowerCase()}.png`;
  await leaf.screenshot({ path: f }).catch(() => {});
  console.log(`${n}: ${JSON.stringify(facts)} -> ${f.split('/').pop()}`);
}
console.log('CONSOLE:', JSON.stringify([...new Set(cons)].slice(0, 10)));
console.log('NETWORK:', JSON.stringify([...new Set(net)].slice(0, 10)));
console.log('frames:', p.frames().map((f) => new URL(f.url()).host + new URL(f.url()).pathname.slice(0, 30)).join(' ; '));
await c.ctx.close(); await b.close();
