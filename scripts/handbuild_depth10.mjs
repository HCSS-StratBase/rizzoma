#!/usr/bin/env node
/**
 * HAND-BUILD a depth-10 fractal on the NEW rizzoma through the REAL UI.
 * S10 attended protocol: ONE atomic action per step, screenshot after EVERY
 * action, DOM state logged as supporting data only (the PNG is the verdict).
 * Real Playwright clicks + real keystrokes throughout. NO fixtures, NO
 * programmatic expansion.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const base = 'https://138-201-62-161.nip.io';
const OUT = process.env.HB_OUT || '/mnt/c/Rizzoma/screenshots/260714-handbuild-d10';
await fs.mkdir(OUT, { recursive: true });
const log = m => console.log(`[hb] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', e => log(`PAGEERROR: ${String(e).slice(0, 140)}`));

async function step(name) {
  n += 1;
  const id = String(n).padStart(2, '0');
  await sleep(1200);
  const st = await page.evaluate(() => ({
    containers: document.querySelectorAll('.blip-container').length,
    editable: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(e => e.offsetParent !== null).length,
    menus: Array.from(document.querySelectorAll('.blip-menu')).filter(e => e.offsetParent !== null).length,
    focus: (document.activeElement?.className || '').toString().slice(0, 28),
  }));
  await page.screenshot({ path: `${OUT}/${id}-${name}.png`, fullPage: false });
  log(`${id}-${name}  containers=${st.containers} editable=${st.editable} menus=${st.menus} focus="${st.focus}"`);
}

// --- login + fresh topic (API only for topic creation; ALL fractal work is UI) ---
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
});
const topic = await page.evaluate(async () => {
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  const r = await fetch('/api/topics', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ title: 'HANDBUILD d10 ' + Date.now(), content: '<h1>HANDBUILD d10</h1>' }) });
  const d = await r.json();
  return d.id || d._id;
});
log(`topic: ${topic}`);
await page.goto(`${base}/?layout=rizzoma#/topic/${topic}`, { waitUntil: 'domcontentloaded' });
await sleep(7000);
await step('topic-open');

// --- root Edit (REAL click) ---
await page.locator('button.topic-tb-btn', { hasText: 'Edit' }).first().click({ timeout: 10000 });
await step('root-edit-clicked');

// --- click into the root editor + type L1 (REAL) ---
await page.locator('.topic-content-edit .ProseMirror').first().click({ timeout: 8000 });
await step('clicked-into-root-editor');
// caret lands in the H1 title — press Enter FIRST so the label becomes a body
// line, not a suffix of the title (harness fix after the 1st hand-build run).
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.keyboard.type('L1 root label', { delay: 30 });
await step('typed-L1');

// --- descend: Ctrl+Enter → type → repeat, to depth 10 ---
for (let d = 2; d <= 10; d++) {
  await page.keyboard.press('Control+Enter');
  await step(`ctrl-enter-to-L${d}`);
  // the new child must be focused+editable; type into it with REAL keys
  await page.keyboard.type(`L${d} label`, { delay: 30 });
  await step(`typed-L${d}`);
  const ok = await page.evaluate(t => document.body.innerText.includes(t), `L${d} label`);
  if (!ok) { log(`!!! L${d} TEXT NOT IN DOM — build broke at depth ${d}`); break; }
}

// --- finish + reload + inspect persisted state ---
const done = page.locator('button.topic-tb-btn', { hasText: 'Done' }).first();
await done.click({ timeout: 8000 }).catch(() => log('no Done button (already exited)'));
await step('done-clicked');
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(8000);
await step('after-reload-collapsed');

// --- expand level by level with REAL clicks on the [+] markers ---
for (let d = 1; d <= 10; d++) {
  const marker = page.locator('.blip-thread-marker:visible').filter({ hasText: '+' }).last();
  const cnt = await marker.count();
  if (!cnt) { log(`no more [+] markers at expand step ${d}`); break; }
  await marker.click({ timeout: 6000 }).catch(e => log(`expand ${d} click failed: ${e.message.split('\n')[0]}`));
  await step(`expand-${d}`);
}

// persisted-depth check
const persisted = await page.evaluate(() => {
  const labels = [];
  for (let i = 1; i <= 10; i++) if (document.body.innerText.includes(`L${i} label`)) labels.push(i);
  return labels;
});
log(`persisted labels visible after reload+expand: L${persisted.join(', L')}`);
log(`topic URL: ${base}/?layout=rizzoma#/topic/${topic}`);
await browser.close();
