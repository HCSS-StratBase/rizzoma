#!/usr/bin/env node
// Live check of the follow-the-green read rule as the NON-OWNER Fractal Tester 2 (Tester 1 owns the scratch topic).
// SDS rule (4 Jul 2022): "Next" ungreens the blip it lands on and clicking into a blip ungreens it, but merely
// OPENING a green blip (no click inside it, no change) leaves it green. Headed on a private Xvfb display:
//   GDRIVE_ROOT=... xvfb-run -a env -u DISPLAY -u WAYLAND_DISPLAY node scripts/tester-scenarios/live-green.mjs
// LIVE_EXPECT=open-clears|open-stays selects which rule the checks assert (default open-stays).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = (process.env.LIVE_BASE || 'https://138-201-62-161.nip.io').replace(/\/$/, '');
const RUN = process.env.LIVE_RUN || Date.now().toString(36);
const OUT = process.env.LIVE_OUT || `/home/stephan/ledger-evidence/live-green-${RUN}`;
const EXPECT = process.env.LIVE_EXPECT || 'open-stays';
fs.mkdirSync(OUT, { recursive: true });
if (!process.env.GDRIVE_ROOT) { console.log('GDRIVE_ROOT is not set'); process.exit(2); }
const env = {};
for (const line of fs.readFileSync(path.join(process.env.GDRIVE_ROOT, 'SYSTEM_CREDENTIALS.env'), 'utf8').split('\n')) {
  const m = /^(RIZZOMA_MODERN_FRACTAL[12]_(?:USER|PASSWORD))=(.*)$/.exec(line.replace(/\r$/, ''));
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const T1 = { email: env.RIZZOMA_MODERN_FRACTAL1_USER, pw: env.RIZZOMA_MODERN_FRACTAL1_PASSWORD, name: 't1' };
const T2 = { email: env.RIZZOMA_MODERN_FRACTAL2_USER, pw: env.RIZZOMA_MODERN_FRACTAL2_PASSWORD, name: 't2' };
if (!T1.email || !T2.email) { console.log('credentials missing'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, label, detail = '') => { results.push({ ok, label, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${String(detail).slice(0, 220)}` : ''}`); };
const browser = await chromium.launch({ headless: false, slowMo: 60 });

async function person(p) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(20000);
  const k = page.keyboard;
  await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3500);
  await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(p.email, { delay: 15 });
  await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(p.pw, { delay: 15 });
  await page.locator('.submit-btn').click();
  await page.locator('.shell-auth-logout').waitFor({ timeout: 30000 });
  await sleep(2500);
  const shot = async (name) => { const f = path.join(OUT, `${p.name}-${name}.png`); await page.screenshot({ path: f }); console.log('SHOT', f); return f; };
  const api = (method, url, body) => page.evaluate(async ({ method, url, body }) => {
    const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, text: (await r.text()).slice(0, 4000) };
  }, { method, url, body });
  const unread = (id) => page.evaluate(async (id) => (await (await fetch(`/api/waves/${id}/unread`, { credentials: 'include' })).json()).unread || [], id);
  const next = () => page.evaluate(() => { const n = document.querySelector('.next-button'); return { cls: n?.className || '', bg: n ? getComputedStyle(n).backgroundColor : '', text: (n?.innerText || '').trim() }; });
  return { ctx, page, k, shot, api, unread, next };
}

