#!/usr/bin/env node
/**
 * Acceptance verification for fix/single-active-editor on the DEV instance.
 *
 * Gates:
 *  G1  Topic loads; depth-10 fixture's first label shows a live [+] marker
 *  G2  Clicking [+] expands the child INLINE (blip container count grows)
 *  G3  Expansion works recursively (3 levels deep)
 *  G4  Single-active invariant: at most ONE .blip-menu visible after each action
 *  G5  Clicking a nested blip activates IT (menu belongs to clicked container)
 *  G6  Edit mode on nested blip: exactly one .blip-menu.edit-menu, on that blip
 *  G7  Previous editor closes when another blip is activated
 *
 * Screenshots to RZ_OUT for eyeball verification.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RZ_BASE || 'https://dev.138-201-62-161.nip.io';
const topicId = process.env.RZ_TOPIC || '0b997d49bf636cdd371819e13601e7ce';
const ownerEmail = process.env.RZ_EMAIL || 'try-owner+try-1783562412806@example.com';
const ownerPassword = process.env.RZ_PASS || 'Try!Owner-try-1783562412806';
const outDir = process.env.RZ_OUT || '/mnt/c/Rizzoma/screenshots/260709-single-active-verify';

const log = m => console.log(`[verify] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const gate = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await fs.mkdir(outDir, { recursive: true });
const shot = f => page.screenshot({ path: path.join(outDir, f), fullPage: false });

const menuCount = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('.blip-menu')).filter(el => el.offsetParent !== null).length);
const editMenuCount = () => page.evaluate(() =>
  Array.from(document.querySelectorAll('.blip-menu.edit-menu')).filter(el => el.offsetParent !== null).length);
const containerCount = () => page.evaluate(() => document.querySelectorAll('.blip-container').length);

// ---- login ----
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async ({ email, password }) => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  const login = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  return { ok: login.ok, status: login.status };
}, { email: ownerEmail, password: ownerPassword });
log(`login: ${JSON.stringify(r)}`);
if (!r.ok) { await shot('00-login-failed.png'); await browser.close(); process.exit(2); }

// ---- open topic ----
await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
await sleep(8000);
await shot('01-topic-loaded.png');

const c0 = await containerCount();
const markers0 = await page.evaluate(() => document.querySelectorAll('.blip-thread-marker').length);
gate('G1 topic loads with [+] markers', markers0 > 0, `containers=${c0} markers=${markers0}`);
gate('G4a at most one menu at load', (await menuCount()) <= 1, `menus=${await menuCount()}`);

// ---- expand 3 levels ----
let prev = c0;
for (let lvl = 1; lvl <= 3; lvl++) {
  const clicked = await page.evaluate(() => {
    // Click the DEEPEST still-collapsed [+] marker (not an already-open [−]).
    const m = Array.from(document.querySelectorAll('.blip-thread-marker'))
      .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === '+')
      .pop();
    if (!m) return false;
    m.click();
    return true;
  });
  await sleep(2500);
  const c = await containerCount();
  gate(`G${lvl === 1 ? 2 : 3} level-${lvl} [+] expands inline`, clicked && c > prev, `containers ${prev} → ${c}`);
  gate(`G4b menus after level-${lvl} expand`, (await menuCount()) <= 1, `menus=${await menuCount()}`);
  prev = c;
  await shot(`02-expanded-level-${lvl}.png`);
}

// ---- click deepest nested blip → activates it, single menu ----
const clickInfo = await page.evaluate(() => {
  const containers = Array.from(document.querySelectorAll('.blip-container.nested-blip'))
    .filter(el => el.offsetParent !== null);
  const target = containers[containers.length - 1];
  if (!target) return null;
  const content = target.querySelector('.blip-content');
  (content || target).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return { id: target.getAttribute('data-blip-id') };
});
await sleep(1500);
await shot('03-nested-clicked.png');
const menuOwner = await page.evaluate(() => {
  const menus = Array.from(document.querySelectorAll('.blip-menu')).filter(el => el.offsetParent !== null);
  return menus.map(m => m.closest('.blip-container')?.getAttribute('data-blip-id'));
});
gate('G5 click activates nested blip, single menu', clickInfo && menuOwner.length === 1 && menuOwner[0] === clickInfo.id,
  `clicked=${clickInfo?.id} menus on=${JSON.stringify(menuOwner)}`);

// ---- enter edit on that blip ----
const editClicked = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('.blip-menu button'))
    .filter(el => el.offsetParent !== null)
    .find(b => /edit/i.test(b.textContent || '') || /edit/i.test(b.getAttribute('title') || ''));
  if (!btn) return false;
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
});
await sleep(2000);
await shot('04-nested-edit-mode.png');
const em = await editMenuCount();
const emOwner = await page.evaluate(() => {
  const menus = Array.from(document.querySelectorAll('.blip-menu.edit-menu')).filter(el => el.offsetParent !== null);
  return menus.map(m => m.closest('.blip-container')?.getAttribute('data-blip-id'));
});
gate('G6 exactly one edit toolbar, on the clicked blip', editClicked && em === 1 && emOwner[0] === clickInfo?.id,
  `editClicked=${editClicked} editMenus=${em} on=${JSON.stringify(emOwner)}`);

// ---- activate a DIFFERENT blip → previous editor must close ----
await page.evaluate((editingId) => {
  const containers = Array.from(document.querySelectorAll('.blip-container.nested-blip'))
    .filter(el => el.offsetParent !== null && el.getAttribute('data-blip-id') !== editingId);
  const target = containers[0];
  const content = target?.querySelector('.blip-content');
  (content || target)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, clickInfo?.id || '');
await sleep(2000);
await shot('05-other-blip-clicked.png');
const emAfter = await editMenuCount();
const menusAfter = await menuCount();
gate('G7 previous editor closes on other-blip activation', emAfter === 0 && menusAfter <= 1,
  `editMenus=${emAfter} menus=${menusAfter}`);

await browser.close();
const failed = results.filter(x => !x.ok);
log(`\n==== ${results.length - failed.length}/${results.length} gates passed ====`);
process.exit(failed.length ? 1 : 0);
