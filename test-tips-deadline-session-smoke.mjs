#!/usr/bin/env node
/**
 * Regression smoke: (1) Play video in the tips box opens the First steps window, (2) choosing an assignee for a ~ task opens an in-page
 * Deadline dialog with a date field and the stored task carries the date, (3) after the session cookie is gone the next action tells the
 * person the session expired and shows the sign-in form. Real clicks and typing, headless Chromium.
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-tips-deadline-session-smoke.mjs   (SHOTS=<dir> keeps screenshots)
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const SHOTS = process.env.SHOTS || '';
const RUN = Date.now().toString(36);
const email = `tds-${RUN}@example.com`; const password = 'TipsDeadline!1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
await seedVerifiedE2EAccount(email, password);
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage(); page.setDefaultTimeout(15000);
const k = page.keyboard;
const shot = async (n) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(email, { delay: 10 });
await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(password, { delay: 10 });
await page.locator('.submit-btn').click(); await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }); await sleep(2500);
// 1. Play video
await page.getByRole('button', { name: 'Play video' }).first().click(); await sleep(1200);
await shot('1-play-video');
check(await page.getByRole('dialog').getByText('First steps').first().isVisible().catch(() => false), 'Play video opens the First steps window');
await k.press('Escape'); await sleep(500);
// 2. Deadline
await page.locator('.create-wave').first().click(); await sleep(900);
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite deadline ${RUN}`, { delay: 10 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
await page.locator('.write-reply-input').first().click(); await k.type('call Remy', { delay: 20 }); await k.press('Enter'); await sleep(2200);
await page.locator('.blip-collapsed-row', { hasText: 'call Remy' }).first().click(); await sleep(1300);
await page.locator('.blip-container.nested-blip li', { hasText: /^call Remy/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1400);
await k.press('End'); await page.locator('button[title="Insert task (~)"]').first().click(); await sleep(1500);
await k.press('Enter'); await sleep(900);
await shot('2-deadline-dialog');
check(await page.locator('[data-testid="task-deadline-dialog"]').isVisible().catch(() => false), 'choosing the assignee opens the Deadline dialog');
await page.locator('[data-testid="task-deadline-input"]').fill('2026-12-01');
await page.locator('[data-testid="task-deadline-set"]').click(); await sleep(1000);
await k.type(' by phone', { delay: 20 });
await page.getByRole('button', { name: 'Done' }).first().click().catch(() => undefined); await sleep(2800);
await shot('3-task-with-deadline');
const stored = await page.evaluate(async (id) => { const r = await fetch(`/api/blips?waveId=${id}&limit=1000`, { credentials: 'include' }); return JSON.stringify(await r.json()); }, topicId);
check(/data-due-date=\\?"2026-12-01/.test(stored), 'the stored task carries the deadline', stored.slice(0, 120));
// 3. Session expiry
await context.clearCookies(); await sleep(400);
await page.locator('.write-reply-input').first().click().catch(() => undefined);
await k.type('after expiry', { delay: 20 }); await k.press('Enter'); await page.locator('[data-testid="toast"]').waitFor({ timeout: 6000 }).catch(() => undefined); await sleep(300);
const toastText = (await page.locator('[data-testid="toast"]').allInnerTexts().catch(() => [])).join(' ');
await shot('4-session-expired');
check(/session has expired/i.test(toastText), 'after the cookie is gone the person is told the session expired', toastText.slice(0, 100));
await sleep(3500);
check(await page.getByPlaceholder('Email address').count() > 0, 'then the sign-in form is shown');
await browser.close();
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
