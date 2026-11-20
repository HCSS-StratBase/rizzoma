#!/usr/bin/env node
/**
 * Regression smoke for two defects in Liliia's 19 Nov 2026 review, judged as a NON-OWNER in a clean context:
 *  (a) "follow the green" stayed lit after every blip had been read: a blip opened through its inline [+] marker was
 *      never marked read.  Check: after opening everything, the server has no unread blip and Next is disabled.
 *  (e) "copy blip link" gave the link to the whole topic.  Check: the copied link opens THAT blip (breadcrumb and text).
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3000 node test-liliia-smoke.mjs      (needs COUCHDB_URL)
 */
import { chromium } from 'playwright';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const PASS = 'LiliiaSmoke!1';
const stamp = Date.now();
const A = `ls-a-${stamp}@example.com`; const B = `ls-b-${stamp}@example.com`;
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
await pa.locator('#topic-title').click(); await pa.keyboard.type('ZZ SCRATCH liliia smoke', { delay: 15 });
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

// non-owner in a clean context
const { ctx: cb, page: p } = await signedIn(B);
await p.goto(`${BASE}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
for (const t of ['First blip', 'Second blip']) { await p.locator('.blip-collapsed-row', { hasText: t }).first().click().catch(() => {}); await sleep(1500); }
await p.locator('.blip-thread-marker').filter({ visible: true }).first().click().catch(() => {}); await sleep(5000);
const unread = await p.evaluate(async (id) => { const r = await fetch(`/api/waves/${id}/unread`, { credentials: 'include' }); return (await r.json()).unread || []; }, topicId);
const next = await p.evaluate(() => { const n = document.querySelector('.next-button'); return { disabled: !!n?.disabled, cls: n?.className || '' }; });
check(unread.length === 0, '(a) every opened blip, including the inline child, is marked read on the server', `unread=${unread.length}`);
check(next.disabled && !/has-unread/.test(next.cls), '(a) follow-the-green is grey once everything is read', next.cls);
// (e)
await p.locator('.rizzoma-blip').filter({ hasText: 'Nested child text' }).last().click({ position: { x: 30, y: 10 } }).catch(() => {}); await sleep(900);
await p.locator('[data-testid="blip-menu-get-link"]').filter({ visible: true }).last().click().catch(() => {}); await sleep(900);
const link = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
check(/#\/topic\/[^/?]+\/[^/?]+\/?$/.test(link), '(e) the copied blip link names the BLIP (topic and blip path)', link);
const { ctx: cc, page: p2 } = await signedIn(B);
await p2.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(8000);
const shown = await p2.evaluate(() => (document.querySelector('.rizzoma-topic-detail, .wave-panel, main')?.innerText || document.body.innerText || '').replace(/\s+/g, ' '));
check(/Nested child text/.test(shown) && !/Second blip text/.test(shown), '(e) opening that link shows that blip, not the whole topic', shown.slice(0, 90));
await cc.close(); await cb.close(); await browser.close();
console.log(failed ? `FAILED ${failed} check(s)` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
