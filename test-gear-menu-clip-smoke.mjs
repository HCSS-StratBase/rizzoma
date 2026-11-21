#!/usr/bin/env node
/**
 * Regression smoke (parity row 061): a blip's gear menu in a short topic was clipped by the scrolling topic body, so its last items
 * (Delete) were cut off. The whole menu must be visible: every menu item lies inside the topic body's visible rectangle.
 * Real clicks and typing, headless Chromium.   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-gear-menu-clip-smoke.mjs
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const SHOTS = process.env.SHOTS || '';
const RUN = Date.now().toString(36);
const email = `gear-${RUN}@example.com`; const password = 'GearMenu!1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
await seedVerifiedE2EAccount(email, password);
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage(); page.setDefaultTimeout(15000);
const k = page.keyboard;
await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(email, { delay: 10 });
await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(password, { delay: 10 });
await page.locator('.submit-btn').click(); await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }); await sleep(2500);
await page.locator('.create-wave').first().click(); await sleep(900);
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite gear menu ${RUN}`, { delay: 10 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
await page.locator('.write-reply-input').first().click(); await k.type('Sandbox blip', { delay: 20 }); await k.press('Enter'); await sleep(2200);
await page.locator('.blip-collapsed-row', { hasText: 'Sandbox' }).first().click(); await sleep(1300);
await page.locator('.blip-container.nested-blip li', { hasText: /^Sandbox/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1400);
for (let i = 0; i < 4 && (await page.locator('button:has-text("Done")').count()); i += 1) { await page.locator('button:has-text("Done")').last().click(); await sleep(1000); }
await page.locator('[data-testid="blip-menu-gear-toggle"], [data-testid="blip-menu-overflow-toggle"]').last().click(); await sleep(800);
if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/gear-open.png` }); }
const m = await page.evaluate(() => {
  const menu = document.querySelector('[data-testid="blip-menu-overflow-menu"]'); if (!menu) return null;
  const items = [...menu.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
  const last = items[items.length - 1]; const lr = last.getBoundingClientRect();
  let clip = null; let p = menu.parentElement;
  while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(hidden|auto|scroll)/.test(cs.overflowY)) { const r = p.getBoundingClientRect(); clip = { bottom: Math.round(r.bottom), cls: p.className.toString().slice(0, 30) }; break; } p = p.parentElement; }
  return { count: items.length, lastText: last.innerText.trim(), lastBottom: Math.round(lr.bottom), clip };
});
check(!!m && m.count >= 5, 'the gear menu opens with its items', JSON.stringify(m));
check(!!m && (!m.clip || m.lastBottom <= m.clip.bottom + 1), 'the last item of the menu is not clipped by the topic body', JSON.stringify(m));
const del = await page.evaluate(async (id) => { const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : ''; return (await fetch(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' })).status; }, topicId);
check(del < 300, 'scratch topic deleted', String(del));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall gear-menu checks passed');
process.exit(failed ? 1 : 0);
