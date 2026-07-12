#!/usr/bin/env node
/**
 * Verify (3) — anchorPosition value is no longer used for positioning.
 *
 * Test plan:
 *  1. Open Try topic, edit topic root, position cursor inside "Second" label.
 *  2. Ctrl+Enter → new inline child appears. Marker should be at cursor pos.
 *  3. THEN edit parent text BEFORE the marker (e.g. prepend "PREFIX " to
 *     "First label by Claude"). Reload.
 *  4. The marker for the child created in step 2 should still be at its
 *     STRUCTURAL location ("Second" + marker), NOT drifted to a different
 *     character offset.
 *  5. Verify the inline-child renders at its marker's location after reload.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'https://dev.138-201-62-161.nip.io';
const topicId = '1a94345b983b3a1c78f2a2da1a02a5aa';
const ownerEmail = 'try-owner+try-1777937672763@example.com';
const ownerPassword = 'Try!Owner-try-1777937672763';
const outDir = path.join('screenshots', '260505-anchor-drift-verify');

const log = m => console.log(`[drift] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureAuth(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    const login = await fetch('/api/auth/login', { method: 'POST', headers, credentials: 'include', body: JSON.stringify({email, password}) });
    return { ok: login.ok };
  }, { email: ownerEmail, password: ownerPassword });
  if (!r.ok) throw new Error('auth failed');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 20000 });
}

async function shot(page, name) {
  await fs.mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
  log(`captured ${name}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();

  await ensureAuth(page);
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await sleep(1500);

  // Inventory: how many markers does the topic root have BEFORE my action?
  const before = await page.evaluate(() => {
    const root = document.querySelector('.blip-container.topic-root');
    const markers = Array.from(root?.querySelectorAll('.blip-text .blip-thread-marker[data-blip-thread]') || []);
    return {
      markerIds: markers.map(m => m.getAttribute('data-blip-thread')),
      bodyText: (root?.querySelector('.blip-text')?.textContent || '').slice(0, 250),
    };
  });
  log('BEFORE: ' + JSON.stringify(before));
  await shot(page, '00-before.png');

  // Click topic-level Edit
  await page.evaluate(() => {
    const editBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Edit' && b.className.includes('topic-tb-btn'));
    if (editBtn) editBtn.click();
  });
  await sleep(700);

  // Position cursor at end of "Second" text (in the second LI)
  const placed = await page.evaluate(() => {
    const root = document.querySelector('.blip-container.topic-root');
    const pm = root?.querySelector('.ProseMirror');
    if (!pm) return { error: 'no PM' };
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let n; let target;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').includes('Second')) { target = n; break; }
    }
    if (!target) return { error: 'no Second text' };
    const idx = (target.nodeValue || '').indexOf('Second') + 'Second'.length;
    const range = document.createRange();
    range.setStart(target, idx); range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges(); sel?.addRange(range);
    pm.focus();
    return { ok: true, cursorAt: target.nodeValue.slice(0, idx) + '|' + target.nodeValue.slice(idx) };
  });
  log('CURSOR PLACEMENT: ' + JSON.stringify(placed));

  await page.keyboard.press('Control+Enter');
  await sleep(2000);
  await shot(page, '01-after-ctrl-enter.png');

  // Wait for save to commit (the parent's HTML gets the marker after auto-save debounce)
  await sleep(2000);

  // Click Done to leave edit mode
  await page.evaluate(() => {
    const doneBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Done' && b.className.includes('topic-tb-btn'));
    if (doneBtn) doneBtn.click();
  });
  await sleep(1500);
  await shot(page, '02-after-done.png');

  // Hard reload — fresh React tree, fresh data fetch
  await page.goto(`${baseUrl}/?layout=rizzoma&reset=drift#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await sleep(1500);
  await shot(page, '03-after-reload.png');

  // Inventory the rendered structure after reload
  const after = await page.evaluate(() => {
    const root = document.querySelector('.blip-container.topic-root');
    const lis = Array.from(root?.querySelectorAll('.blip-text > ul > li') || []);
    return {
      lis: lis.map(li => ({
        text: (li.textContent || '').slice(0, 80),
        markerIds: Array.from(li.querySelectorAll('.blip-thread-marker[data-blip-thread]')).map(m => m.getAttribute('data-blip-thread')),
      })),
    };
  });
  log('AFTER RELOAD: ' + JSON.stringify(after, null, 2));

  await browser.close();
  log('DONE — see screenshots/' + outDir);
}

main().catch(e => { console.error(e); process.exit(1); });
