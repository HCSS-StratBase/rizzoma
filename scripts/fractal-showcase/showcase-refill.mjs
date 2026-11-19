// Refill the LaTeX, Code and Sheet leaves of the live showcase topic BY HAND (real clicks and typing), as the owner.
// Navigates the way a person does: expand the Gadgets branch, expand the row, click into the leaf, type.
// env: FS_STATE_IN (json with topicId, base)
import fs from 'node:fs';
import { launch, newClient, sleep, shot, apiGet, TYPE_DELAY } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); process.env.FS_BASE = st.base;
const b = await launch();
const s = await signInLive(b, st.base, 1, '/home/stephan/rizzoma-fractal-scratch/run/refill-t1.json');
const c = await newClient(b, s.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/refill-t1.json' });
const p = c.page; const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const type = (t) => p.keyboard.type(t, { delay: TYPE_DELAY });
await p.goto(`${st.base}/?layout=rizzoma#/topic/${st.topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
const expandRow = async (scope, text) => {
  const rx = new RegExp(text.replace(/^(\S+) /, '$1.{0,3} '));
  const li = scope.locator('li').filter({ hasText: rx }).last();
  const mk = li.locator('.blip-thread-marker').first();
  await mk.scrollIntoViewIfNeeded().catch(() => {});
  if ((await mk.textContent()) !== '−') { await mk.click({ timeout: 5000 }); await sleep(1500); }
};
await expandRow(p.locator('.topic-content-view, .blip-text').first(), 'Gadgets branch');
await shot(c, 'steps/refill-after-gadgets-expand');
console.log('blips shown:', await p.evaluate(() => Array.from(document.querySelectorAll('.rizzoma-blip')).map((e) => (e.querySelector('li')?.textContent || e.textContent || '').trim().slice(0, 28)).join(' | ')));
const gadgetsBlip = p.locator('.rizzoma-blip').filter({ hasText: /Code.{0,3} block gadget/ }).filter({ hasText: /LaTeX.{0,3} gadget/ }).last();
const leafOf = (n) => p.locator('.rizzoma-blip').filter({ hasText: `${n} body` }).last();
const done = async () => { for (let i = 0; i < 3; i += 1) { const d = p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } } };
const palette = async (name) => { await p.locator('[data-testid="right-tools-insert-gadget"]').click(); await sleep(700); await p.locator(`button[title="${name}"]`).first().click(); await sleep(1500); };
const enterLeaf = async (label) => {
  await expandRow(gadgetsBlip, label);
  const leaf = leafOf(label);
  await leaf.scrollIntoViewIfNeeded().catch(() => {});
  const li = leaf.locator('li').first(); const bx = await li.boundingBox();
  await p.mouse.click(bx.x + 40, bx.y + 8); await sleep(1500); await p.keyboard.press('Control+End'); await sleep(400);
};
// 1. LaTeX
await enterLeaf('LaTeX gadget');
const hasEmpty = await p.evaluate(() => /\$\$\s*\$\$/.test(document.activeElement?.closest?.('.ProseMirror')?.innerText || ''));
log(`LaTeX leaf: empty $$ $$ present in the editor source: ${hasEmpty}`);
if (hasEmpty) { for (let i = 0; i < 3; i += 1) await p.keyboard.press('ArrowLeft'); } else { await p.keyboard.press('Enter'); await palette('LaTeX'); }
await type('E = mc^2 + \\frac{a}{b}'); await sleep(800); await p.keyboard.press('Control+End');
await shot(c, 'steps/refill-latex-edit'); await done();
// 2. Code
await enterLeaf('Code block gadget'); await p.keyboard.press('Enter'); await palette('Code'); await type('const answer = 42;'); await sleep(1500);
await shot(c, 'steps/refill-code-edit'); await done();
// 3. Sheet
await enterLeaf('Spreadsheet gadget'); await p.keyboard.press('Enter'); await palette('Sheet');
const inp = p.locator('input[placeholder="Google Sheets URL..."]').filter({ visible: true }).last(); await inp.click();
await type('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'); await p.keyboard.press('Enter'); await sleep(3000);
await shot(c, 'steps/refill-sheet-edit'); await done();
await sleep(3000);
const blips = (await apiGet(c, `/api/blips?waveId=${st.topicId}&limit=1000`)).json;
const all = (blips?.blips || blips || []).map((x) => String(x.content)).join('\n');
log(`persisted: LaTeX formula ${/\$\$[^$]*mc\^2[^$]*\$\$/.test(all)}; code block ${/<pre><code>[^<]*answer = 42/.test(all)}; sheet iframe ${/docs\.google\.com\/spreadsheets\/d\/1Bxi/.test(all)}`);
await c.ctx.close(); await b.close();
