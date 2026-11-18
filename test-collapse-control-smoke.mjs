#!/usr/bin/env node
/**
 * The [-] control of an expanded blip must be reachable: a real click (desktop 1366 x 900) and a real tap (phone 390 x 844)
 * collapse it back to its row.
 *
 * Why it exists (19 Nov 2026): the control was positioned at left: -20px, outside the scrolling topic panel that clips its x
 * overflow, so another element received the pointer (Playwright: "<div class=rizzoma-topic-detail> intercepts pointer events")
 * and a person could not collapse an expanded blip with it.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-collapse-control-smoke.mjs   (HEADED=1 on a virtual display)
 */
import { chromium } from 'playwright';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const HEADED = process.env.HEADED === '1';
const RUN = Date.now().toString(36);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
let email = process.env.RIZZOMA_E2E_USER; let password = process.env.RIZZOMA_E2E_PASSWORD;
if (!email) {
  const { seedVerifiedE2EAccount } = await import('./scripts/lib/e2e-sharing-fixtures.mjs');
  email = `collapse-${RUN}@example.com`; password = 'CollapseCtl!1';
  await seedVerifiedE2EAccount(email, password);
}
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });

for (const [label, opts, touch] of [
  ['desktop 1366x900 click', { viewport: { width: 1366, height: 900 } }, false],
  ['phone 390x844 tap', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, true],
]) {
  console.log(`\n===== ${label} =====`);
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  const hit = (loc, o) => (touch ? loc.tap(o) : loc.click(o));
  let topicId;
  try {
    await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
    await hit(page.getByPlaceholder('Email address')); await page.keyboard.press('Control+a'); await page.keyboard.type(email, { delay: 10 });
    await hit(page.getByPlaceholder('Password', { exact: true })); await page.keyboard.press('Control+a'); await page.keyboard.type(password, { delay: 10 });
    await hit(page.locator('.submit-btn'));
    await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }); await sleep(2500);
    await hit(touch ? page.locator('[data-testid="mobile-new-topic"]').first() : page.locator('.create-wave').first()); await sleep(900);
    await hit(page.getByPlaceholder('What would you like to discuss?')); await page.keyboard.type(`ZZ SCRATCH suite collapse ${RUN}`, { delay: 15 });
    await hit(page.getByRole('button', { name: 'Create Topic' })); await sleep(4000);
    topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
    await hit(page.locator('.write-reply-input').first()); await page.keyboard.type('collapse me', { delay: 15 }); await page.keyboard.press('Enter'); await sleep(2500);
    const row = page.locator('.blip-collapsed-row', { hasText: 'collapse me' }).first();
    await hit(row); await sleep(1500);
    check((await page.locator('.nested-blip.expanded').count()) === 1, `${label}: the blip is expanded`);
    const exp = page.locator('[data-testid="blip-expander"]').last();
    const cover = await exp.evaluate((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { onScreen: r.left >= 0 && r.right <= innerWidth && r.top >= 0, ownsPoint: t === e || e.contains(t), top: t ? String(t.className).slice(0, 30) : null }; });
    check(cover.onScreen && cover.ownsPoint, `${label}: the [-] control is on screen and receives the pointer`, JSON.stringify(cover));
    await hit(exp, { timeout: 8000 }).catch((e) => check(false, `${label}: the [-] control can be ${touch ? 'tapped' : 'clicked'}`, String(e).split('\n')[0].slice(0, 160)));
    await sleep(1300);
    check((await page.locator('.blip-collapsed-row', { hasText: 'collapse me' }).count()) === 1 && (await page.locator('.nested-blip.expanded').count()) === 0, `${label}: it collapses back to its row`);
  } catch (e) { check(false, `${label}: flow completed`, String(e).slice(0, 180)); }
  if (topicId) {
    const del = await page.evaluate(async (id) => { const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : ''; return (await fetch(`/api/topics/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'x-csrf-token': csrf } })).status; }, topicId).catch(() => 0);
    check(del > 0 && del < 300, `${label}: scratch topic deleted`, String(del));
  }
  await ctx.close();
}
await browser.close();
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
