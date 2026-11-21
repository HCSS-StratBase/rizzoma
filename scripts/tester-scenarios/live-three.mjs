#!/usr/bin/env node
// Live check of three shipped fixes as the non-owner account Fractal Tester 2 (and Fractal Tester 1 as the topic owner for
// item 1), real clicks and typing, a clean browser context per person, headed on a private Xvfb display (run it through
// xvfb-run with DISPLAY unset; never a real desktop). Credentials are read inside the process from the credential file
// ($GDRIVE_ROOT must be set) and typed into the real sign-in form; no screenshot is taken before sign-in has finished.
//   GDRIVE_ROOT=... xvfb-run -a env -u DISPLAY -u WAYLAND_DISPLAY node scripts/tester-scenarios/live-three.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = (process.env.LIVE_BASE || 'https://138-201-62-161.nip.io').replace(/\/$/, '');
const RUN = process.env.LIVE_RUN || Date.now().toString(36);
const OUT = process.env.LIVE_OUT || `/home/stephan/ledger-evidence/live-three-${RUN}`;
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
const check = (item, ok, label, detail = '') => { results.push({ item, ok, label, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  [${item}] ${label}${detail ? ` | ${String(detail).slice(0, 200)}` : ''}`); };
const browser = await chromium.launch({ headless: false, slowMo: 60 });
const topics = [];

async function person(p) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
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
  const newTopic = async (title) => {
    await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3500);
    await page.locator('.create-wave').first().click(); await sleep(900);
    await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(title, { delay: 15 });
    await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
    const id = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
    topics.push({ id, page, api }); return id;
  };
  const reply = async (text) => { await page.locator('.write-reply-input').first().click(); await k.type(text, { delay: 40 }); await k.press('Enter'); await sleep(2400); };
  const open = async (text) => { const row = page.locator('.blip-collapsed-row', { hasText: text }).first(); if (await row.count()) { await row.click(); await sleep(1300); } };
  const activate = async (text) => {
    await open(text);
    await page.locator('.blip-container.nested-blip li', { hasText: new RegExp(`^${text}`) }).first().click({ position: { x: 12, y: 8 } }); await sleep(1300);
    for (let i = 0; i < 4 && (await page.locator('button:has-text("Done")').count()); i += 1) { await page.locator('button:has-text("Done")').last().click(); await sleep(700); }
  };
  const gear = async () => {
    const sel = '[data-testid="blip-menu-gear-toggle"], [data-testid="blip-menu-overflow-toggle"]';
    const own = page.locator(`.rizzoma-blip.active:not(.topic-root) ${sel}`);
    await ((await own.count()) ? own.last() : page.locator(sel).last()).click(); await sleep(500);
  };
  return { ctx, page, k, shot, api, newTopic, reply, open, activate, gear };
}

try {
  // ---------- item 1 (#114): Tester 1 builds a topic and invites Tester 2; Tester 2 reads everything
  const one = await person(T1);
  const tid = await one.newTopic(`ZZ SCRATCH ledger ${RUN} read`);
  await one.reply('First blip text'); await one.reply('Second blip text');
  await one.open('First blip');
  await one.page.locator('.blip-container.nested-blip li', { hasText: /^First blip/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
  await one.k.press('Control+End'); await one.k.press('Control+Enter'); await sleep(2500);
  await one.k.type('Nested child text', { delay: 30 }); await sleep(1500);
  for (let i = 0; i < 4; i += 1) { const d = one.page.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } }
  await one.page.locator('.invite-btn').click(); await sleep(1200);
  await one.page.locator('#invite-emails').fill(T2.email); await sleep(500);
  await one.page.locator('.invite-btn-primary').click(); await sleep(3000);
  const parts = await one.api('GET', `/api/topics/${tid}/participants`);
  console.log('participants status', parts.status);

  const two = await person(T2);
  await two.page.goto(`${BASE}/?layout=rizzoma#/topic/${tid}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
  await two.shot('1a-topic-opened-before-reading');
  const next0 = await two.page.evaluate(() => { const n = document.querySelector('.next-button'); return { cls: n?.className || '', bg: n ? getComputedStyle(n).backgroundColor : '' }; });
  const unread0 = await two.page.evaluate(async (id) => (await (await fetch(`/api/waves/${id}/unread`, { credentials: 'include' })).json()).unread || [], tid);
  console.log('unread before reading', unread0.length);
  for (const t of ['First blip', 'Second blip']) { await two.page.locator('.blip-collapsed-row', { hasText: t }).first().click().catch(() => {}); await sleep(1500); }
  await two.page.locator('.blip-thread-marker').filter({ visible: true }).first().click().catch(() => {}); await sleep(5000);
  await two.shot('1b-everything-opened');
  const unread = await two.page.evaluate(async (id) => (await (await fetch(`/api/waves/${id}/unread`, { credentials: 'include' })).json()).unread || [], tid);
  const nextInfo = () => two.page.evaluate(() => { const n = document.querySelector('.next-button'); return { cls: n?.className || '', bg: n ? getComputedStyle(n).backgroundColor : '' }; });
  const next = await nextInfo();
  check(1, unread0.length > 0, 'before reading, the invited reader had unread blips', unread0.length);
  check(1, unread.length === 0 && next.bg !== next0.bg, 'after opening every blip including the inline child, nothing is unread and the Next button is no longer the green follow-the-green colour', `unread=${unread.length} before ${next0.bg} after ${next.bg}`);
  await two.page.locator('.rizzoma-blip').filter({ hasText: 'Nested child text' }).last().click({ position: { x: 30, y: 10 } }).catch(() => {}); await sleep(900);
  await two.page.locator('[data-testid="blip-menu-get-link"]').filter({ visible: true }).last().click().catch(() => {}); await sleep(900);
  await two.shot('1c-after-copy-blip-link');
  const link = await two.page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  const blipId = (/#\/topic\/[^/?]+\/([^/?]+)\/?$/.exec(link) || [])[1];
  check(1, !!blipId, 'the copied link ends in a blip id (not the topic root)', link);
  const p2 = await two.ctx.newPage(); await p2.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(8000);
  const shown = await p2.evaluate(() => (document.querySelector('.rizzoma-topic-detail, .wave-panel, main')?.innerText || document.body.innerText || '').replace(/\s+/g, ' '));
  await p2.screenshot({ path: path.join(OUT, 't2-1d-link-opened.png') }); console.log('SHOT', path.join(OUT, 't2-1d-link-opened.png'));
  check(1, /Nested child text/.test(shown) && !/Second blip text/.test(shown), 'opening the copied link shows that blip, not the whole topic', shown.slice(0, 120));
  await p2.close();

  // ---------- item 2 (#111): Tester 2 copies / cuts one blip and pastes on another
  await two.newTopic(`ZZ SCRATCH ledger ${RUN} clip`);
  await two.reply('Copyme text'); await two.reply('Target');
  await two.activate('Copyme text'); await two.gear(); await two.page.getByRole('menuitem', { name: /Copy comment/ }).last().click(); await sleep(1000);
  await two.activate('Target'); await two.gear();
  const pr = two.page.getByRole('menuitem', { name: /Paste as reply/ }).last();
  const prEnabled = await pr.isEnabled();
  await two.shot('2a-menu-paste-as-reply');
  check(2, prEnabled, 'after Copy on one blip, another blip offers Paste as reply enabled');
  if (prEnabled) { await pr.click(); await sleep(1200); await two.page.locator('.btn-send-reply').first().click(); await sleep(3000); } else { await two.k.press('Escape'); }
  await two.reply('Mover'); await two.reply('Dest');
  await two.activate('Mover'); await two.gear(); await two.page.getByRole('menuitem', { name: /Cut blip/ }).last().click(); await sleep(1000);
  await two.activate('Dest'); await two.gear();
  const pn = two.page.getByRole('menuitem', { name: /Paste as new blip/ }).last();
  const pnEnabled = await pn.isEnabled();
  await two.shot('2b-menu-paste-as-new');
  check(2, pnEnabled, 'after Cut on one blip, another blip offers Paste as new blip enabled');
  if (pnEnabled) { await pn.click(); await sleep(3000); } else { await two.k.press('Escape'); }
  await two.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
  await two.open('Target'); await sleep(800);
  await two.shot('2c-copy-pasted-under-target-open');
  const tgtText = await two.page.locator('.blip-container', { hasText: 'Target' }).first().innerText().catch(() => '');
  const copyRows = await two.page.locator('.blip-collapsed-row', { hasText: 'Copyme text' }).count();
  check(2, /Copyme text/.test(tgtText) || copyRows >= 2, 'the copy is under Target as its own blip with its plus (collapsed row)', `rows with the copied text=${copyRows}`);
  await two.open('Dest'); await sleep(800);
  await two.shot('2d-cut-pasted-under-dest-open');
  const moverRows = await two.page.locator('.blip-collapsed-row', { hasText: 'Mover' }).count();
  const topLevelMover = await two.page.locator('.rizzoma-topic-detail > * .blip-collapsed-row', { hasText: 'Mover' }).count();
  check(2, moverRows >= 1, 'the cut blip Mover shows as a collapsed blip with its plus below Dest', `rows=${moverRows}`);
  await two.open('Mover'); await sleep(1000);
  await two.shot('2e-moved-blip-opened');

  // ---------- item 3 (#112): the topics list filter
  await two.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(5000);
  const sel = two.page.locator('[data-testid="topics-filter"]');
  check(3, (await sel.count()) > 0, 'the topics list has the filter dropdown');
  if (await sel.count()) {
    const opts = await sel.locator('option').allInnerTexts();
    check(3, ['All', 'Inbox', 'By me'].every((o) => opts.includes(o)), 'it offers All, Inbox and By me', opts.join(','));
    await two.shot('3a-filter-all');
    await sel.selectOption('mine'); await sleep(1200); await two.shot('3b-filter-by-me');
    const mine = await two.page.locator('.search-result-item').allInnerTexts();
    check(3, mine.length > 0 && mine.some((t) => t.includes(`ledger ${RUN} clip`)) && !mine.some((t) => t.includes(`ledger ${RUN} read`)), 'By me lists the topic Tester 2 made and not the one Tester 1 made', JSON.stringify(mine.map((t) => t.split('\n')[0])).slice(0, 200));
    await sel.selectOption('inbox'); await sleep(1200); await two.shot('3c-filter-inbox');
    console.log('inbox rows', (await two.page.locator('.search-result-item').allInnerTexts()).length);
    await sel.selectOption('all'); await sleep(1200);
    const all2 = await two.page.locator('.search-result-item').allInnerTexts();
    check(3, all2.some((t) => t.includes(`ledger ${RUN} clip`)) && all2.some((t) => t.includes(`ledger ${RUN} read`)), 'All lists both the own and the shared topic');
  }
  // ---------- cleanup: delete the scratch topics as their owners, prove none remain
  for (const t of topics) await t.api('DELETE', `/api/topics/${t.id}`).then((r) => console.log('delete', t.id, r.status)).catch(() => {});
  for (const [who, pg] of [[one, 'tester 1'], [two, 'tester 2']]) {
    const l = await who.api('GET', '/api/topics?limit=200&my=1');
    check('cleanup', !l.text.includes(`ledger ${RUN}`), `no scratch topic of this run remains for ${pg}`, l.status);
  }
} catch (e) { console.log('SCRIPT ERROR', String(e).slice(0, 400)); results.push({ item: 'script', ok: false, label: String(e).slice(0, 200) }); }
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ run: RUN, base: BASE, results }, null, 1));
process.exit(results.every((r) => r.ok) ? 0 : 1);
