#!/usr/bin/env node
/**
 * Regression smoke (suite case W02): two people edit the same blip; A presses End and types. Before the fix the other person's cursor label
 * was editable content at the start of the line, so A's caret sat inside it, End did nothing and the text landed at the START of the blip
 * ("A1shared B1"). Now End goes to the end of the text and both edits are stored in order. Real keys, headless Chromium.
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-collab-end-key-smoke.mjs
 */
import { chromium } from 'playwright';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const RUN = Date.now().toString(36);
const PASS = 'CollabEnd!1';
const A = `ce-a-${RUN}@example.com`; const B = `ce-b-${RUN}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
await seedVerifiedE2EAccount(A, PASS); await seedVerifiedE2EAccount(B, PASS);
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
async function person(email) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); page.setDefaultTimeout(15000);
  await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
  await page.getByPlaceholder('Email address').click(); await page.keyboard.press('Control+a'); await page.keyboard.type(email, { delay: 10 });
  await page.getByPlaceholder('Password', { exact: true }).click(); await page.keyboard.press('Control+a'); await page.keyboard.type(PASS, { delay: 10 });
  await page.locator('.submit-btn').click(); await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }); await sleep(2500);
  return page;
}
const a = await person(A); const b = await person(B);
await a.locator('.create-wave').first().click(); await sleep(900);
await a.getByPlaceholder('What would you like to discuss?').click(); await a.keyboard.type(`ZZ SCRATCH suite end key ${RUN}`, { delay: 10 });
await a.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
const topicId = (/#\/topic\/([^/?]+)/.exec(await a.evaluate(() => location.hash)) || [])[1];
await seedAcceptedParticipant(topicId, B, 'editor', 'e2e');
await a.locator('.write-reply-input').first().click(); await a.keyboard.type('shared', { delay: 20 }); await a.keyboard.press('Enter'); await sleep(2200);
await b.goto(`${BASE}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(6000);
for (const p of [a, b]) { await p.locator('.blip-collapsed-row', { hasText: 'shared' }).first().click().catch(() => undefined); await sleep(1300); }
for (const p of [a, b]) { await p.locator('.blip-container.nested-blip li', { hasText: /^shared/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500); }
await sleep(1500);
await a.keyboard.press('End'); await a.keyboard.type(' A1', { delay: 60 }); await sleep(2500);
await b.keyboard.press('End'); await b.keyboard.type(' B1', { delay: 60 }); await sleep(2500);
for (const p of [a, b]) for (let i = 0; i < 4 && (await p.locator('button:has-text("Done")').count()); i += 1) { await p.locator('button:has-text("Done")').last().click(); await sleep(1200); }
await sleep(2500);
const stored = await a.evaluate(async (id) => { const r = await fetch(`/api/blips?waveId=${id}&limit=100`, { credentials: 'include' }); const j = await r.json(); return (j.blips || j).map((x) => String(x.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }, topicId);
const mine = stored.find((t) => t.startsWith('shared')) || '';
check(/^shared A1 B1$|^shared B1 A1$/.test(mine) || (/^shared/.test(mine) && /A1/.test(mine) && /B1/.test(mine)), 'both edits are appended after the original text', JSON.stringify(stored));
check(!stored.some((t) => /^A1/.test(t)), 'A\'s text did not land at the start');
const del = await a.evaluate(async (id) => { const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : ''; return (await fetch(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' })).status; }, topicId);
check(del < 300, 'scratch topic deleted', String(del));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall collab end-key checks passed');
process.exit(failed ? 1 : 0);
