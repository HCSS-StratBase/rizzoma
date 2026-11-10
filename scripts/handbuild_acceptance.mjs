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
// Test-account credentials come from the environment, never from source.
const EMAIL = process.env.HB_EMAIL;
const PASS = process.env.HB_PASS;
if (!EMAIL || !PASS) {
  console.error('[acc] set HB_EMAIL and HB_PASS (test account on the target host) before running');
  process.exit(2);
}

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
// The topic toolbar was redesigned into the shared BlipMenu (.wave-panel);
// the old topic-tb-btn selector made this step fail on every run since, so
// L1 was never typed and every later level was measured on a wrong start.
await page.locator('.wave-panel [data-testid="blip-menu-edit"], button.topic-tb-btn:has-text("Edit")').first().click({ timeout: 10000 })
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
// Hand-off check (2026-11-10, replaces "editable+focused 1.1 s after Ctrl+Enter"
// and "the label appears anywhere on the page"). A user presses Ctrl+Enter and
// TYPES AT ONCE, as in the original Rizzoma, where the child was created and
// focused synchronously. So: press Ctrl+Enter, type immediately, then require
//   (a) the label ends up inside a NEW blip (not one that existed before),
//   (b) no fragment of it lands in an existing blip (the parent),
//   (c) the cursor is inside that new blip afterwards,
// and record the time until the label is visible there. The old checks hid
// both failure modes: "focused" accepted ANY editor and "landed" searched the
// whole page, so text typed into the parent passed.
const HANDOFF_MAX_MS = Number(process.env.HB_HANDOFF_MAX_MS || 3000);
const handoffMs = [];
const blipIdsNow = () => page.evaluate(() =>
  Array.from(new Set(Array.from(document.querySelectorAll('[data-blip-id]')).map(e => e.getAttribute('data-blip-id')))));
