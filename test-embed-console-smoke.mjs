#!/usr/bin/env node
/**
 * An embedded frame (iFrame gadget) must read back without console errors (real clicks, real keys, reload, read view).
 *
 * Why it exists (19 Nov 2026, suite cases X08 to X10): every stored embed rendered through InlineHtmlRenderer passed the boolean
 * attribute allowfullscreen to React as the string "true", so React logged "Received the string `true` for the boolean attribute
 * `allowFullScreen`" on every render of every YouTube, Sheet and iFrame gadget.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-embed-console-smoke.mjs   (HEADED=1 on a virtual display)
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
  email = `embed-${RUN}@example.com`; password = 'EmbedAttrs!1';
  await seedVerifiedE2EAccount(email, password);
}
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const k = page.keyboard;
const reactWarnings = [];
page.on('console', (m) => { if (m.type() === 'error' && /allowFullScreen|boolean attribute|Invalid DOM property/i.test(m.text())) reactWarnings.push(m.text().slice(0, 140)); });
async function shot(name) { if (!SHOTS) return; const fs = await import('node:fs'); fs.mkdirSync(SHOTS, { recursive: true }); shotNo += 1; await page.screenshot({ path: `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name}.png` }); }

await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(email, { delay: 10 });
await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(password, { delay: 10 });
await page.locator('.submit-btn').click();
await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
await sleep(2500);
await page.locator('.create-wave').first().click(); await sleep(900);
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite embed-attrs ${RUN}`, { delay: 15 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4000);
const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];

await page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 }); await sleep(1500);
await page.locator('.topic-content-edit .ProseMirror').first().click(); await k.press('End');
await page.locator('[data-testid="right-tools-insert-gadget"]').first().click(); await sleep(500);
await page.locator('.gadget-tile', { hasText: 'iFrame' }).first().click(); await sleep(500);
await page.locator('.gadget-url-field').fill('https://example.com/');
await page.locator('.gadget-url-ok').click(); await sleep(5000);
for (let i = 0; i < 4 && (await page.locator('button:has-text("Done")').count()); i += 1) { await page.locator('button:has-text("Done")').last().click(); await sleep(800); }
await sleep(2500);
reactWarnings.length = 0;
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(8000);
await shot('read-view-embed');
check(await page.locator('.topic-content-view iframe').count() === 1, 'the stored embed shows as a frame in the read view');
check(reactWarnings.length === 0, 'reading the embed back raises no React boolean-attribute error', reactWarnings.slice(0, 1).join(' | '));

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
  check(!list.text.includes(`embed-attrs ${RUN}`), 'no scratch topic of this run remains', String(list.status));
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall embed checks passed');
process.exit(failed ? 1 : 0);
