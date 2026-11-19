#!/usr/bin/env node
/**
 * Copy / Cut on one blip, Paste on ANOTHER blip (real clicks on the gear menu, what the person sees).
 *
 * Why it exists (18 Nov 2026, suite cases B07 and C02): every blip read the clipboard only once at mount and only its own entry,
 * so after "Copy comment" or "Cut blip" on blip A the menu of blip B still showed "Paste as reply" and "Paste as new blip"
 * DISABLED, and a paste could never be done between two blips.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-clipboard-paste-smoke.mjs   (HEADED=1 on a virtual display)
 */
import { chromium } from 'playwright';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const HEADED = process.env.HEADED === '1';
const RUN = Date.now().toString(36);
const SHOTS = process.env.SHOTS || '';
let shotNo = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };

let email = process.env.RIZZOMA_E2E_USER; let password = process.env.RIZZOMA_E2E_PASSWORD;
if (!email) {
  const { seedVerifiedE2EAccount } = await import('./scripts/lib/e2e-sharing-fixtures.mjs');
  email = `clip-${RUN}@example.com`; password = 'ClipPaste!1';
  await seedVerifiedE2EAccount(email, password);
}
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const k = page.keyboard;
async function shot(name) { if (!SHOTS) return; const fs = await import('node:fs'); fs.mkdirSync(SHOTS, { recursive: true }); shotNo += 1; await page.screenshot({ path: `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name}.png` }); }

await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(email, { delay: 10 });
await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(password, { delay: 10 });
await page.locator('.submit-btn').click();
await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
await sleep(2500);
await page.locator('.create-wave').first().click(); await sleep(900);
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite clipboard ${RUN}`, { delay: 15 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4000);
const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];

const reply = async (text) => { await page.locator('.write-reply-input').first().click(); await k.type(text, { delay: 50 }); await k.press('Enter'); await sleep(2300); };
const open = async (text) => { const row = page.locator('.blip-collapsed-row', { hasText: text }).first(); if (await row.count()) { await row.click(); await sleep(1300); } };
const activate = async (text) => {
  await open(text);
  await page.locator('.blip-container.nested-blip li', { hasText: new RegExp(`^${text}`) }).first().click({ position: { x: 12, y: 8 } }); await sleep(1300);
  for (let i = 0; i < 4 && (await page.locator('button:has-text("Done")').count()); i += 1) { await page.locator('button:has-text("Done")').last().click(); await sleep(700); }
};
const gear = async () => {
  const sel = '[data-testid="blip-menu-gear-toggle"], [data-testid="blip-menu-overflow-toggle"]';
  const own = page.locator(`.rizzoma-blip.active:not(.topic-root) ${sel}`);
  await ((await own.count()) ? own.last() : page.locator(sel).last()).click(); await sleep(500);
};
const item = (name) => page.getByRole('menuitem', { name }).last();

await reply('Copyme text'); await reply('Target');
// ---- copy comment on one blip, paste as reply on another
await activate('Copyme text'); await gear(); await item(/Copy comment/).click(); await sleep(1000);
await activate('Target'); await gear();
const pasteReply = item(/Paste as reply/);
check(await pasteReply.isEnabled(), 'after Copy comment on one blip the OTHER blip offers "Paste as reply" enabled');
await shot('menu-paste-as-reply');
if (await pasteReply.isEnabled()) {
  await pasteReply.click(); await sleep(1200);
  check(/Copyme text/.test(await page.locator('.reply-textarea').first().inputValue().catch(() => '')), 'Paste as reply fills the reply form with the copied text');
  await page.locator('.btn-send-reply').first().click(); await sleep(3000);
} else { await k.press('Escape'); }
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
await open('Target'); await sleep(800);
for (let i = 0; i < 3; i += 1) { const m = page.locator('.blip-thread-marker').first(); if (await m.count()) { await m.click().catch(() => undefined); await sleep(1200); } }
await shot('after-paste-reply');
const copies = await page.locator('.rizzoma-topic-detail').first().innerText();
check((copies.match(/Copyme text/g) || []).length === 2, 'the topic now shows the text twice: the original and the pasted copy', copies.replace(/\s+/g, ' ').slice(0, 120));

// ---- cut a blip, paste as new blip under another
await reply('Mover'); await reply('Dest');
await activate('Mover'); await gear(); await item(/Cut blip/).click(); await sleep(1000);
await activate('Dest'); await gear();
const pasteNew = item(/Paste as new blip/);
check(await pasteNew.isEnabled(), 'after Cut blip on one blip the OTHER blip offers "Paste as new blip" enabled');
await shot('menu-paste-as-new');
if (await pasteNew.isEnabled()) { await pasteNew.click(); await sleep(3000); } else { await k.press('Escape'); }
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
await open('Dest'); await sleep(800);
for (let i = 0; i < 3; i += 1) { const m = page.locator('.blip-thread-marker').first(); if (await m.count()) { await m.click().catch(() => undefined); await sleep(1200); } }
await shot('after-cut-paste');
const destBox = page.locator('.blip-container', { hasText: 'Dest' }).first();
check(/Mover/.test(await destBox.innerText().catch(() => '')), 'the cut blip now shows inside the destination blip');

const api = (method, url) => page.evaluate(async ({ method, url }) => {
  const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  const r = await fetch(url, { method, headers: { 'x-csrf-token': csrf }, credentials: 'include' });
  return { status: r.status, text: await r.text() };
}, { method, url });
if (topicId) {
  const del = await api('DELETE', `/api/topics/${encodeURIComponent(topicId)}`);
  check(del.status < 300, 'scratch topic deleted', String(del.status));
  const list = await api('GET', '/api/topics?limit=200&my=1');
  check(!list.text.includes(`clipboard ${RUN}`), 'no scratch topic of this run remains', String(list.status));
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall clipboard checks passed');
process.exit(failed ? 1 : 0);
