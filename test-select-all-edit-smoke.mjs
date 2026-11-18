#!/usr/bin/env node
/**
 * Editing over a selection: Ctrl+A then type, Backspace, Delete and paste over a selection (real key presses, real clipboard).
 *
 * Why it exists (19 Nov 2026): after Ctrl+A, typing / Backspace / Delete did NOTHING in a blip editor. The replacement left a bare
 * paragraph, the BLB filterTransaction rejects every local transaction that is not a bulleted list, and the keystroke was dropped
 * silently, so "select all and write the new text" never worked. The body must stay ONE bulleted list after every one of these.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-select-all-edit-smoke.mjs   (HEADED=1 on a virtual display)
 */
import { chromium } from 'playwright';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const HEADED = process.env.HEADED === '1';
const RUN = Date.now().toString(36);
const SHOTS = process.env.SHOTS || '';
let shotNo = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };

let email = process.env.RIZZOMA_E2E_USER; let password = process.env.RIZZOMA_E2E_PASSWORD;
if (!email) {
  const { seedVerifiedE2EAccount } = await import('./scripts/lib/e2e-sharing-fixtures.mjs');
  email = `selall-${RUN}@example.com`; password = 'SelectAll!1';
  await seedVerifiedE2EAccount(email, password);
}
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const k = page.keyboard;
const delay = HEADED ? 80 : 15;

await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(email, { delay: 10 });
await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(password, { delay: 10 });
await page.locator('.submit-btn').click();
await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
await sleep(2500);
await page.locator('.create-wave').first().click(); await sleep(900);
const title = `ZZ SCRATCH suite select-all ${RUN}`;
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(title, { delay: 15 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4000);
const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
await page.locator('.write-reply-input').first().click(); await k.type('alpha beta gamma', { delay }); await k.press('Enter'); await sleep(2500);
await page.locator('.blip-collapsed-row', { hasText: 'alpha' }).first().click(); await sleep(1500);
await page.locator('.blip-container.nested-blip li', { hasText: /^alpha/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
const ed = page.locator('.ProseMirror[contenteditable="true"]').first();
const html = () => page.evaluate(() => document.querySelector('.nested-blip .ProseMirror[contenteditable="true"]').innerHTML.replace(/<br class="ProseMirror-trailingBreak">/g, ''));
const oneBullet = (h) => /^<ul><li><p>[^<]*<\/p><\/li><\/ul>$/.test(h);
await ed.click();

async function step(name, act, expectText) {
  await act(); await sleep(900);
  const h = await html();
  check(oneBullet(h) && h.replace(/<[^>]+>/g, '') === expectText, name, h.slice(0, 120));
  if (SHOTS) { const fs = await import('node:fs'); fs.mkdirSync(SHOTS, { recursive: true }); shotNo += 1; await page.screenshot({ path: `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.png` }); }
}
await step('Ctrl+A then typing replaces the whole body and keeps ONE bullet', async () => { await k.press('Control+a'); await k.type('first', { delay }); }, 'first');
await step('Ctrl+A then Backspace empties the body but keeps the bullet', async () => { await k.press('Control+a'); await k.press('Backspace'); }, '');
await step('typing after the emptying works', async () => { await k.type('second', { delay }); }, 'second');
await step('Ctrl+A then Delete empties the body but keeps the bullet', async () => { await k.press('Control+a'); await k.press('Delete'); }, '');
await step('typing after Delete works', async () => { await k.type('third four', { delay }); }, 'third four');
await step('selecting one word with Shift+Arrow and typing replaces just that word', async () => { await k.press('Home'); for (let i = 0; i < 5; i += 1) await k.press('Shift+ArrowRight'); await k.type('3rd', { delay }); }, '3rd four');
await step('pasting from the real clipboard over a select-all replaces the whole body', async () => {
  await page.evaluate(() => navigator.clipboard.writeText('pasted text'));
  await k.press('Control+a'); await k.press('Control+v');
}, 'pasted text');
await step('End then typing still appends (nothing else changed)', async () => { await k.press('End'); await k.type(' more', { delay }); }, 'pasted text more');

for (let i = 0; i < 3; i += 1) { if (!(await page.locator('button:has-text("Done")').count())) break; await page.locator('button:has-text("Done")').last().click(); await sleep(1500); }
await sleep(2500);
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(5500);
const list = await page.evaluate(async (id) => (await (await fetch(`/api/blips?waveId=${id}&limit=50`, { credentials: 'include' })).json()), topicId);
const texts = (list.blips || list || []).filter((b) => !b.deleted).map((b) => String(b.content).replace(/<[^>]+>/g, ''));
check(texts.includes('pasted text more'), 'the final text is stored after Done and reload', JSON.stringify(texts));
check((list.blips || list || []).every((b) => !/^<ul>/.test(String(b.content)) || /^<ul><li>/.test(String(b.content))), 'every stored body is a bulleted list');
if (topicId) {
  const del = await page.evaluate(async (id) => { const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : ''; return (await fetch(`/api/topics/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'x-csrf-token': csrf } })).status; }, topicId);
  check(del < 300, 'scratch topic deleted', String(del));
}
await browser.close();
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
