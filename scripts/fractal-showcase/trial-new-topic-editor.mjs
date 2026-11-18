// N fresh topics: create through the New dialog, press Edit, type one line, report whether the root
// editor kept the title and the typed text (regression check for the empty-root-editor defect).
// Headed, human-paced, real input only. env: FS_BASE, FS_N, FS_STATE (storage state of a signed-in user)
import { launch, newClient, sleep, BASE, TYPE_DELAY } from './lib.mjs';
import { EDITOR } from './ops.mjs';

const N = Number(process.env.FS_N || 10);
const b = await launch();
const c = await newClient(b, 'fs-alice@example.com', { storageState: process.env.FS_STATE || '/home/stephan/rizzoma-fractal-scratch/run/alice.json' });
const p = c.page;
let clean = 0; const rows = [];
for (let i = 1; i <= N; i += 1) {
  const title = `ZZ SCRATCH fractal trial ${Date.now().toString(36)}-${i}`;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(2500);
  await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(500);
  await p.locator('#topic-title').click(); await p.keyboard.type(title, { delay: TYPE_DELAY });
  await p.locator('.btn-primary').click(); await sleep(3500);
  await p.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click(); await sleep(1500);
  const before = await p.evaluate((sel) => document.querySelector(sel)?.textContent || '', EDITOR);
  await p.locator(EDITOR).first().click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
  await p.keyboard.type('Alpha line typed by hand', { delay: TYPE_DELAY }); await sleep(1500);
  const after = await p.evaluate((sel) => document.querySelector(sel)?.textContent || '', EDITOR);
  const ok = before.includes(title) && after.includes('Alpha line typed by hand');
  if (ok) clean += 1;
  rows.push({ i, ok, before: before.slice(0, 40), after: after.slice(-30) });
  console.log(`trial ${i}: ${ok ? 'CLEAN' : 'FAIL'} before=${JSON.stringify(before.slice(0, 40))}`);
}
console.log(`RESULT ${process.env.FS_LABEL || ''} ${clean} of ${N} clean; problems=${c.problems.length}`);
await c.ctx.close(); await b.close();
