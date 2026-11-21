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



await expandRow(gadgetsBlip, 'Poll gadget'); await sleep(2500);
const leaf = leafOf('Poll gadget'); await leaf.scrollIntoViewIfNeeded().catch(() => {});
const polls = () => leaf.locator('figure.gadget-poll');
log('polls in the read view: ' + await polls().count());
// enter edit mode by clicking the text, then delete the extra polls with the keyboard: Ctrl+End, then Backspace removes the last block
const bx = await leaf.locator('li').first().boundingBox(); await p.mouse.click(bx.x + 40, bx.y + 8); await sleep(1800); await p.keyboard.press('Control+End'); await sleep(500);
const nodes = () => leaf.locator('.gadget-node-view');
log('poll node views in the editor: ' + await nodes().count());
for (let i = 0; i < 2; i += 1) {
  const n = nodes().last(); await n.scrollIntoViewIfNeeded().catch(() => {}); const nb = await n.boundingBox();
  if (!nb) { log('no node box'); break; }
  await p.mouse.click(nb.x + 4, nb.y + 4); await sleep(600);
  await p.keyboard.press('Backspace'); await sleep(1200);
  log(`after deleting poll ${i + 1}: node views ` + await nodes().count());
}
await done(); await done(); await sleep(3000);
log('polls after Done: ' + await polls().count());
await shot(c, 'steps/poll-after-dedupe');
await c.ctx.close(); await b.close();
