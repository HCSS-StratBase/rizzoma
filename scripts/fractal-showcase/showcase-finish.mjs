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
//, await p.evaluate(() => Array.from(document.querySelectorAll('.rizzoma-blip')).map((e) => (e.querySelector('li')?.textContent || e.textContent || '').trim().slice(0, 28)).join(' | ')));
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


const count = async (label) => leafOf(label).evaluate((e) => ({ latex: e.querySelectorAll('.rizzoma-latex').length, pre: e.querySelectorAll('pre').length, preText: Array.from(e.querySelectorAll('pre')).map((x) => x.textContent).join('|'), iframes: e.querySelectorAll('iframe').length })).catch(() => null);
// Code: type the code into the (now empty) code block: caret is inside the block after Ctrl+End
await enterLeaf('Code block gadget'); await type('const answer = 42;'); await sleep(1200); await done();
log('code leaf: ' + JSON.stringify(await count('Code block gadget')));
// Sheet
await expandRow(gadgetsBlip, 'Spreadsheet gadget'); await sleep(2500);
await shot(c, 'steps/finish-before-sheet');
const leaf = leafOf('Spreadsheet gadget'); await leaf.scrollIntoViewIfNeeded().catch(() => {});
log('sheet leaf html: ' + (await leaf.evaluate((e) => e.innerHTML.replace(/\s+/g, ' ').slice(0, 260)).catch((e) => 'ERR ' + String(e.message).slice(0, 60))));
const box = await leaf.locator('.blip-text li, .blip-content li, li').first().boundingBox().catch(() => null);
if (box) { await p.mouse.click(box.x + 40, box.y + 8); await sleep(1500); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await palette('Sheet');
  const inp = p.locator('input[placeholder="Google Sheets URL..."]').filter({ visible: true }).last(); await inp.click();
  await type('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'); await p.keyboard.press('Enter'); await sleep(3000); await done(); }
log('sheet leaf: ' + JSON.stringify(await count('Spreadsheet gadget')));
await sleep(2500); await c.ctx.close(); await b.close();
