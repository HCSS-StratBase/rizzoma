/**
 * Phase 1 native-read acceptance.
 *
 * Builds a depth-N topic whose blips are linked ONLY by parentId, with
 * markerless HTML bodies (no data-blip-thread spans) — the exact condition that
 * made the native read path stop at depth 2. Then renders it via `?render=native`
 * and verifies the native renderer cascades to full depth, capturing PNGs.
 *
 * Env: NRA_BASE (default live), NRA_DEPTH (default 10), NRA_OUT.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.NRA_BASE || 'https://138-201-62-161.nip.io';
const DEPTH = Number(process.env.NRA_DEPTH || 10);
const OUT = process.env.NRA_OUT || `/mnt/c/Rizzoma/screenshots/260716-native-read-acceptance`;
const EMAIL = 'try-owner+try-1783562412806@example.com';
const PASS = 'Try!Owner-try-1783562412806';

fs.mkdirSync(OUT, { recursive: true });
const log = m => console.log(`[nra] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', e => log(`PAGEERROR: ${String(e).slice(0, 160)}`));

// ---- login ----
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.evaluate(async ({ email, pass }) => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    credentials: 'include',
    body: JSON.stringify({ email, password: pass }),
  });
}, { email: EMAIL, pass: PASS });

// ---- build a markerless depth-N chain via the API ----
const built = await page.evaluate(async ({ depth }) => {
  const csrfOf = () => {
    const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
    return raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  };
  const post = async (url, body) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfOf() },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return r.json();
  };
  const topic = await post('/api/topics', {
    title: 'NATIVE-READ ' + Date.now(),
    content: '<h1>Native read depth test</h1>',
  });
  const topicId = topic.id || topic._id;
  const ids = [];
  let parentId = null;
  for (let i = 1; i <= depth; i++) {
    // Deliberately markerless body — nesting exists ONLY via parentId.
    const blip = await post('/api/blips', {
      waveId: topicId,
      parentId,
      content: `<ul><li><p>L${i} label</p></li></ul>`,
    });
    const bid = blip.id || blip._id;
    ids.push(bid);
    parentId = bid;
    await new Promise(r => setTimeout(r, 6)); // keep server ms-ids distinct
  }
  return { topicId, ids };
}, { depth: DEPTH });

log(`topic ${built.topicId} — built ${built.ids.length} chained blips (markerless, parentId-only)`);

// ---- render via native ----
const url = `${BASE}/?layout=rizzoma&render=native#/topic/${built.topicId}`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await sleep(7000);

const measure = async () => page.evaluate(() => {
  const host = document.querySelector('.rizzoma-native-mode') || document.body;
  const containers = host.querySelectorAll('.blip-container');
  const threads = host.querySelectorAll('.blip-thread');
  const placeholders = host.querySelectorAll('.blip-thread-placeholder');
  // Max nesting depth of blip-container (containers exist in DOM even when folded).
  let maxDepth = 0;
  const visit = (el, d) => {
    if (el.classList?.contains('blip-container')) { maxDepth = Math.max(maxDepth, d); d += 1; }
    for (const c of Array.from(el.children)) visit(c, d);
  };
  visit(host, 0);
  return {
    containers: containers.length,
    threads: threads.length,
    placeholders: placeholders.length,
    maxDepth,
  };
});

const folded = await measure();
log(`FOLDED: containers=${folded.containers} threads=${folded.threads} placeholders=${folded.placeholders} maxDepth=${folded.maxDepth}`);
await page.screenshot({ path: path.join(OUT, '01-native-folded.png'), fullPage: false });

// ---- unfold top-down (real clicks on the shallowest folded fold-button) for the eyeball ----
for (let round = 0; round < DEPTH + 2; round++) {
  const clicked = await page.evaluate(() => {
    // shallowest folded thread = fewest .blip-thread ancestors
    const folded = Array.from(document.querySelectorAll('.blip-thread.folded'));
    if (!folded.length) return false;
    folded.sort((a, b) => {
      const depth = el => { let n = 0, c = el.parentElement; while (c) { if (c.classList?.contains('blip-thread')) n++; c = c.parentElement; } return n; };
      return depth(a) - depth(b);
    });
    const btn = folded[0].querySelector('.fold-button, .js-fold-button');
    if (btn) { btn.click(); return true; }
    folded[0].classList.remove('folded');
    return true;
  });
  if (!clicked) break;
  await sleep(500);
}
await sleep(800);
await page.screenshot({ path: path.join(OUT, '02-native-unfolded.png'), fullPage: true });
const unfolded = await measure();
log(`UNFOLDED: containers=${unfolded.containers} threads=${unfolded.threads} placeholders=${unfolded.placeholders} maxDepth=${unfolded.maxDepth}`);

// ---- verdict ----
const ok = folded.containers === DEPTH + 1 && folded.maxDepth === DEPTH && folded.placeholders === 0;
log(`VERDICT: ${ok ? 'PASS' : 'FAIL'} — expected containers=${DEPTH + 1} maxDepth=${DEPTH} placeholders=0`);
log(`screenshots in ${OUT}`);

await browser.close();
process.exit(ok ? 0 : 1);
