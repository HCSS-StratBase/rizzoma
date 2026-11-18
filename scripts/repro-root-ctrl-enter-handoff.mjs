#!/usr/bin/env node
/**
 * REPRODUCTION of an OPEN defect (not a passing gate): after Ctrl+Enter in the TOPIC ROOT editor
 * (React path) the brand-new child's editor is intermittently closed within ~0.5-1 s and the
 * text typed right after Ctrl+Enter is lost or lands late. Present on master and on the release
 * before the 18 Nov fixes (measured 18 Nov 2026: child editor kept in 3 of 12 runs on master, 6 of 12 on the
 * base, both on a loaded machine). Real key presses are required: a synthetic dispatchEvent flushes
 * React later and never showed it. Evidence: the child's TipTap editor is destroyed ~400 ms
 * after its creation, when the tab's own create/save socket events trigger a topic reload.
 * Holding that reload for 4 s fixed this case (10 of 10) but broke the next level (L3 of the
 * hand-build acceptance), because nested creation needs that reload; not shipped.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3200 COUCHDB_URL=... RUNS=6 node scripts/repro-root-ctrl-enter-handoff.mjs
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const RUNS = Number(process.env.RUNS || 6);
const PASS = 'RootCtrlEnter!1';
const email = `rce-${Date.now()}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (h) => String(h || '').replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '').replace(/<[^>]+>/g, '').trim();

await seedVerifiedE2EAccount(email, PASS);
const browser = await chromium.launch({ headless: true });
let failed = 0;
for (let run = 1; run <= RUNS; run += 1) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ e, p }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    const csrf = decodeURIComponent(raw.split('=')[1]);
    await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: e, password: p }) });
  }, { e: email, p: PASS });
  const tid = await page.evaluate(async () => {
    const raw = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    const csrf = decodeURIComponent(raw.split('=')[1]);
    const r = await fetch('/api/topics', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ title: `RCE ${Date.now()}`, content: '<h1>RCE</h1>' }) });
    return (await r.json()).id;
  });
  await page.goto(`${BASE}/?layout=rizzoma&render=react#/topic/${tid}`, { waitUntil: 'domcontentloaded' });
  await sleep(6000);
  await page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click();
  await sleep(1500);
  await page.locator('.ProseMirror[contenteditable="true"]').first().click().catch(() => undefined);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('L1 label', { delay: 25 });
  await page.keyboard.press('Control+Enter');
  await sleep(300);
  await page.keyboard.type('L2 label', { delay: 25 });
  await sleep(1500);
  const editors = await page.evaluate(() => document.querySelectorAll('.ProseMirror[contenteditable="true"]').length);
  await sleep(3000);
  const texts = await page.evaluate(async (t) => {
    const r = await fetch(`/api/blips?waveId=${t}&limit=50`, { credentials: 'include' });
    const j = await r.json();
    return (j.blips || j).filter((b) => !b.deleted).map((b) => b.content || '');
  }, tid);
  const landed = texts.map(plain).includes('L2 label');
  const ok = landed && editors >= 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  run ${run}: child editor kept (${editors} editors) and text stored in the child (${landed})`);
  if (!ok) failed += 1;
  await page.context().close();
}
await browser.close();
console.log(failed === 0 ? `ALL PASS (${RUNS} runs)` : `${failed} of ${RUNS} FAILED`);
process.exit(failed === 0 ? 0 : 1);
