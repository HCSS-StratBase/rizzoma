#!/usr/bin/env node
/**
 * Phone layout smoke (390 x 844, 360 x 740, 430 x 932 with REAL touch taps) and the desktop guard.
 *
 * Why it exists (19 Nov 2026): at phone width the topics list had NO way to create a topic and none of Mentions / Tasks /
 * Publics / Store / Teams was reachable: "+ New" and the tabs live in the navigation column that is hidden under 768 px,
 * and the mobile header with a "+" existed only in the topic content view. This test walks the whole phone flow:
 * header "+" -> new topic -> open -> nested blips (levels 1 to 3) -> expand -> author and date -> blip menu (bottom sheet)
 * -> section switcher (Topics, Mentions, Tasks, Publics, Store, Teams) -> back, and asserts the header controls do NOT
 * exist at desktop width (the desktop navigation column keeps "+ New").
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-phone-layout-smoke.mjs        (seeds its own account)
 *   RIZZOMA_E2E_USER / RIZZOMA_E2E_PASSWORD: sign in with an existing account instead (live host); the sign-in form is never
 *     screenshotted. PHONE_SHOTS=<dir> saves a screenshot of every step. HEADED=1 runs a visible browser (use a private
 *     virtual display, e.g. xvfb-run). The scratch topic is deleted at the end.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const HEADED = process.env.HEADED === '1';
const SHOTS = process.env.PHONE_SHOTS || '';
const RUN = process.env.PHONE_RUN_ID || Date.now().toString(36);
const SIZES = process.env.PHONE_SIZES === 'none' ? [] : [[390, 844], [360, 740], [430, 932]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };

let email = process.env.RIZZOMA_E2E_USER;
let password = process.env.RIZZOMA_E2E_PASSWORD;
if (!email) {
  const { seedVerifiedE2EAccount } = await import('./scripts/lib/e2e-sharing-fixtures.mjs');
  email = `phone-${RUN}@example.com`; password = 'PhoneLayout!1';
  await seedVerifiedE2EAccount(email, password);
}

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });
const typeDelay = HEADED ? 80 : 15;

async function signIn(page, touch = true) {
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await sleep(3500);
  const em = page.getByPlaceholder('Email address');
  await hit(em); await page.keyboard.press('Control+a'); await page.keyboard.type(email, { delay: 12 });
  const pw = page.getByPlaceholder('Password', { exact: true });
  await hit(pw); await page.keyboard.press('Control+a'); await page.keyboard.type(password, { delay: 12 });
  await hit(page.locator('.submit-btn'));
  await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
}
const api = (page, method, url) => page.evaluate(async ({ method, url }) => {
  const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  const r = await fetch(url, { method, credentials: 'include', headers: { 'x-csrf-token': csrf } });
  let j = null; try { j = await r.json(); } catch { /* none */ }
  return { status: r.status, json: j };
}, { method, url });
const plain = (h) => String(h || '').replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '').replace(/<[^>]+>/g, '').trim();

