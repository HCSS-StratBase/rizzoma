// Do the gadgets RENDER? Insert each of the 11 palette gadgets in a scratch topic with real clicks and typing,
// finish, reload, then look at the rendered view: DOM facts, console messages, failed requests and a screenshot
// per gadget (to be READ). env: FS_BASE, FS_LIVE=1, FS_TAG (label for file names)
import fs from 'node:fs';
import { launch, newClient, signInUi, seedUser, sleep, shot, TYPE_DELAY, OUT } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
import { EDITOR } from './ops.mjs';
const BASE = (process.env.FS_BASE || 'http://127.0.0.1:3105').replace(/\/$/, ''); process.env.FS_BASE = BASE;
const TAG = process.env.FS_TAG || 'run';
const b = await launch(); let c;
if (process.env.FS_LIVE === '1') { const st = '/home/stephan/rizzoma-fractal-scratch/run/gadget-t1.json'; const { email } = await signInLive(b, BASE, 1, st); c = await newClient(b, email, { storageState: st }); }
else { await seedUser('fs-alice@example.com'); c = await newClient(b, 'fs-alice@example.com'); await signInUi(c); }
const p = c.page; const net = []; const cons = [];
p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) cons.push(`${m.type()}: ${m.text().slice(0, 180)}`); });
p.on('response', (r) => { if (r.status() >= 400) net.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 120)}`); });
p.on('requestfailed', (r) => net.push(`FAILED ${r.url().slice(0, 120)} ${r.failure()?.errorText}`));
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(600);
await p.locator('#topic-title').click(); await p.keyboard.type(`ZZ SCRATCH fractal gadgets ${TAG}`, { delay: 20 });
await p.locator('.btn-primary').click(); await sleep(4500);
const topicId = p.url().split('/topic/')[1];
await p.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click(); await sleep(1800);
await p.locator(EDITOR).first().click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
const type = (t) => p.keyboard.type(t, { delay: Math.min(TYPE_DELAY, 40) });
const inp = (ph) => p.locator(`input[placeholder="${ph}"]`).filter({ visible: true }).last();
const GADGETS = [
  ['Code', async () => { await type('const answer = 42;'); }],
  ['Poll', async () => {}],
  ['LaTeX', async () => { await type('E = mc^2 + \\frac{a}{b}'); }],
  ['YouTube', async () => { await inp('YouTube URL...').click(); await type('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); await p.keyboard.press('Enter'); }],
  ['iFrame', async () => { await inp('Embed URL...').click(); await type('https://example.org/'); await p.keyboard.press('Enter'); }],
  ['Sheet', async () => { await inp('Google Sheets URL...').click(); await type('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'); await p.keyboard.press('Enter'); }],
  ['Image', async () => { await inp('Image URL...').click(); await type(`${BASE}/s/img/user/anonim.png`); await p.keyboard.press('Enter'); }],
  ['Kanban', async () => {}], ['Planner', async () => {}], ['Focus', async () => {}], ['Notes', async () => {}],
];
for (const [name, fill] of GADGETS) {
  await p.keyboard.press('Enter'); await type(`${name} gadget:`);
  try {
    await p.keyboard.press('Enter');
    await p.locator('[data-testid="right-tools-insert-gadget"]').click(); await sleep(700);
    await p.locator(`button[title="${name}"]`).first().click(); await sleep(1500);
    await fill(); await sleep(1200);
    console.log(`inserted ${name}; inputs visible now: ${await p.locator('.gadget-node-view input, .gadget-node-view textarea').filter({ visible: true }).count()}`);
    // return the caret to the editor body after the gadget so the next label can be typed
    await p.locator(EDITOR).first().click({ position: { x: 5, y: 5 } }).catch(() => {}); await p.keyboard.press('Control+End');
  } catch (e) { console.log(`inserted ${name}: ERR ${String(e.message).split('\n')[0].slice(0, 90)}`); }
}
await sleep(2500);
await p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last().click().catch(() => {}); await sleep(2500);
await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(9000);
fs.writeFileSync('/home/stephan/rizzoma-fractal-scratch/run/gadget-topic.json', JSON.stringify({ topicId, base: BASE }));
const facts = await p.evaluate(() => {
  const root = document.querySelector('.topic-content-view, .blip-text') || document.body;
  const q = (sel) => Array.from(root.querySelectorAll(sel));
  const out = [];
  for (const e of q('[data-gadget-type], .gadget-node-view, figure[class*="gadget"], .rizzoma-latex, iframe, pre, .katex')) {
    const r = e.getBoundingClientRect();
    out.push({ tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 40), gt: e.getAttribute('data-gadget-type') || '', src: (e.getAttribute('src') || e.getAttribute('data-embed-src') || '').slice(0, 70), w: Math.round(r.width), h: Math.round(r.height), text: (e.textContent || '').trim().slice(0, 50) });
  }
  return out;
});
console.log('RENDERED DOM facts:'); for (const f of facts) console.log(' ', JSON.stringify(f));
const view = p.locator('.topic-content-view, .blip-text').first();
await view.screenshot({ path: `${OUT}/steps/gadgets-${TAG}-all.png` }).catch(() => {});
const frames = p.frames().map((f) => f.url().slice(0, 90));
console.log('frames:', JSON.stringify(frames));
console.log('CONSOLE:', JSON.stringify([...new Set(cons)].slice(0, 12)));
console.log('NETWORK problems:', JSON.stringify([...new Set(net)].slice(0, 12)));
await shot(c, `steps/gadgets-${TAG}-page`);
await c.ctx.close(); await b.close();
