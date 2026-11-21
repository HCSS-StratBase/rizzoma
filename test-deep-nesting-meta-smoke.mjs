#!/usr/bin/env node
/**
 * Regression smoke: in a deeply nested topic every expanded level stays INSIDE its parent box and its author avatar and time stay inside the
 * topic pane (before the fix each level was 43 px wider than its parent, so from level 3 down the avatar and time were clipped away).
 * Real clicks and typing by a fixture user, headless Chromium.
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-deep-nesting-meta-smoke.mjs
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const RUN = Date.now().toString(36);
const email = `deep-${RUN}@example.com`; const password = 'DeepNest!1';
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
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite deep nesting ${RUN}`, { delay: 10 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
await page.locator('.write-reply-input').first().click(); await k.type('L1', { delay: 20 }); await k.press('Enter'); await sleep(2200);
await page.locator('.blip-collapsed-row', { hasText: 'L1' }).first().click(); await sleep(1300);
await page.locator('.blip-container.nested-blip li', { hasText: /^L1/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1400);
for (const n of ['L2', 'L3', 'L4', 'L5', 'L6']) { await k.press('End'); await k.press('Control+Enter'); await sleep(2300); await k.type(n, { delay: 25 }); await sleep(1100); }
for (let i = 0; i < 8 && (await page.locator('button:has-text("Done")').count()); i += 1) { await page.locator('button:has-text("Done")').last().click(); await sleep(1300); }
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(5500);
await page.locator('.blip-collapsed-row', { hasText: 'L1' }).first().click(); await sleep(1300);
for (let i = 0; i < 5; i += 1) { await page.locator('.blip-thread-marker').filter({ visible: true }).last().click(); await sleep(1200); }
const m = await page.evaluate(() => {
  const pane = document.querySelector('.topic-blip-body, .rizzoma-topic-detail').getBoundingClientRect();
  const boxes = [...document.querySelectorAll('.inline-child-expanded')];
  return boxes.map((e) => {
    const r = e.getBoundingClientRect(); const p = e.parentElement.closest('.inline-child-expanded, .blip-container'); const pr = p ? p.getBoundingClientRect() : null;
    const metas = [...e.querySelectorAll(':scope > .blip-container .blip-contributors-info')]; const mr = metas[0] ? metas[0].getBoundingClientRect() : null;
    return { right: Math.round(r.right), parentRight: pr && Math.round(pr.right), paneRight: Math.round(pane.right), metaRight: mr && Math.round(mr.right), metaLeft: mr && Math.round(mr.left), boxLeft: Math.round(r.left) };
  });
});
check(m.length >= 5, `five nested levels are expanded (found ${m.length})`);
m.forEach((x, i) => {
  check(x.parentRight == null || x.right <= x.parentRight + 1, `level ${i + 2} stays inside its parent box`, JSON.stringify(x));
  check(x.metaRight != null && x.metaRight <= x.paneRight && x.metaLeft >= x.boxLeft, `level ${i + 2} author avatar and time are visible inside the pane and their own box`, JSON.stringify(x));
});
const del = await page.evaluate(async (id) => {
  const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  return (await fetch(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' })).status;
}, topicId);
check(del < 300, 'scratch topic deleted', String(del));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall deep-nesting checks passed');
process.exit(failed ? 1 : 0);
