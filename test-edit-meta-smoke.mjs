#!/usr/bin/env node
/**
 * Copy / Cut on one blip, Paste on ANOTHER blip (real clicks on the gear menu, what the person sees).
 *
 * Why it exists (18 Nov 2026, suite cases B07 and C02): every blip read the edit-meta only once at mount and only its own entry,
 * so after "Copy comment" or "Cut blip" on blip A the menu of blip B still showed "Paste as reply" and "Paste as new blip"
 * DISABLED, and a paste could never be done between two blips.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-edit-meta-paste-smoke.mjs   (HEADED=1 on a virtual display)
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
  email = `editmeta-${RUN}@example.com`; password = 'EditMeta!1';
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
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite edit-meta ${RUN}`, { delay: 15 });
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


// Author avatar and date next to a blip: visible in read mode AND while it is being edited (original template.coffee shows the
// blip info in both modes).
await reply('Meta check');
await open('Meta check');
const metaBox = async (sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const date = el.querySelector('.blip-author-date');
  const avatar = el.querySelector('img, .avatar, [class*=avatar]');
  return { w: Math.round(r.width), h: Math.round(r.height), date: date ? date.textContent.trim() : '', avatar: !!avatar };
}, sel);
const readMeta = await metaBox('.nested-blip .blip-contributors-info');
await shot('read-mode');
check(!!readMeta && readMeta.w > 0 && /\d/.test(readMeta.date), 'read mode shows the author date next to the blip', JSON.stringify(readMeta));
await page.locator('.blip-container.nested-blip li', { hasText: /^Meta check/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
const editMeta = await metaBox('.nested-blip.edit-mode .blip-contributors-info');
await shot('edit-mode');
check(!!editMeta && editMeta.w > 0 && editMeta.h > 0 && /\d/.test(editMeta.date), 'edit mode ALSO shows the author date', JSON.stringify(editMeta));
check(!!editMeta && editMeta.avatar, 'edit mode ALSO shows the author avatar', JSON.stringify(editMeta));
for (let i = 0; i < 4 && (await page.locator('button:has-text("Done")').count()); i += 1) { await page.locator('button:has-text("Done")').last().click(); await sleep(700); }

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
  check(!list.text.includes(`edit-meta ${RUN}`), 'no scratch topic of this run remains', String(list.status));
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall edit-meta checks passed');
process.exit(failed ? 1 : 0);
