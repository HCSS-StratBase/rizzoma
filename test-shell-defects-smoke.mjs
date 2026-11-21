#!/usr/bin/env node
/**
 * Regression smoke for four shell defects found by the legacy-screenshot parity rows (all judged from screenshots):
 *  1. Help in the left rail opened nothing (parity row 290)           -> it opens a Help dialog with the shortcuts; Escape closes it.
 *  2. The Mentions tab showed no unread count (rows 202, 270)          -> a person mentioned in a blip sees a count on the tab; reading clears it.
 *  3. Escape did not close the blip gear menu (row 062)                -> Escape closes it.
 *  4. On a phone (390 px) the mind map could not be opened (row 304)   -> Text view / Mind map buttons are reachable and the mind map opens.
 * Real clicks and typing by fixture users, headless Chromium.
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-shell-defects-smoke.mjs   (SHOTS=<dir> keeps screenshots)
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const SHOTS = process.env.SHOTS || '';
const RUN = Date.now().toString(36);
const PASS = 'ShellDef!1';
const A = `shell-a-${RUN}@example.com`; const B = `shell-b-${RUN}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
await seedVerifiedE2EAccount(A, PASS); await seedVerifiedE2EAccount(B, PASS);
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
async function person(email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ...opts });
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
  await page.getByPlaceholder('Email address').click(); await page.keyboard.press('Control+a'); await page.keyboard.type(email, { delay: 10 });
  await page.getByPlaceholder('Password', { exact: true }).click(); await page.keyboard.press('Control+a'); await page.keyboard.type(PASS, { delay: 10 });
  await page.locator('.submit-btn').click(); await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }).catch(() => undefined); await sleep(2500);
  const shot = async (n) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
  return { ctx, page, shot };
}
const a = await person(A); const b = await person(B);
const pa = a.page; const k = pa.keyboard;
// ---- 1 Help
await pa.getByText('Help', { exact: true }).first().click(); await sleep(800);
await a.shot('1-help-open');
check(await pa.locator('[data-testid="help-overlay"]').isVisible().catch(() => false), 'Help opens a dialog');
check(/Ctrl\+Enter/.test(await pa.locator('[data-testid="help-overlay"]').innerText().catch(() => '')), 'the Help dialog lists the keyboard shortcuts');
await k.press('Escape'); await sleep(500);
check(await pa.locator('[data-testid="help-overlay"]').count() === 0, 'Escape closes the Help dialog');
// ---- topic with a blip for 2 and 3
await pa.locator('.create-wave').first().click(); await sleep(900);
await pa.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite shell defects ${RUN}`, { delay: 10 });
await pa.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
const topicId = (/#\/topic\/([^/?]+)/.exec(await pa.evaluate(() => location.hash)) || [])[1];
await seedAcceptedParticipant(topicId, B, 'editor', 'e2e');
await pa.locator('.write-reply-input').first().click(); await k.type('ping', { delay: 20 }); await k.press('Enter'); await sleep(2200);
await pa.locator('.blip-collapsed-row', { hasText: 'ping' }).first().click(); await sleep(1300);
await pa.locator('.blip-container.nested-blip li', { hasText: /^ping/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1400);
await k.press('End'); await k.type(' @', { delay: 40 }); await sleep(1500); await k.type(B.split('@')[0].slice(0, 8), { delay: 40 }); await sleep(1500); await k.press('Enter'); await sleep(800);
for (let i = 0; i < 4 && (await pa.locator('button:has-text("Done")').count()); i += 1) { await pa.locator('button:has-text("Done")').last().click(); await sleep(1200); }
await sleep(2500);
// ---- 3 gear menu closes on Escape
await pa.locator('.blip-container.nested-blip li', { hasText: /^ping/ }).first().click({ position: { x: 12, y: 8 } }).catch(() => undefined); await sleep(1000);
for (let i = 0; i < 4 && (await pa.locator('button:has-text("Done")').count()); i += 1) { await pa.locator('button:has-text("Done")').last().click(); await sleep(900); }
const tog = pa.locator('[data-testid="blip-menu-gear-toggle"], [data-testid="blip-menu-overflow-toggle"]').last();
await tog.click(); await sleep(600);
const menu = pa.locator('[data-testid="blip-menu-overflow-menu"]');
check(await menu.count() > 0, 'the gear menu opens');
await a.shot('3-gear-open');
await k.press('Escape'); await sleep(600);
await a.shot('3-gear-after-escape');
check(await menu.count() === 0, 'Escape closes the gear menu');
// ---- 2 mentions badge for B
await b.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(5000);
const badge = b.page.locator('.unread-mentions-count');
await b.shot('2-mentions-badge');
check(await badge.count() > 0 && /^[1-9]/.test((await badge.first().innerText().catch(() => '')).trim()), 'the Mentions tab shows an unread count for the mentioned person', await badge.first().innerText().catch(() => 'none'));
// ---- 4 phone mind map
const p = await person(B, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
await p.page.goto(`${BASE}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(6000);
const mm = p.page.locator('.mindmap-view');
await p.shot('4-phone-topic');
check(await mm.count() > 0 && await mm.first().isVisible().catch(() => false), 'on a phone the Mind map button is visible');
await mm.first().tap().catch(() => undefined); await sleep(2500);
await p.shot('4-phone-mindmap');
check(await p.page.locator('.mindmap-view.active').count() > 0, 'tapping it opens the mind map');
// cleanup
const del = await pa.evaluate(async (id) => { const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : ''; return (await fetch(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' })).status; }, topicId);
check(del < 300, 'scratch topic deleted', String(del));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall shell checks passed');
process.exit(failed ? 1 : 0);