let tid; let one;
try {
  one = await person(T1);
  const page = one.page; const k = one.k;
  await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3500);
  await page.locator('.create-wave').first().click(); await sleep(900);
  await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH green ${RUN}`, { delay: 15 });
  await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
  tid = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
  for (const t of ['First blip text', 'Second blip text']) { await page.locator('.write-reply-input').first().click(); await k.type(t, { delay: 40 }); await k.press('Enter'); await sleep(2400); }
  await page.locator('.blip-collapsed-row', { hasText: 'First blip' }).first().click(); await sleep(1300);
  await page.locator('.blip-container.nested-blip li', { hasText: /^First blip/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
  await k.press('Control+End'); await k.press('Control+Enter'); await sleep(2500);
  await k.type('Nested child text', { delay: 30 }); await sleep(1500);
  for (let i = 0; i < 4; i += 1) { const d = page.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } }
  await page.locator('.invite-btn').click(); await sleep(1200);
  await page.locator('#invite-emails').fill(T2.email); await sleep(500);
  await page.locator('.invite-btn-primary').click(); await sleep(3000);

  const two = await person(T2);
  const p = two.page;
  await p.goto(`${BASE}/?layout=rizzoma#/topic/${tid}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
  await two.shot('a-before-reading');
  const u0 = await two.unread(tid); const n0 = await two.next();
  check(u0.length > 0, 'a non-owner invited to the topic starts with unread blips', `unread=${u0.length} next=${n0.cls}`);
  // Mark topic as read: visible to this non-owner?
  await p.locator('.gear-btn').first().click(); await sleep(700);
  const mtr = p.locator('.gear-menu-item', { hasText: 'Mark topic as read' });
  const mtrVisible = (await mtr.count()) > 0 && await mtr.first().isVisible();
  const mtrEnabled = mtrVisible && await mtr.first().isEnabled();
  await two.shot('b-gear-menu-non-owner');
  check(mtrVisible && mtrEnabled, '"Mark topic as read" is shown and enabled in the topic gear menu for the non-owner', `visible=${mtrVisible} enabled=${mtrEnabled}`);
  if (await p.locator('.gear-dropdown').count()) await p.locator('.gear-btn').first().click().catch(() => {});
  await sleep(400);
  // OPEN everything without clicking inside any blip: unfold the two rows, then the inline [+] marker
  for (const t of ['First blip', 'Second blip']) { await p.locator('.blip-collapsed-row', { hasText: t }).first().click().catch(() => {}); await sleep(1500); }
  await p.locator('.blip-thread-marker').filter({ visible: true }).first().click().catch(() => {}); await sleep(5000);
  await two.shot('c-everything-opened-no-click-inside');
  const u1 = await two.unread(tid); const n1 = await two.next();
  if (EXPECT === 'open-stays') check(u1.length > 0 && /has-unread/.test(n1.cls), 'opening blips (no click inside, no edit) leaves them green: unread remain and Next is still green', `unread=${u1.length} next=${n1.cls}`);
  else check(u1.length === 0 && !/has-unread/.test(n1.cls), 'opening blips clears them: nothing unread and Next is grey', `unread=${u1.length} next=${n1.cls}`);
  // Follow the green with Next: each press lands on one unread blip and ungreens it
  let presses = 0; const seen = [];
  for (let i = 0; i < 6; i += 1) {
    const cur = await two.unread(tid); seen.push(cur.length);
    if (cur.length === 0) break;
    const btn = p.locator('button.next-button').first();
    if (await btn.isDisabled().catch(() => true)) break;
    await btn.click(); presses += 1; await sleep(2800);
  }
  const u2 = await two.unread(tid); const n2 = await two.next();
  await two.shot('d-after-following-the-green');
  check(u2.length === 0 && !/has-unread/.test(n2.cls), 'pressing Next until it stops leaves nothing unread and Next grey', `presses=${presses} unread-before-each=${seen.join(',')} after=${u2.length} next=${n2.cls}`);
} catch (e) { console.log('SCRIPT ERROR', String(e).slice(0, 400)); results.push({ ok: false, label: 'script', detail: String(e).slice(0, 200) }); }
try { if (tid && one) { const r = await one.api('DELETE', `/api/topics/${tid}`); console.log('delete', tid, r.status); const l = await one.api('GET', '/api/topics?limit=200&my=1'); check(!l.text.includes(`green ${RUN}`), 'scratch topic removed', l.status); } } catch (e) { console.log('cleanup error', String(e).slice(0, 200)); }
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ run: RUN, base: BASE, expect: EXPECT, results }, null, 1));
process.exit(results.every((r) => r.ok) ? 0 : 1);
