// Screenshot how each gadget of a scratch topic renders in the VIEW state (to be READ). env: FS_STATE_IN (json
// with topicId, base), FS_TAG. Element screenshots only of the topic's own content.
import fs from 'node:fs';
import { launch, newClient, signInUi, seedUser, sleep, OUT } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); const BASE = st.base; process.env.FS_BASE = BASE;
const TAG = process.env.FS_TAG || 'look';
const b = await launch(); let c;
if (process.env.FS_LIVE === '1') { const sp = '/home/stephan/rizzoma-fractal-scratch/run/gl-t1.json'; const { email } = await signInLive(b, BASE, 1, sp); c = await newClient(b, email, { storageState: sp }); }
else { await seedUser('fs-alice@example.com'); c = await newClient(b, 'fs-alice@example.com'); await signInUi(c); }
const p = c.page; const cons = []; const net = []; const csp = [];
p.on('console', (m) => { const t = m.text(); if (/Refused|Content Security|blocked/i.test(t)) csp.push(t.slice(0, 200)); else if (['error', 'warning'].includes(m.type())) cons.push(`${m.type()}: ${t.slice(0, 150)}`); });
p.on('response', (r) => { if (r.status() >= 400) net.push(`${r.status()} ${r.url().slice(0, 110)}`); });
p.on('requestfailed', (r) => net.push(`FAILED ${r.url().slice(0, 100)} ${r.failure()?.errorText}`));
await p.goto(`${BASE}/?layout=rizzoma#/topic/${st.topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(10000);
const kinds = [
  ['poll', 'figure.gadget-poll'], ['code', 'pre'], ['latex', 'p:has-text("$$"), .rizzoma-latex, .katex'], ['youtube', 'figure[data-embed-provider="youtube"]'],
  ['iframe', 'figure[data-embed-provider="iframe"]'], ['sheet', 'figure[data-embed-provider="spreadsheet"]'], ['image', 'img[alt="image"]'],
  ['app0', 'figure.gadget-app-frame >> nth=0'], ['app1', 'figure.gadget-app-frame >> nth=1'], ['app2', 'figure.gadget-app-frame >> nth=2'], ['app3', 'figure.gadget-app-frame >> nth=3'],
];
for (const [name, sel] of kinds) {
  const loc = p.locator(`.topic-content-view ${sel.startsWith('figure.gadget-app') ? '' : ''}${sel}`.replace(' >> nth', ' >> nth')).first();
  const n = await p.locator(`.topic-content-view ${sel.split(' >> ')[0]}`).count();
  let box = null;
  try { await loc.scrollIntoViewIfNeeded({ timeout: 3000 }); box = await loc.boundingBox(); await sleep(1500); await loc.screenshot({ path: `${OUT}/steps/gadget-${TAG}-${name}.png`, timeout: 6000 }); } catch (e) { /* none */ }
  const text = n ? await loc.evaluate((e) => (e.textContent || '').replace(/\s+/g, ' ').slice(0, 70)).catch(() => '') : '';
  console.log(`${name.padEnd(8)} nodes=${n} box=${box ? Math.round(box.width) + 'x' + Math.round(box.height) : 'none'} text="${text}" -> gadget-${TAG}-${name}.png`);
}
console.log('CSP messages:', JSON.stringify([...new Set(csp)].slice(0, 6)));
console.log('CONSOLE:', JSON.stringify([...new Set(cons)].slice(0, 6)));
console.log('NETWORK:', JSON.stringify([...new Set(net)].slice(0, 8)));
console.log('frames:', p.frames().map((f) => { try { const u = new URL(f.url()); return u.host + u.pathname.slice(0, 28); } catch { return f.url(); } }).join(' ; '));
await c.ctx.close(); await b.close();
