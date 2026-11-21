#!/usr/bin/env node
/**
 * Regression smoke, Liliia 19 Nov 2026: a screenshot pasted from the clipboard into a sub-blip must land in THAT blip,
 * survive a save (it used to be a data: URI that the server refused with 413, so it vanished on reload) and be removable
 * on its own. Judged as a non-owner. RIZZOMA_BASE_URL=http://127.0.0.1:3000 node test-paste-image-smoke.mjs (needs COUCHDB_URL)
 */
import { chromium } from 'playwright';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const PASS = 'PasteSmoke!1';
const stamp = Date.now();
const A = `ps-a-${stamp}@example.com`; const B = `ps-b-${stamp}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
await seedVerifiedE2EAccount(A, PASS); await seedVerifiedE2EAccount(B, PASS);
const browser = await chromium.launch({ headless: process.env.RIZZOMA_E2E_HEADED !== '1' });
async function signedIn(email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ email, pass }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email, password: pass }) });
  }, { email, pass: PASS });
  return { ctx, page };
}
// owner builds: topic, two reply blips, one nested child (Ctrl+Enter)
const { ctx: ca, page: pa } = await signedIn(A);
await pa.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await pa.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(500);
await pa.locator('#topic-title').click(); await pa.keyboard.type('ZZ SCRATCH paste smoke', { delay: 15 });
await pa.locator('.btn-primary').click(); await sleep(4500);
const topicId = pa.url().split('/topic/')[1];
await seedAcceptedParticipant(topicId, B, 'editor', 'e2e');
for (const t of ['First blip text', 'Second blip text']) { await pa.locator('.write-reply-input').first().click(); await pa.keyboard.type(t, { delay: 15 }); await pa.keyboard.press('Enter'); await sleep(2200); }
await pa.locator('.blip-collapsed-row', { hasText: 'First blip' }).first().click(); await sleep(1500);
await pa.locator('.blip-container.nested-blip li', { hasText: /^First blip/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
await pa.keyboard.press('Control+End'); await pa.keyboard.press('Control+Enter'); await sleep(2500);
await pa.keyboard.type('Nested child text', { delay: 20 }); await sleep(1500);
for (let i = 0; i < 4; i += 1) { const d = pa.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } }
await ca.close();

// owner leaves the nested child; B (non-owner, editor) pastes a big screenshot from the CLIPBOARD into it
await ca.close();
const { ctx: cb, page: p } = await signedIn(B);
const errs = []; p.on('response', (r) => { if (r.status() === 413) errs.push(r.url()); });
await p.goto(`${BASE}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
await p.locator('.blip-collapsed-row', { hasText: 'First blip' }).first().click(); await sleep(1500);
await p.locator('.blip-thread-marker').filter({ visible: true }).first().click(); await sleep(2000);
const child = p.locator('.rizzoma-blip').filter({ hasText: 'Nested child' }).last(); const cbx = await child.locator('li').first().boundingBox();
await p.mouse.click(cbx.x + 60, cbx.y + 8); await sleep(1500); await p.keyboard.press('Control+End'); await sleep(400);
await p.evaluate(async () => { const W = 1600, H = 900; const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); const d = g.createImageData(W, H); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random() * 255; d.data[i + 1] = Math.random() * 255; d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); window.__shotBytes = blob.size; await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); });
await p.keyboard.press('Control+v'); await sleep(9000);
const stored = () => p.evaluate(async (id) => { const r = await fetch(`/api/blips?waveId=${id}&limit=100`, { credentials: 'include' }); const j = await r.json(); return (j.blips || j).filter((x) => !x.deleted).map((x) => String(x.content)); }, topicId);
const bytes = await p.evaluate(() => window.__shotBytes);
let all = await stored(); const holder = all.filter((c) => /<img/.test(c));
check(bytes > 1_000_000, 'the pasted screenshot is larger than 1 MB', `${bytes} bytes`);
check(holder.length === 1 && /Nested child text/.test(holder[0]), 'the picture is stored in the blip the caret was in (the nested child)', `blips with a picture=${holder.length}`);
check(holder.length === 1 && /src="\/uploads\//.test(holder[0]) && !/data:image/.test(holder[0]), 'the picture is an uploaded file, not an inline data: URI', (holder[0] || '').match(/<img[^>]{0,60}/)?.[0] || '');
check(errs.length === 0, 'the server refused nothing (no 413)', `${errs.length} responses`);
const img = p.locator('.rizzoma-blip .ProseMirror img').filter({ visible: true }).first();
check((await img.count()) === 1 && (await img.evaluate((e) => e.naturalWidth)) === 1600, 'the picture is visible and fully loaded', '');
await img.click(); await sleep(500); await p.keyboard.press('Backspace'); await sleep(3500);
all = await stored();
check(all.length === 3 && !all.some((c) => /<img/.test(c)) && all.some((c) => /Nested child text/.test(c)), 'selecting the picture and pressing Backspace removes only the picture, the blip stays', `blips=${all.length}`);
await cb.close(); await browser.close();
console.log(failed ? `FAILED ${failed} check(s)` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
