#!/usr/bin/env node
/**
 * Regression smoke for three features of the original that the modernized app lacked (SDS ruling 21 Nov 2026):
 *  1. "Export multiple topics" in the gear menu: a list of the person's topics with checkboxes and select all, "Export selected topics" gives
 *     a ZIP with one HTML file per topic that contains the topic text (original export/template.coffee, wave/settings_menu.coffee).
 *  2. A click on a person's avatar opens a user card with name and e-mail (original popup/user_popup).
 *  3. The "Check it later" introduction for new users: four tips, Prev tip / Next tip, progress dots, close (original introduce/template.coffee).
 * Real clicks and typing, headless Chromium.  RIZZOMA_BASE_URL=... COUCHDB_URL=... node test-original-features-smoke.mjs  (SHOTS=<dir>)
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const SHOTS = process.env.SHOTS || '';
const RUN = Date.now().toString(36);
const email = `feat-${RUN}@example.com`; const password = 'OrigFeatures!1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
await seedVerifiedE2EAccount(email, password);
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
const page = await context.newPage(); page.setDefaultTimeout(15000);
const k = page.keyboard;
const shot = async (n) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(email, { delay: 10 });
await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(password, { delay: 10 });
await page.locator('.submit-btn').click(); await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }); await sleep(2500);

async function newTopic(title, body) {
  await page.locator('.create-wave').first().click(); await sleep(900);
  await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(title, { delay: 10 });
  await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
  await page.locator('.write-reply-input').first().click(); await k.type(body, { delay: 15 }); await k.press('Enter'); await sleep(2500);
}
await newTopic(`ZZ SCRATCH feat one ${RUN}`, `alpha-${RUN}`);
await newTopic(`ZZ SCRATCH feat two ${RUN}`, `beta-${RUN}`);

// 2. user card
await page.locator('[data-testid="user-avatar"]').first().click(); await sleep(600);
await shot('2-user-card');
const cardText = await page.locator('[data-testid="user-card"]').innerText().catch(() => '');
check(cardText.includes(email), 'a click on an avatar opens the user card with the e-mail address', cardText.replace(/\s+/g, ' ').slice(0, 80));
await k.press('Escape'); await sleep(300);
check(await page.locator('[data-testid="user-card"]').count() === 0, 'Escape closes the user card');

// 1. export multiple
await page.locator('.gear-btn').first().click(); await sleep(700);
await page.locator('[data-testid="gear-export-multiple"]').click(); await sleep(1800);
await shot('1-export-multiple-dialog');
const listed = await page.locator('[data-testid="export-multiple"] .ep-topic').allInnerTexts();
check(listed.some((t) => t.includes(`feat one ${RUN}`)) && listed.some((t) => t.includes(`feat two ${RUN}`)), 'the dialog lists the topics', listed.slice(0, 3).join(' | '));
await page.locator('[data-testid="export-start"]').isDisabled().then((d) => check(d, 'Export is disabled until a topic is ticked'));
await page.locator('[data-testid="export-select-all"]').check(); await sleep(300);
const download = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
await page.locator('[data-testid="export-start"]').click();
const d = await download;
check(!!d, 'Export selected topics downloads a ZIP');
if (d) {
  const file = await d.path(); const bytes = fs.readFileSync(file); const text = bytes.toString('latin1');
  check(bytes[0] === 0x50 && bytes[1] === 0x4b, `the file ${d.suggestedFilename()} is a ZIP`, `${bytes.length} bytes`);
  check(text.includes(`alpha-${RUN}`) && text.includes(`beta-${RUN}`), 'it holds the text of both topics (one HTML file each)');
  check((text.match(/\.html/g) || []).length >= 4, 'with one named HTML entry per topic (local + central directory)');
}
await sleep(800); await shot('1-export-multiple-done');
check(await page.locator('[data-testid="export-done"]').isVisible().catch(() => false), 'the dialog then lists the recently exported archive');
await page.keyboard.press('Escape'); await page.locator('.export-modal-close').click().catch(() => undefined);

// 3. introduction for new users
await page.evaluate(() => sessionStorage.setItem('rizzoma:showIntro', '1')); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000);
await shot('3-intro-1');
check(await page.locator('[data-testid="intro-overlay"]').isVisible().catch(() => false), 'a new account gets the introduction overlay');
check(await page.locator('[data-testid="intro-prev"]').isDisabled(), 'Prev tip is disabled on the first tip');
await page.locator('[data-testid="intro-next"]').click(); await sleep(300); await page.locator('[data-testid="intro-next"]').click(); await sleep(300);
await shot('3-intro-3');
const tip = await page.locator('.introduce-slide').innerText();
check(/Invite people/.test(tip), 'Next tip walks to the third tip', tip.replace(/\s+/g, ' ').slice(0, 50));
await page.locator('[data-testid="intro-close"]').click(); await sleep(500);
check(await page.locator('[data-testid="intro-overlay"]').count() === 0, 'Check it later closes it');
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3000);
check(await page.locator('[data-testid="intro-overlay"]').count() === 0, 'and it does not come back');
await browser.close();
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
