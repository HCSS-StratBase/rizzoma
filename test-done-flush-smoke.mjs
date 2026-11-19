#!/usr/bin/env node
/**
 * Done right after typing must not lose the text (real keys, real clicks, what the person SEES after a reload).
 *
 * Why it exists (18 Nov 2026, suite case A10): in a fresh child blip, typing "quickchild" and pressing Done at once left an
 * EMPTY child. The 300 ms save debounce was still pending when the parent's Done unmounted the child editor, and the pending
 * text was dropped. After reload the child showed no text at all.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-done-flush-smoke.mjs   (HEADED=1 on a virtual display)
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
  email = `doneflush-${RUN}@example.com`; password = 'DoneFlush!1';
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
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite done-flush ${RUN}`, { delay: 15 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4000);

// level 1 blip "Z1", then a child typed and closed with Done with no pause at all
await page.locator('.write-reply-input').first().click(); await k.type('Z1', { delay: 60 }); await k.press('Enter'); await sleep(2500);
await page.locator('.blip-collapsed-row', { hasText: 'Z1' }).first().click(); await sleep(1500);
await page.locator('.blip-container.nested-blip li', { hasText: /^Z1/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
await k.press('End'); await k.press('Control+Enter'); await sleep(2300);
await k.type('quickchild', { delay: 20 });
await page.locator('button:has-text("Done")').last().click(); // no pause
await sleep(300);
for (let i = 0; i < 6 && (await page.locator('button:has-text("Done")').count()); i += 1) { await page.locator('button:has-text("Done")').last().click(); await sleep(600); }
await sleep(3000);
await shot('after-done');
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
// what a person sees: open Z1 and its child and read the child
const row = page.locator('.blip-collapsed-row', { hasText: 'Z1' }).first();
if (await row.count()) { await row.click(); await sleep(1500); }
const marker = page.locator('.blip-thread-marker').first();
check(await marker.count() > 0, 'Z1 shows the [+] marker of its child after reload');
if (await marker.count()) { await marker.click(); await sleep(2000); }
await shot('after-reload-opened');
const visible = await page.locator('.rizzoma-topic-detail').first().innerText();
check(visible.includes('quickchild'), 'after reload the text typed right before Done is visible in the child', visible.replace(/\s+/g, ' ').slice(0, 160));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall done-flush checks passed');
process.exit(failed ? 1 : 0);