const handoff = async (label, name) => {
  const before = await blipIdsNow();
  const t0 = Date.now();
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type(label, { delay: 25 });
  const probe = () => page.evaluate(({ label, before }) => {
    const old = new Set(before);
    // A fragment specific to THIS label ("L2 la", "L3b ch"): the parent may
    // legitimately hold "L3b sibling", which shares "L3b " with "L3b child".
    const tag = label.slice(0, label.indexOf(' ') + 3);
    let owner = null; let stray = false;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const v = n.nodeValue || '';
      const id = n.parentElement?.closest('[data-blip-id]')?.getAttribute('data-blip-id') || null;
      if (v.includes(label) && id && !old.has(id)) owner = id;
      else if ((v.includes(tag) || v.includes(label)) && id && old.has(id)) stray = true;
    }
    const focusId = document.activeElement?.closest?.('[data-blip-id]')?.getAttribute('data-blip-id') || null;
    return { owner, stray, focusInOwner: Boolean(owner && focusId === owner) };
  }, { label, before });
  let r = await probe();
  while (!r.owner && Date.now() - t0 < HANDOFF_MAX_MS) { await sleep(100); r = await probe(); }
  const ms = Date.now() - t0;
  await sleep(1200);                                  // let late remounts show up
  const settled = await probe();
  // App-side timeline (ms after the keypress): posted, added, mounted,
  // editable, flushed, focused. Separates the app's time from this gate's
  // own typing and whole-page polling cost, which grows with the DOM.
  const trace = await page.evaluate(() => (window.__rizzomaHandoffTrace || {}).marks || null);
  await step(name);
  return { ...settled, ms: r.owner ? ms : null, trace };
};
const BRANCH_AT = [3, 6];
for (let d = 2; d <= DEPTH; d++) {
  const h = await handoff(`L${d} label`, `ctrl-enter-typed-L${d}`);
  if (h.ms !== null) handoffMs.push({ d, ms: h.ms, app: h.trace?.focused ?? h.trace?.flushed ?? null });
  log(`L${d} hand-off: ${h.ms === null ? `NOT within ${HANDOFF_MAX_MS} ms` : `${h.ms} ms`} owner=${h.owner ? h.owner.slice(-6) : '-'} stray=${h.stray} focusInChild=${h.focusInOwner} app=${JSON.stringify(h.trace)}`);
  gate(`L${d}: typing right after Ctrl+Enter lands in a NEW child within ${HANDOFF_MAX_MS} ms`, h.ms !== null,
    h.ms === null ? `not within budget${h.owner ? ' (landed later)' : ''}` : `${h.ms} ms`);
  gate(`L${d}: nothing typed lands in the parent`, !h.stray);
  gate(`L${d}: the cursor stays in the new child`, h.focusInOwner);
  if (!h.owner || !h.focusInOwner) break;

  // BRANCH: sibling LINE in the same blip + its own child (BLIP between LINEs)
  if (BRANCH_AT.includes(d)) {
    await page.keyboard.press('Enter');
    await page.keyboard.type(`L${d}b sibling`, { delay: 25 });
    await step(`typed-L${d}b-sibling`);
    const hb = await handoff(`L${d}b child`, `ctrl-enter-typed-L${d}b-child`);
    log(`L${d}b hand-off: ${hb.ms === null ? 'NOT within budget' : `${hb.ms} ms`} stray=${hb.stray} focusInChild=${hb.focusInOwner}`);
    gate(`L${d}b: sibling-line Ctrl+Enter: typing lands in a NEW child, not the parent`, Boolean(hb.owner) && !hb.stray,
      `owner=${hb.owner ? 'new' : '-'} stray=${hb.stray}`);
    if (hb.owner) {
      // return the caret to the spine child so the descent continues from L{d}
      await page.evaluate(t => {
        // The editor that OWNS the label: with parents kept in edit mode an
        // ancestor editor also contains the text (the child renders inside
        // it), and picking the first match put the caret in L2, so L4 and L7
        // were built under L2 instead of the spine.
        let spine = null;
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if ((n.nodeValue || '').includes(t)) { spine = n.parentElement?.closest('.ProseMirror'); if (spine) break; }
        }
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

// ---------- infinitely fractal: hand-off time must not grow with depth ----------
log(`hand-off ms by level: ${handoffMs.map(h => `L${h.d}=${h.ms}`).join(' ')}`);
log(`app-side hand-off ms (keypress to focused child) by level: ${handoffMs.map(h => `L${h.d}=${h.app}`).join(' ')}`);
if (handoffMs.length >= 4) {
  const ms = handoffMs.map(h => h.ms);
  const early = [...ms.slice(0, 3)].sort((a, b) => a - b)[1];
  const late = Math.max(...ms.slice(-3));
  gate('hand-off time is constant with depth (deepest 3 levels <= 1.5x early median + 400 ms)',
    late <= 1.5 * early + 400, `early median ${early} ms, deepest-3 max ${late} ms`);
}
gate(`reached the requested depth (${DEPTH})`, handoffMs.some(h => h.d === DEPTH));

// ---------- deep-nesting layout: where does each level's width go? ----------
// For each spine level, the label's blip box (left, width) and every element
// between it and the parent blip that adds horizontal space (margin, padding,
// border). Original Rizzoma lost ~32 px of width per level: 22 px bullet
// indent + 2+2 px border + 8+8 px editor margins, minus the -10 px right
// margin of .blips-container (blip.css, editor/renderer.coffee).
// Run in BOTH edit mode (while building) and view mode (after reload): the
// two render paths have different CSS, and view mode once lost ~87 px per
// level on the right that the edit-mode measurement could not see.
const measureLayout = async (mode) => {
  const geometry = await page.evaluate((depth) => {
    const boxOf = (label) => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if ((n.nodeValue || '').includes(label)) {
          const owner = n.parentElement?.closest('[data-blip-id]');
          if (owner) return owner;
        }
      }
      return null;
    };
    const px = (v) => Math.round(parseFloat(v) || 0);
    const rows = [];
    let prev = null;
    for (let d = 2; d <= depth; d++) {
      const el = boxOf(`L${d} label`);
      if (!el) break;
      const r = el.getBoundingClientRect();
      const chain = [];
      if (prev) {
        for (let a = el.parentElement; a && a !== prev; a = a.parentElement) {
          const cs = getComputedStyle(a);
          const l = px(cs.marginLeft) + px(cs.paddingLeft) + px(cs.borderLeftWidth);
          const rt = px(cs.marginRight) + px(cs.paddingRight) + px(cs.borderRightWidth);
          chain.push(`${a.tagName.toLowerCase()}.${(a.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')} w${Math.round(a.getBoundingClientRect().width)} L${l}/R${rt}`);
        }
      }
      const pr = prev ? prev.getBoundingClientRect() : null;
      rows.push({ d, left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
        gapL: pr ? Math.round(r.left - pr.left) : null, gapR: pr ? Math.round(pr.right - r.right) : null, chain });
      prev = el;
    }
    return rows;
  }, DEPTH);
  for (const g of geometry) {
    log(`layout[${mode}] L${g.d}: left=${g.left} right=${g.right} width=${g.width} inset L${g.gapL}/R${g.gapR}${g.d <= 4 ? ` chain: ${g.chain.join(' < ')}` : ''}`);
  }
  if (geometry.length >= 3) {
    // Median width step between consecutive levels, ignoring levels already
    // squeezed to a minimum width (those stop shrinking and would hide the cost).
    const steps = [];
    for (let i = 1; i < geometry.length; i++) {
      if (geometry[i].width > 100) steps.push(geometry[i - 1].width - geometry[i].width);
    }
    steps.sort((a, b) => a - b);
    const perLevel = steps.length ? steps[Math.floor(steps.length / 2)] : NaN;
    log(`layout[${mode}]: width lost per level (median) ${perLevel} px (original Rizzoma ~32 px)`);
    gate(`${mode} mode: deep nesting costs no more width per level than original Rizzoma (median <= 35 px)`,
      perLevel <= 35, `${perLevel} px per level`);
  }
};
await measureLayout('edit');

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
    const nat = Array.from(document.querySelectorAll('.blip-thread.folded .fold-button, .blip-thread.folded .js-fold-button'))
      .filter(el => el.offsetParent !== null);
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
await measureLayout('view');
// House rule: layout is judged by eye at 1366 and 1600 px wide as well.
for (const w of [1366, 1600]) {
  await page.setViewportSize({ width: w, height: 950 });
  await sleep(800);
  await step(`fully-expanded-${w}px`);
}
await page.setViewportSize({ width: 1440, height: 950 });

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

// ---------- structure: the spine really nests (2026-11-10) ----------
// Each L(d) must live in a blip whose nearest ancestor blip holds L(d-1), and
// each L(d)b child under the blip holding L(d)b sibling. Labels present but
// hung off the wrong parent passed every earlier check (seen: L4 and L7 under
// L2 after a branch).
const nesting = await page.evaluate((depth) => {
  const ownerOf = (label) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if ((n.nodeValue || '').includes(label)) {
        const b = n.parentElement?.closest('[data-blip-id]');
        if (b) return b;
      }
    }
    return null;
  };
  const parentBlip = (el) => el?.parentElement?.closest('[data-blip-id]') || null;
  const bad = [];
  const pairs = [];
  for (let d = 2; d <= depth; d++) pairs.push([`L${d} label`, `L${d - 1} label`]);
  pairs.push(['L3b child', 'L3b sibling'], ['L6b child', 'L6b sibling']);
  for (const [child, parent] of pairs) {
    const c = ownerOf(child); const p = ownerOf(parent);
    if (!c || !p) continue;               // absence is reported by the persistence check
    if (parentBlip(c) !== p) {
      const actual = parentBlip(c);
      const actualText = (actual?.querySelector('li, p')?.textContent || '?').trim().slice(0, 20);
      bad.push(`${child} under "${actualText}" not "${parent}"`);
    }
  }
  return bad;
}, DEPTH);
gate('the fractal nests: every level is a child of the level above', nesting.length === 0,
  nesting.length ? nesting.join(' | ') : 'all levels nested correctly');

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
await page2.waitForSelector('.blip-thread, .blip-thread-marker', { timeout: 30000 });
await sleep(3000);
for (let i = 0; i < DEPTH + 8; i++) {
  const clicked = await page2.evaluate(() => {
    const nat = Array.from(document.querySelectorAll('.blip-thread.folded .fold-button, .blip-thread.folded .js-fold-button'))
      .filter(el => el.offsetParent !== null);
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
