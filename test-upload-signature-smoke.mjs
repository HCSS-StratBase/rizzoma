#!/usr/bin/env node
/**
 * Image upload through the blip toolbar: a real PNG shows as a picture, a text file that only CLAIMS to be a PNG must be refused
 * and must not leave a broken picture behind (real file chooser, what the person sees).
 *
 * Why it exists (18 Nov 2026, suite case S11): the upload route only rejected dangerous signatures, so plain text declared as
 * image/png was stored and served as an image, which then showed as a broken picture in the blip.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-upload-signature-smoke.mjs   (HEADED=1 on a virtual display)
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
// a real 24 x 24 PNG (valid signature and data)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAH0lEQVR4nGO4o6FBFcQwatCoQaMGjRo0atCoQQNvEADnQaMfLH9TNwAAAABJRU5ErkJggg==', 'base64');

let email = process.env.RIZZOMA_E2E_USER; let password = process.env.RIZZOMA_E2E_PASSWORD;
if (!email) {
  const { seedVerifiedE2EAccount } = await import('./scripts/lib/e2e-sharing-fixtures.mjs');
  email = `upsig-${RUN}@example.com`; password = 'UploadSig!1';
  await seedVerifiedE2EAccount(email, password);
}
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const k = page.keyboard;
async function shot(name) { if (!SHOTS) return; const fs = await import('node:fs'); fs.mkdirSync(SHOTS, { recursive: true }); shotNo += 1; await page.screenshot({ path: `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name}.png` }); }

await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(email, { delay: 10 });
await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(password, { delay: 10 });
await page.locator('.submit-btn').click();
await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
await sleep(2500);
await page.locator('.create-wave').first().click(); await sleep(900);
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite upload-signature ${RUN}`, { delay: 15 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4000);
const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
await page.locator('.write-reply-input').first().click(); await k.type('pics', { delay: 60 }); await k.press('Enter'); await sleep(2500);
await page.locator('.blip-collapsed-row', { hasText: 'pics' }).first().click(); await sleep(1500);
await page.locator('.blip-container.nested-blip li', { hasText: /^pics/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
await k.press('Control+End');

async function chooseFile(name, mimeType, buffer) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 8000 }),
    page.locator('[data-testid="blip-menu-insert-image"]').last().click(),
  ]);
  await chooser.setFiles({ name, mimeType, buffer }); await sleep(4500);
}
const pictures = () => page.locator('.nested-blip .ProseMirror img').evaluateAll((els) => els.map((e) => ({ complete: e.complete, w: e.naturalWidth })));

await chooseFile('real.png', 'image/png', PNG);
await shot('after-real-png');
let pics = await pictures();
check(pics.length === 1 && pics[0].complete && pics[0].w > 0, 'a real PNG shows as a decoded picture in the blip', JSON.stringify(pics));

await chooseFile('fake.png', 'image/png', Buffer.from('this is not a png at all, just plain text pretending'));
await shot('after-fake-png');
pics = await pictures();
check(pics.length === 1, 'the text file posing as a PNG did not add a picture (still exactly one picture)', JSON.stringify(pics));
check(pics.every((p) => p.complete && p.w > 0), 'no broken picture is left in the blip', JSON.stringify(pics));
const body = await page.locator('body').innerText();
check(/invalid|not allowed|could not|failed|unsupported|cannot|refus/i.test(body), 'the person is told the file was refused', (await page.locator(".toast, [role=alert], [class*=toast]").allInnerTexts()).join(" / ").slice(0, 120));

const api = (method, url) => page.evaluate(async ({ method, url }) => {
  const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  const r = await fetch(url, { method, headers: { 'x-csrf-token': csrf }, credentials: 'include' });
  return { status: r.status, text: await r.text() };
}, { method, url });
if (topicId) {
  const del = await api('DELETE', `/api/topics/${encodeURIComponent(topicId)}`);
  check(del.status < 300, 'scratch topic deleted', String(del.status));
  const list = await api('GET', '/api/topics?limit=200&my=1');
  check(!list.text.includes(`upload-signature ${RUN}`), 'no scratch topic of this run remains', String(list.status));
}
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall upload-signature checks passed');
process.exit(failed ? 1 : 0);
