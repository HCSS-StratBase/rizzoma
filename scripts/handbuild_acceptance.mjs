#!/usr/bin/env node
/**
 * HAND-BUILD ACCEPTANCE — the gate for ALL Rizzoma fractal work (SDS 2026-07-14).
 *
 * Builds a fractal from an EMPTY topic through the REAL UI and proves the
 * result, with a PNG after every atomic action. Strengthened over
 * handbuild_depth10.mjs (which only walked a linear spine) with the three
 * things that were missing:
 *
 *   A. BRANCHING, not just descending. The original's model puts BLIP elements
 *      BETWEEN LINE elements in a flat array — siblings at the same depth are
 *      exactly where anchoring bugs live. We create a 2nd line + its own child
 *      at depth 3 and at depth 6.
 *   B. FOLD-BY-DEFAULT on reload (BLB §2): after reload the tree must render as
 *      a clean ToC — children COLLAPSED, not splayed open.
 *   C. A SECOND CLIENT: a different browser context must see the same structure
 *      (this is a collaboration tool; one-client proof is not proof).
 *
 * Plus the structural probe: EVERY authored blip must persist as <ul><li>
 * (BLB §19 row 1 — a <p>/<div> body is a FAIL).
 *
 * Usage:
 *   node scripts/handbuild_acceptance.mjs                  # React path (default)
 *   HB_RENDER=native node scripts/handbuild_acceptance.mjs # native port path
 * Env: HB_BASE, HB_OUT, HB_DEPTH (default 10)
 *
 * Exit 0 = ACCEPTED. Non-zero = the claim is not admissible.
 * The PNGs are the verdict — EYEBALL THEM. This log is only supporting data.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.HB_BASE || 'https://138-201-62-161.nip.io';
const RENDER = process.env.HB_RENDER || 'react';
const DEPTH = Number(process.env.HB_DEPTH || 10);
const OUT = process.env.HB_OUT || `/mnt/c/Rizzoma/screenshots/260714-handbuild-acceptance-${RENDER}`;
const EMAIL = 'try-owner+try-1783562412806@example.com';
const PASS = 'Try!Owner-try-1783562412806';

fs.mkdirSync(OUT, { recursive: true });
const log = m => console.log(`[acc] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
const gate = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

let n = 0;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', e => log(`PAGEERROR: ${String(e).slice(0, 140)}`));

async function step(name) {
  n += 1;
  await sleep(1100);
  const st = await page.evaluate(() => ({
    containers: document.querySelectorAll('.blip-container').length,
    editable: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(e => e.offsetParent !== null).length,
    focused: (document.activeElement?.className || '').toString().includes('ProseMirror'),
  }));
  await page.screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false });
  log(`${String(n).padStart(2, '0')}-${name}  containers=${st.containers} editable=${st.editable} focused=${st.focused}`);
  return st;
}

const login = async (p) => {
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async ({ email, pass }) => {
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
};

await login(page);
const topic = await page.evaluate(async () => {
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  const r = await fetch('/api/topics', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    credentials: 'include',
    body: JSON.stringify({ title: 'ACCEPTANCE ' + Date.now(), content: '<h1>ACCEPTANCE</h1>' }),
  });
  const d = await r.json();
  return d.id || d._id;
});
const url = `${BASE}/?layout=rizzoma&render=${RENDER}#/topic/${topic}`;
log(`topic ${topic} (render=${RENDER})`);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await sleep(7000);
await step('topic-open');

// ---------- build: root label ----------
await page.locator('button.topic-tb-btn', { hasText: 'Edit' }).first().click({ timeout: 10000 })
  .catch(() => gate('root Edit affordance exists', false, 'no Edit button on this render path'));
await step('root-edit');
await page.locator('.topic-content-edit .ProseMirror, .ProseMirror[contenteditable="true"]').first()
  .click({ timeout: 8000 }).catch(() => {});
await page.keyboard.press('End');
await page.keyboard.press('Enter');           // leave the H1 title alone
await page.keyboard.type('L1 label', { delay: 25 });
const s1 = await step('typed-L1');
gate('root editor accepts typing', s1.editable >= 1);

// ---------- descend to DEPTH, with BRANCHES at 3 and 6 ----------
const BRANCH_AT = [3, 6];
for (let d = 2; d <= DEPTH; d++) {
  await page.keyboard.press('Control+Enter');
  const sc = await step(`ctrl-enter-L${d}`);
  gate(`L${d}: Ctrl+Enter opens an EDITABLE, FOCUSED child`, sc.editable >= 1 && sc.focused,
    `editable=${sc.editable} focused=${sc.focused}`);
  if (!(sc.editable >= 1)) break;
  await page.keyboard.type(`L${d} label`, { delay: 25 });
  await step(`typed-L${d}`);
  const landed = await page.evaluate(t => document.body.innerText.includes(t), `L${d} label`);
  gate(`L${d}: typed text lands in the child`, landed);
  if (!landed) break;

  // BRANCH: sibling LINE in the same blip + its own child (BLIP between LINEs)
  if (BRANCH_AT.includes(d)) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(`L${d}b sibling`, { delay: 25 });
    await step(`typed-L${d}b-sibling`);
    await page.keyboard.press('Control+Enter');
    const sb = await step(`ctrl-enter-L${d}b-child`);
    gate(`L${d}b: sibling-line Ctrl+Enter opens an editable child`, sb.editable >= 1 && sb.focused,
      `editable=${sb.editable} focused=${sb.focused}`);
    if (sb.editable >= 1) {
      await page.keyboard.type(`L${d}b child`, { delay: 25 });
      await step(`typed-L${d}b-child`);
      // return the caret to the spine child so the descent continues from L{d}
      await page.evaluate(t => {
        const eds = Array.from(document.querySelectorAll('.ProseMirror'));
        const spine = eds.find(e => (e.innerText || '').includes(t));
        if (!spine) return;
        spine.focus();
        const li = spine.querySelector('li') || spine;
        const r = document.createRange();
        r.selectNodeContents(li);
        r.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      }, `L${d} label`);
      await step(`refocus-spine-L${d}`);
    }
  }
}

// ---------- reload: fold-by-default (BLB §2) ----------
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(8000);
await step('after-reload');
const foldState = await page.evaluate(() => {
  const threads = Array.from(document.querySelectorAll('.blip-thread'));
  const markers = Array.from(document.querySelectorAll('.blip-thread-marker'))
    .filter(el => el.offsetParent !== null);
  return {
    foldedThreads: threads.filter(t => t.classList.contains('folded')).length,
    plusMarkers: markers.filter(m => (m.textContent || '').trim() === '+').length,
    deepLabelsVisible: [3, 5, 7, 9].filter(i => document.body.innerText.includes(`L${i} label`)),
  };
});
gate('BLB §2: tree renders COLLAPSED after reload (clean ToC — deep labels hidden)',
  foldState.deepLabelsVisible.length === 0,
  `deep labels visible: ${JSON.stringify(foldState.deepLabelsVisible)}`);
gate('BLB §2: a [+] / folded-thread affordance exists after reload',
  foldState.plusMarkers > 0 || foldState.foldedThreads > 0,
  `plusMarkers=${foldState.plusMarkers} foldedThreads=${foldState.foldedThreads}`);

// ---------- expand everything with REAL clicks ----------
for (let i = 0; i < DEPTH + 8; i++) {
  const clicked = await page.evaluate(() => {
    const nat = Array.from(document.querySelectorAll('.blip-thread.folded .fold-button, .blip-thread.folded .js-fold-button'));
    if (nat.length) { nat[nat.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }
    const m = Array.from(document.querySelectorAll('.blip-thread-marker'))
      .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === '+').pop();
    if (!m) return false;
    m.click();
    return true;
  });
  if (!clicked) break;
  await sleep(1200);
}
await step('fully-expanded');

// ---------- persistence ----------
const persisted = await page.evaluate((depth) => {
  const want = [];
  for (let i = 1; i <= depth; i++) want.push(`L${i} label`);
  want.push('L3b sibling', 'L3b child', 'L6b sibling', 'L6b child');
  const txt = document.body.innerText;
  return want.filter(w => !txt.includes(w));
}, DEPTH);
gate('every authored label persists after reload + expand', persisted.length === 0,
  persisted.length ? `missing: ${persisted.join(', ')}` : 'all present');

// ---------- structure: BLB §19 row 1 ----------
const structure = await page.evaluate((depth) => {
  const bad = [];
  const labels = [];
  for (let i = 2; i <= depth; i++) labels.push(`L${i} label`);
  labels.push('L3b child', 'L6b child');
  for (const lbl of labels) {
    const c = Array.from(document.querySelectorAll('.blip-container'))
      .find(x => ((x.querySelector('.blip-text')?.textContent) || '').trim().startsWith(lbl));
    if (!c) { bad.push(`${lbl}: no container`); continue; }
    const html = c.querySelector('.blip-text')?.innerHTML || '';
    if (!/<li[\s>]/i.test(html)) bad.push(`${lbl}: body is NOT a list`);
  }
  return bad;
}, DEPTH);
gate('BLB §19 row 1: EVERY authored blip body is <ul><li> (not <p>/<div>)', structure.length === 0,
  structure.length ? structure.join(' | ') : 'all bulleted');

// ---------- SECOND CLIENT ----------
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
const page2 = await ctx2.newPage();
await login(page2);
await page2.goto(url, { waitUntil: 'domcontentloaded' });
await sleep(9000);
for (let i = 0; i < DEPTH + 8; i++) {
  const clicked = await page2.evaluate(() => {
    const nat = Array.from(document.querySelectorAll('.blip-thread.folded .fold-button, .blip-thread.folded .js-fold-button'));
    if (nat.length) { nat[nat.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }
    const m = Array.from(document.querySelectorAll('.blip-thread-marker'))
      .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === '+').pop();
    if (!m) return false;
    m.click();
    return true;
  });
  if (!clicked) break;
  await sleep(1100);
}
n += 1;
await page2.screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-second-client.png`), fullPage: false });
const seen2 = await page2.evaluate((depth) => {
  const txt = document.body.innerText;
  const want = [];
  for (let i = 1; i <= depth; i++) want.push(`L${i} label`);
  return want.filter(w => !txt.includes(w));
}, DEPTH);
gate('SECOND CLIENT sees the whole fractal', seen2.length === 0,
  seen2.length ? `missing for client 2: ${seen2.join(', ')}` : 'all levels visible');

await browser.close();

const failed = checks.filter(c => !c.ok);
log('');
log(`==== ${checks.length - failed.length}/${checks.length} acceptance checks passed (render=${RENDER}) ====`);
log(`screenshots: ${OUT}  — EYEBALL THEM; the PNG is the verdict, not this log`);
log(`topic: ${url}`);
if (failed.length) {
  log('FAILED:');
  for (const f of failed) log(`  - ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
}
process.exit(failed.length ? 1 : 0);
