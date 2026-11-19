#!/usr/bin/env node
/**
 * Regression smoke: a click into the MIDDLE of a view-state blip puts the caret at the clicked place,
 * and typing goes there (it used to jump to the END of the blip: entering edit mode forced focus('end'),
 * also again when the collaboration room finished syncing after the person had started typing).
 * Real browser, real mouse and keys; the server is read for the final check.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3000 node test-click-caret-smoke.mjs
 * Needs COUCHDB_URL (accounts are seeded as the other smokes do). Exit 0 = pass.
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const PASS = 'ClickCaret!1';
const email = `cc-${Date.now()}@example.com`;
const TRIES = Number(process.env.CLICK_CARET_TRIES || 5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };

await seedVerifiedE2EAccount(email, PASS);
const browser = await chromium.launch({ headless: process.env.RIZZOMA_E2E_HEADED !== '1' });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(10000);
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.evaluate(async ({ email, pass }) => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email, password: pass }) });
}, { email, pass: PASS });
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(500);
await p.locator('#topic-title').click(); await p.keyboard.type('ZZ SCRATCH click caret', { delay: 15 });
await p.locator('.btn-primary').click(); await sleep(4500);
const topicId = p.url().split('/topic/')[1];

// one level-1 blip through the reply box, finished with Done
await p.locator('.write-reply-input').first().click(); await p.keyboard.type('Hello brave new world today', { delay: 15 }); await p.keyboard.press('Enter'); await sleep(2500);
await p.locator('.blip-collapsed-row', { hasText: 'Hello brave' }).first().click(); await sleep(1500);
const blipLi = () => p.locator('.blip-container.nested-blip li', { hasText: 'Hello brave' }).first();
const storedText = async () => p.evaluate(async (id) => {
  const r = await fetch(`/api/blips?waveId=${id}&limit=100`, { credentials: 'include' }); const j = await r.json();
  return (j.blips || j).filter((b) => !b.deleted).map((b) => String(b.content).replace(/<[^>]+>/g, '')).join('|');
}, topicId);

let atEnd = 0; const seen = [];
for (let i = 0; i < TRIES; i += 1) {
  // make sure the blip is in the VIEW state, then click in the middle of the word "brave"
  const done = p.locator('.blip-container.nested-blip [data-testid="blip-menu-done"]').last();
  if (await done.isVisible().catch(() => false)) { await done.click(); await sleep(1500); }
  const box = await blipLi().boundingBox();
  await p.mouse.click(box.x + 62, box.y + 8); // inside "brave"
  await sleep(350 + (i % 3) * 400); // vary the delay: the bug depends on when the editor becomes writable
  await p.keyboard.type('Q', { delay: 40 });
  await sleep(2500);
  const t = await storedText();
  seen.push(t);
  if (/Q$/.test(t.replace(/\s+$/, ''))) atEnd += 1;
  if (!t.includes('Q')) atEnd += 1;
  // remove the Q again for the next try: Backspace right after the typed Q
  await p.keyboard.press('Backspace'); await sleep(800);
}
check(atEnd === 0, `a click inside the text puts the typed character at the clicked place, not at the end (${TRIES} tries)`, `at end or lost: ${atEnd}; last stored: ${seen.at(-1)}`);

// ---- NESTED: the same click inside a blip one level DOWN (level 2). Its edit-state layout differs (the toolbar
// moves the text), which used to make the caret fall to the end even after the top-level fix.
await blipLi().click({ position: { x: 12, y: 8 } }); await sleep(1500);
await p.keyboard.press('Control+End'); await p.keyboard.press('Control+Enter'); await sleep(2500);
await p.keyboard.type('Nested brave child text here', { delay: 20 }); await sleep(1500);
for (let i = 0; i < 4; i += 1) { const d = p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } }
await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
await p.locator('.blip-collapsed-row', { hasText: 'Hello brave' }).first().click(); await sleep(1500);
await p.locator('.blip-thread-marker').filter({ visible: true }).first().click(); await sleep(1500);
const nestedLi = () => p.locator('.blip-container.nested-blip').filter({ hasText: 'Nested brave' }).last().locator('li').first();
let nestedAtEnd = 0; const nestedSeen = [];
for (let i = 0; i < TRIES; i += 1) {
  const done = p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last();
  if (await done.isVisible().catch(() => false)) { await done.click(); await sleep(1500); }
  const box = await nestedLi().boundingBox();
  await p.mouse.click(box.x + 62, box.y + 8); // inside "brave" of the level 2 blip
  await sleep(350 + (i % 3) * 400);
  await p.keyboard.type('Z', { delay: 40 });
  await sleep(2500);
  const t = await storedText(); nestedSeen.push(t);
  const nested = t.split('|').find((x) => /Nested/.test(x)) || '';
  if (/Z$/.test(nested.replace(/\s+$/, '')) || !nested.includes('Z')) nestedAtEnd += 1;
  await p.keyboard.press('Backspace'); await sleep(800);
}
check(nestedAtEnd === 0, `a click inside a NESTED (level 2) blip also puts the character at the clicked place (${TRIES} tries)`, `at end or lost: ${nestedAtEnd}; last stored: ${nestedSeen.at(-1)}`);
await browser.close();
console.log(failed ? `FAILED ${failed} check(s)` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
