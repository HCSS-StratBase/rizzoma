#!/usr/bin/env node
/**
 * Regression smoke: clicking into an OPEN nested blip puts the caret in THAT blip, not in an ancestor.
 *
 * Found while hand-building the Fractal Showcase (18 Nov 2026): topic root > A > B > C, all in edit mode,
 * C finished with Done. A real mouse press on B's own text moved the focus into A (the outer editor):
 * the inline child renders inside the parent's contenteditable=false atom host, ProseMirror of the parent
 * treated the press as a press on the atom (selected it, focused the parent), and the next keystrokes
 * went to the wrong blip. Real keyboard and mouse only; the server is read for the final check.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3000 node test-nested-pointer-focus-smoke.mjs
 * Needs COUCHDB_URL (accounts are seeded as the other smokes do). Exit 0 = pass.
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const PASS = 'NestedPointer!1';
const email = `np-${Date.now()}@example.com`;
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
await p.locator('#topic-title').click(); await p.keyboard.type('ZZ SCRATCH nested pointer focus', { delay: 15 });
await p.locator('.btn-primary').click(); await sleep(4500);
await p.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click(); await sleep(1800);
const EDITOR = '.ProseMirror[contenteditable="true"]';
await p.locator(EDITOR).first().click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
const focusedBlip = () => p.evaluate(() => document.activeElement?.closest?.('[data-blip-id]')?.getAttribute('data-blip-id') || null);
const ctrlEnter = async () => {
  const before = await focusedBlip();
  await p.keyboard.press('Control+Enter');
  for (let i = 0; i < 50; i += 1) { const f = await focusedBlip(); if (f && f !== before) return f; await sleep(100); }
  return null;
};
await p.keyboard.type('Root line alpha here', { delay: 20 });
for (let k = 0; k < 8; k += 1) await p.keyboard.press('ArrowLeft');
const A = await ctrlEnter(); await sleep(500);
await p.keyboard.type('A first line here', { delay: 20 }); await p.keyboard.press('Enter'); await p.keyboard.type('A second line here', { delay: 20 });
for (let k = 0; k < 1; k += 1) await p.keyboard.press('ArrowUp');
await p.keyboard.press('Home'); for (let k = 0; k < 7; k += 1) await p.keyboard.press('ArrowRight');
const B = await ctrlEnter(); await sleep(500);
await p.keyboard.type('B first line here', { delay: 20 }); await p.keyboard.press('Enter'); await p.keyboard.type('B second line here', { delay: 20 });
await p.keyboard.press('Home'); for (let k = 0; k < 8; k += 1) await p.keyboard.press('ArrowRight');
const C = await ctrlEnter(); await sleep(500);
await p.keyboard.type('C leaf', { delay: 20 });
check(Boolean(A && B && C && new Set([A, B, C]).size === 3), 'three nested blips were created', `A=${A?.slice(-5)} B=${B?.slice(-5)} C=${C?.slice(-5)}`);
await p.locator(`[data-blip-id="${C}"] [data-testid="blip-menu-done"]`).last().click(); await sleep(1200);

// the press that used to land in A
await p.locator(`[data-blip-id="${B}"] .ProseMirror[contenteditable="true"]`).first().locator(':scope > ul > li').first().click({ position: { x: 48, y: 8 } });
await sleep(600);
const f = await focusedBlip();
check(f === B, 'a mouse press on B\'s own text focuses B (not an ancestor)', `focused=${f?.slice(-5)} B=${B?.slice(-5)} A=${A?.slice(-5)}`);
await p.keyboard.type('#', { delay: 30 }); await sleep(500);
const bText = await p.evaluate((id) => document.querySelector(`[data-blip-id="${id}"] .ProseMirror`)?.textContent || '', B);
check(bText.includes('#'), 'the typed character landed in B', bText.slice(0, 30));
await browser.close();
console.log(failed ? `FAILED ${failed} check(s)` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
