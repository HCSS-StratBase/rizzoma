#!/usr/bin/env node
/**
 * Reproduce: Ctrl+Enter inside a NESTED blip's editor (not topic root) — user
 * reports it does NOT open an inline new subblip the way the original Rizzoma
 * does. My sanity sweep only tested topic-root case.
 *
 * Drill to Depth-3 leaf A → click Edit → place cursor mid-text → Ctrl+Enter
 * → check what happens visually + structurally.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'https://dev.138-201-62-161.nip.io';
const topicId = '1a94345b983b3a1c78f2a2da1a02a5aa';
const ownerEmail = 'try-owner+try-1777937672763@example.com';
const ownerPassword = 'Try!Owner-try-1777937672763';
const outDir = '/mnt/c/Rizzoma/screenshots/260505-nested-ctrl-enter-repro';

const log = m => console.log(`[nested-repro] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureAuth(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    const login = await fetch('/api/auth/login', { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ email, password }) });
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

async function clickMarker(page, label) {
  // JS dispatchEvent — Playwright .click() can stall on actionability checks
  // when the marker is inside a contenteditable=false host span.
  const found = await page.evaluate((label) => {
    for (const li of document.querySelectorAll('.blip-text li')) {
      const t = (li.textContent || '').trim();
      if (t.startsWith(label)) {
        const m = li.querySelector('.blip-thread-marker[data-blip-thread]');
        if (!m) continue;
        const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        m.dispatchEvent(evt);
        return { id: m.getAttribute('data-blip-thread') };
      }
    }
    return null;
  }, label);
  await sleep(500);
  return found;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  page.on('console', m => {
    const txt = m.text();
    if (txt.includes('createInlineChildBlip') || txt.includes('createChildBlip') || txt.includes('Mod-Enter') || txt.includes('canComment') || txt.toLowerCase().includes('error')) {
      console.log(`[browser ${m.type()}] ${txt.slice(0, 200)}`);
    }
  });
  page.on('request', r => {
    if (r.url().endsWith('/api/blips') && r.method() === 'POST') {
      console.log(`[req] POST ${r.url()} body=${(r.postData() || '').slice(0, 200)}`);
    }
  });
  page.on('response', async r => {
    if (r.url().endsWith('/api/blips') && r.request().method() === 'POST') {
      const status = r.status();
      let body = '';
      try { body = (await r.text()).slice(0, 300); } catch {}
      console.log(`[resp] POST /api/blips → ${status} body=${body}`);
    }
  });
  page.on('pageerror', e => console.log(`[pageerror] ${String(e).slice(0, 200)}`));
  await ensureAuth(page);
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await sleep(1500);

  log('Drill to depth 3');
  await clickMarker(page, 'First label by Claude');
  await clickMarker(page, 'Subblip 1.A');
  await clickMarker(page, 'Depth-2 child A');
  await sleep(700);
  await shot(page, '00-depth-3-visible.png');

  // Activate Depth-3 leaf A
  await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll('.blip-text li'));
    const target = lis.find(li => (li.textContent || '').startsWith('Depth-3 leaf'));
    const c = target?.closest('.blip-container');
    c?.setAttribute('data-mcp-d3', '1');
    c?.querySelector(':scope .blip-text')?.setAttribute('data-mcp-d3-text', '1');
  });
  await page.locator('[data-mcp-d3-text="1"]').click({ force: true });
  await sleep(500);
  await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-d3="1"]');
    const editBtn = Array.from(c?.querySelectorAll(':scope > .blip-menu-container button') || []).find(b => (b.textContent || '').trim() === 'Edit');
    if (editBtn) editBtn.setAttribute('data-mcp-edit-d3', '1');
  });
  await page.locator('[data-mcp-edit-d3="1"]').click({ force: true });
  await sleep(700);
  await shot(page, '01-d3-edit-mode.png');

  // BEFORE Ctrl+Enter — count children
  const before = await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-d3="1"]');
    const allDescendantBlips = c?.querySelectorAll('.blip-container').length;
    const innerBlips = c?.querySelectorAll(':scope .inline-child-edit-mode').length;
    return { allDescendantBlips, innerBlips };
  });
  log('BEFORE: ' + JSON.stringify(before));

  // Place cursor mid-text in the editor
  const cursorPlacement = await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-d3="1"]');
    const pm = c?.querySelector(':scope .ProseMirror');
    if (!pm) return { error: 'no PM' };
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let n; let target;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').includes('Depth-3 leaf B')) target = n;
    }
    if (!target) return { error: 'no D3-B text' };
    const range = document.createRange();
    range.selectNodeContents(target); range.collapse(false);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    pm.focus();
    return {
      ok: true,
      activeElement: document.activeElement?.className,
      pmContenteditable: pm.getAttribute('contenteditable'),
      pmFocused: pm === document.activeElement || pm.contains(document.activeElement),
    };
  });
  log('CURSOR: ' + JSON.stringify(cursorPlacement));
  await sleep(300);

  // Fire Ctrl+Enter
  await page.keyboard.press('Control+Enter');
  await sleep(2500);
  await shot(page, '02-after-ctrl-enter.png');

  // AFTER — count children + check editor + check whether new child rendered
  const after = await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-d3="1"]');
    const editorEditMode = c?.querySelectorAll(':scope > .blip-content > .blip-editor-container').length;
    const innerEditMode = c?.querySelectorAll('.inline-child-edit-mode').length;
    const allInlineChildExpanded = c?.querySelectorAll('.inline-child-expanded').length;
    const allDescendantBlips = c?.querySelectorAll('.blip-container').length;
    // Check if any new child exists with empty body
    const newChildren = Array.from(c?.querySelectorAll('.blip-container') || []).filter(b => {
      const ed = b.querySelector(':scope .ProseMirror');
      const t = ed?.textContent || '';
      return t.length === 0 || t === ' ';
    });
    return {
      editorEditMode,
      innerEditMode,
      allInlineChildExpanded,
      allDescendantBlips,
      newEmptyChildren: newChildren.length,
      newChildBlipIds: newChildren.map(b => b.getAttribute('data-blip-id')),
    };
  });
  log('AFTER: ' + JSON.stringify(after, null, 2));

  // Look at parent (D3) editor's content — was a marker inserted?
  const editorState = await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-d3="1"]');
    const pm = c?.querySelector(':scope .ProseMirror');
    return {
      pmHTML: pm?.innerHTML.slice(0, 600),
      markerCount: pm?.querySelectorAll('.blip-thread-marker[data-blip-thread]').length,
    };
  });
  log('EDITOR STATE: ' + JSON.stringify(editorState));

  await browser.close();
  log(`see ${outDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