for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`;
  console.log(`\n===== phone ${tag} =====`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(path.join(SHOTS, tag), { recursive: true }); await page.screenshot({ path: path.join(SHOTS, tag, `${name}.png`) }); } };
  try {
    await signIn(page); await sleep(2500);
    await shot('01-list-view-header');
    check((await page.locator('[data-testid="mobile-new-topic"]').count()) === 1 && await page.locator('[data-testid="mobile-new-topic"]').isVisible(), `${tag}: exactly one visible header "+" in the list view`);
    check((await page.locator('[data-testid="mobile-tabs"]').count()) === 1 && await page.locator('[data-testid="mobile-tabs"]').isVisible(), `${tag}: exactly one visible section tab row`);
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2);
    check(noScroll, `${tag}: no horizontal page scroll`);

    await page.locator('[data-testid="mobile-new-topic"]').tap(); await sleep(1200);
    await shot('02-new-topic-dialog');
    const title = `ZZ SCRATCH suite phone ${RUN} ${tag}`;
    const box = page.getByPlaceholder('What would you like to discuss?');
    check(await box.isVisible(), `${tag}: the new-topic dialog is on screen`);
    await box.tap(); await page.keyboard.type(title, { delay: typeDelay });
    await shot('03-title-typed');
    await page.getByRole('button', { name: 'Create Topic' }).tap(); await sleep(4000);
    const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
    check(!!topicId, `${tag}: Create Topic opens the new topic`, String(topicId));
    await shot('04-topic-open');

    await page.locator('.write-reply-input').first().tap(); await page.keyboard.type('L1', { delay: typeDelay }); await page.keyboard.press('Enter'); await sleep(2500);
    await shot('05-level-1-typed');
    await page.locator('.blip-collapsed-row', { hasText: 'L1' }).first().tap(); await sleep(1500);
    await page.locator('.blip-container.nested-blip li', { hasText: /^L1/ }).first().tap({ position: { x: 12, y: 8 } }); await sleep(1500);
    for (const t of ['L2', 'L3']) { await page.keyboard.press('End'); await page.keyboard.press('Control+Enter'); await sleep(2400); await page.keyboard.type(t, { delay: typeDelay }); await sleep(1300); }
    await shot('06-levels-2-and-3-typed');
    for (let i = 0; i < 4; i += 1) { if (!(await page.locator('button:has-text("Done")').count())) break; await page.locator('button:has-text("Done")').last().tap(); await sleep(1500); }
    await sleep(2000);
    await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(5500);
    await shot('07-after-reload');
    const list = ((await api(page, 'GET', `/api/blips?waveId=${topicId}&limit=100`)).json?.blips || []).filter((b) => !b.deleted).map((b) => ({ ...b, id: b.id || b._id }));
    const by = (t) => list.find((b) => plain(b.content) === t);
    check(!!by('L1') && !!by('L2') && !!by('L3') && by('L2')?.parentId === by('L1')?.id && by('L3')?.parentId === by('L2')?.id, `${tag}: levels 1 to 3 stored under the right parents after reload`, list.map((b) => plain(b.content)).join(','));

    await page.locator('.blip-collapsed-row', { hasText: 'L1' }).first().tap(); await sleep(1500);
    await shot('08-level-1-expanded');
    const meta = await page.evaluate(() => Array.from(document.querySelectorAll('.nested-blip.expanded .blip-contributors-info .blip-author-date')).map((e) => ({ t: e.textContent?.trim(), vis: e.getBoundingClientRect().width > 0 })));
    check(meta.length > 0 && meta.every((m) => m.vis && /\d/.test(m.t || '')), `${tag}: author date visible on the expanded blip`, JSON.stringify(meta));
    const trig = page.locator('[data-testid="blip-menu-mobile-trigger"]').first();
    if (await trig.count()) { await trig.tap(); await sleep(1200); await shot('09-blip-menu-bottom-sheet'); check(await page.locator('[class*="bottom-sheet" i], [class*="BottomSheet"], [role="dialog"]').first().isVisible().catch(() => false), `${tag}: the blip menu opens as a bottom sheet`); await page.keyboard.press('Escape'); await sleep(600); }
    else check(false, `${tag}: the blip menu trigger exists at phone width`);

    await page.locator('.mobile-header .back-btn').tap(); await sleep(1500);
    await shot('10-back-to-list');
    check(await page.locator('[data-testid="mobile-tabs"]').isVisible(), `${tag}: Back returns to the list with the section tabs`);
    for (const [val, label] of [['mentions', 'Mentions'], ['tasks', 'Tasks'], ['publics', 'Publics'], ['store', 'Store'], ['teams', 'Teams'], ['topics', 'Topics']]) {
      await page.locator(`[data-testid="mobile-tab-${val}"]`).tap(); await sleep(1500);
      await shot(`11-section-${val}`);
      const txt = await page.locator('.tabs-container').first().innerText().catch(() => '');
      check(txt.length > 3 && (await page.locator(`[data-testid="mobile-tab-${val}"]`).getAttribute('aria-selected')) === 'true', `${tag}: section ${label} opens`, txt.replace(/\s+/g, ' ').slice(0, 50));
    }
    check(errors.length === 0, `${tag}: no uncaught page errors`, errors.join(' || '));
    if (topicId) { const del = await api(page, 'DELETE', `/api/topics/${encodeURIComponent(topicId)}`); check(del.status < 300, `${tag}: scratch topic deleted`, String(del.status)); }
  } catch (e) { check(false, `${tag}: flow completed`, String(e).slice(0, 200)); await shot('ZZ-failure').catch(() => undefined); }
  await ctx.close();
}

console.log('\n===== desktop guard 1366 x 900 and 1600 x 900 =====');
for (const [w, h] of [[1366, 900], [1600, 900]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  try {
    await signIn(page, false);
    await sleep(3000);
    if (SHOTS) { fs.mkdirSync(path.join(SHOTS, `desktop-${w}`), { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `desktop-${w}`, 'topics-view.png') }); }
    check((await page.locator('[data-testid="mobile-new-topic"]').count()) === 0, `${w}: no mobile header "+" at desktop width`);
    check((await page.locator('[data-testid="mobile-tabs"]').count()) === 0, `${w}: no mobile section tabs at desktop width`);
    check(await page.locator('.create-wave').first().isVisible(), `${w}: the desktop "+ New" button is visible`);
    check(await page.locator('.navigation-container').first().isVisible(), `${w}: the navigation column is visible`);
  } catch (e) { check(false, `${w}: desktop guard ran`, String(e).slice(0, 160)); }
  await ctx.close();
}
await browser.close();
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
