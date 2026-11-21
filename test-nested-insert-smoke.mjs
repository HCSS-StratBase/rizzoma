#!/usr/bin/env node
/**
 * Regression smoke, Liliia 19 Nov 2026 (her pictures 3 and 4): in a SUB-BLIP with three bullets, in VIEW mode,
 * (c) click mid "blip 1" and press Ctrl+Enter without Edit: the new blip is anchored there and holds the typed text, the
 * parent blip is untouched (it used to become "Test 2N", the new blip stayed empty); (d) a clipboard picture pasted at
 * "blip 1" lands in that line. RIZZOMA_BASE_URL=http://127.0.0.1:3000 node test-nested-insert-smoke.mjs (needs COUCHDB_URL)
 */
import { chromium } from 'playwright';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const PASS = 'NestSmoke!1';
const stamp = Date.now();
const A = `ns-a-${stamp}@example.com`; const B = `ns-b-${stamp}@example.com`;
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
const { ctx, page: p } = await signedIn(A);
const errs = [];
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(500);
await p.locator('#topic-title').click(); await p.keyboard.type('ZZ SCRATCH nested insert', { delay: 15 });
await p.locator('.btn-primary').click(); await sleep(4500);
const topicId = p.url().split('/topic/')[1];
const stored = () => p.evaluate(async (id) => { const r = await fetch(`/api/blips?waveId=${id}&limit=100`, { credentials: 'include' }); const j = await r.json(); return (j.blips || j).filter((x) => !x.deleted).map((x) => ({ id: String(x.id || x._id), parent: String(x.parentId || ''), html: String(x.content).replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '[+]').replace(/<img[^>]*>/g, '[IMG]').replace(/<\/li>/g, ' | ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() })); }, topicId);
const done = async () => { for (let i = 0; i < 5; i += 1) { const d = p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } } };
async function buildSub() {
  await p.locator('.write-reply-input').first().click(); await p.keyboard.type('Test 2', { delay: 20 }); await p.keyboard.press('Enter'); await sleep(2500);
  await p.locator('.blip-collapsed-row', { hasText: 'Test 2' }).first().click(); await sleep(1800);
  await p.locator('.blip-container.nested-blip li', { hasText: /^Test 2/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
  await p.keyboard.press('Control+End'); await p.keyboard.press('Control+Enter'); await sleep(2500);
  for (const [i, t] of ['blip 1', 'blip 2', 'blip 3'].entries()) { await p.keyboard.type(t, { delay: 20 }); if (i < 2) await p.keyboard.press('Enter'); await sleep(250); }
  await sleep(1500); await done(); await sleep(1500);
}
await buildSub();
// (d) paste a real clipboard picture at the end of "blip 1" in the sub-blip, VIEW mode
const line1b = p.locator('.rizzoma-blip').filter({ hasText: 'blip 1' }).last().locator('li', { hasText: /^blip 1/ }).first(); const bb = await line1b.boundingBox();
await p.mouse.click(bb.x + 20, bb.y + 8); await sleep(1500); await p.keyboard.press('End'); await sleep(300);
await p.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 240; cv.height = 120; const g = cv.getContext('2d'); g.fillStyle = '#2a7'; g.fillRect(0, 0, 240, 120); const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); });
await p.keyboard.press('Control+v'); await sleep(6000); await done(); await sleep(1500);
let all = await stored(); const withImg = all.filter((x) => /\[IMG\]/.test(x.html));
check(withImg.length === 1 && /^blip 1\[IMG\] \| blip 2 \| blip 3/.test(withImg[0].html), '(d) the picture lands in the "blip 1" line, not at blip 3 or the end', withImg.map((x) => x.html).join(' // '));
// (c) VIEW mode: click in the middle of the "blip 1" line, Ctrl+Enter WITHOUT pressing Edit, type
const sub = p.locator('.rizzoma-blip').filter({ hasText: 'blip 1' }).last(); const line1 = sub.locator('li', { hasText: /^blip 1/ }).first(); const bx = await line1.boundingBox();
await p.mouse.click(bx.x + 30, bx.y + 8); await sleep(1500);
await p.keyboard.press('Control+Enter'); await sleep(2500); await p.keyboard.type('NEW', { delay: 30 }); await sleep(1500); await done(); await sleep(1500);
all = await stored();
const parent = all.find((x) => x.parent === '' || /^Test 2/.test(x.html)); const subB = all.find((x) => /^bli(\[\+\])?p 1/.test(x.html)); const child = all.find((x) => subB && x.parent === subB.id);
check(parent && /^Test 2\[\+\]/.test(parent.html) && !/Test 2N/.test(parent.html), '(c) the typed text did not land in the parent blip', parent?.html || '');
check(!!child && /NEW/.test(child.html), '(c) the new blip exists and holds the typed text', child?.html || 'no child');
check(!!subB && /^bli\[\+\]p 1\[IMG\]/.test(subB.html), '(c) the new blip is anchored in the middle of the clicked "blip 1" line', subB?.html || '');
await p.evaluate(async (id) => { await fetch('/api/auth/csrf', { credentials: 'include' }); const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1]) : ''; await fetch(`/api/topics/${id}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' }); }, topicId);
await ctx.close(); await browser.close();
console.log(failed ? `FAILED ${failed} check(s)` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
