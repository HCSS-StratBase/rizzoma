#!/usr/bin/env node
/**
 * Build a fresh Try topic in the NEW Rizzoma step-by-step via Ctrl+Enter,
 * matching the same flow I used on rizzoma.com (the OLD legacy editor):
 *
 *   00 — fresh blank Try topic (just title)
 *   01 — Edit topic root, type 3 bulleted labels
 *   02 — Done editing, view the 3 collapsed labels
 *   03 — Click [+] on First label → expanded child blank slot
 *   04 — Edit that child, type "Subblip 1.A" + "Subblip 1.B" bulleted
 *   05 — Done; view depth-1 expanded
 *   06 — Click Edit on Subblip 1.A's child... no, Ctrl+Enter on Subblip 1.A's text
 *        to create depth-2 child
 *   07-15 — depth-2 → depth-10 each via Ctrl+Enter inline
 *   16 — Final view-mode of full depth-10 cascade
 *   17 — Cascade vs original side-by-side
 *
 * Compare against /mnt/c/Rizzoma/screenshots/260505-rizzoma-com-vs-mine/00-17.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'https://dev.138-201-62-161.nip.io';
const ownerEmail = 'try-owner+try-1777937672763@example.com';
const ownerPassword = 'Try!Owner-try-1777937672763';
const outDir = '/mnt/c/Rizzoma/screenshots/260505-new-rizzoma-try-stepbystep';
const TITLE = 'Try (NEW Rizzoma stepbystep)';

const log = m => console.log(`[step] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function shot(page, file) {
  await fs.mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, file), fullPage: true });
  log(`captured ${file}`);
}

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

async function api(page, method, path, body) {
  const token = await page.evaluate(() => {
    const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
    return raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  });
  const r = await page.evaluate(async ({ method, path, body, token }) => {
    const resp = await fetch(path, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': token }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
    let data; try { data = await resp.json(); } catch { data = await resp.text(); }
    return { ok: resp.ok, status: resp.status, data };
  }, { method, path, body, token });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function clickMarkerByJS(page, label) {
  return page.evaluate((label) => {
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
}

async function activateBlipByLabel(page, labelPrefix) {
  return page.evaluate((labelPrefix) => {
    const lis = Array.from(document.querySelectorAll('.blip-text li'));
    const target = lis.find(li => (li.textContent || '').startsWith(labelPrefix));
    if (!target) return null;
    const c = target.closest('.blip-container');
    c?.setAttribute('data-mcp-active', '1');
    c?.querySelector(':scope .blip-text')?.setAttribute('data-mcp-active-text', '1');
    return { blipId: c?.getAttribute('data-blip-id') };
  }, labelPrefix);
}

async function clickEditOnActive(page) {
  await page.locator('[data-mcp-active-text="1"]').click({ force: true });
  await sleep(500);
  await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-active="1"]');
    const editBtn = Array.from(c?.querySelectorAll(':scope > .blip-menu-container button') || [])
      .find(b => (b.textContent || '').trim() === 'Edit');
    if (editBtn) editBtn.setAttribute('data-mcp-edit-active', '1');
  });
  await page.locator('[data-mcp-edit-active="1"]').click({ force: true });
  await sleep(700);
  await page.evaluate(() => {
    document.querySelectorAll('[data-mcp-active], [data-mcp-active-text], [data-mcp-edit-active]').forEach(el => {
      el.removeAttribute('data-mcp-active');
      el.removeAttribute('data-mcp-active-text');
      el.removeAttribute('data-mcp-edit-active');
    });
  });
}

async function placeCursorAtEndOf(page, blipContainerSelector, textIncludes) {
  return page.evaluate(({ sel, txt }) => {
    const c = document.querySelector(sel);
    const pm = c?.querySelector(':scope .ProseMirror');
    if (!pm) return { error: 'no PM' };
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let n; let target;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').includes(txt)) target = n;
    }
    if (!target) return { error: `no text "${txt}"` };
    const range = document.createRange();
    range.selectNodeContents(target); range.collapse(false);
    const sel2 = window.getSelection(); sel2?.removeAllRanges(); sel2?.addRange(range);
    pm.focus();
    return { ok: true };
  }, { sel: blipContainerSelector, txt: textIncludes });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1100 } });
  const page = await ctx.newPage();
  page.on('console', m => {
    const t = m.text();
    if (t.toLowerCase().includes('error') || t.includes('createChildBlip')) {
      console.log(`[browser] ${t.slice(0, 200)}`);
    }
  });
  await ensureAuth(page);

  // ─── Step 0: create a fresh blank Try topic via API ───
  log('Step 0: create fresh blank Try topic');
  const topic = await api(page, 'POST', '/api/topics', {
    title: TITLE,
    content: `<h1>${TITLE}</h1>`,
  });
  const topicId = topic.id;
  log(`new topic: ${topicId}`);
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await sleep(1500);
  await shot(page, '00-fresh-topic.png');

  // ─── Step 1: Edit topic root, add 3 bulleted labels ───
  log('Step 1: Edit topic root and type 3 labels');
  await page.evaluate(() => {
    const editBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Edit' && b.className.includes('topic-tb-btn'));
    if (editBtn) editBtn.click();
  });
  await sleep(700);
  await shot(page, '01-topic-root-edit.png');

  // Place cursor at end of <h1>Try</h1> content (after the title text)
  await page.evaluate(() => {
    const root = document.querySelector('.blip-container.topic-root');
    const pm = root?.querySelector(':scope .ProseMirror');
    if (!pm) return;
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let last; let n;
    while ((n = walker.nextNode())) last = n;
    if (!last) return;
    const range = document.createRange();
    range.selectNodeContents(last); range.collapse(false);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    pm.focus();
  });
  // New paragraph after title, then bullet list
  await page.keyboard.press('Enter');
  await sleep(150);
  // Toggle bulleted list via TipTap shortcut Ctrl+Shift+8
  await page.keyboard.press('Control+Shift+8');
  await sleep(200);
  for (const text of ['First label by Claude', 'Second label by Claude', 'Third label by Claude']) {
    for (const ch of text) await page.keyboard.press(ch.length === 1 ? ch : ch);
    await page.keyboard.press('Enter');
    await sleep(150);
  }
  await sleep(500);
  await shot(page, '02-three-labels-typed.png');

  // Click Done
  await page.evaluate(() => {
    const doneBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Done' && b.className.includes('topic-tb-btn'));
    if (doneBtn) doneBtn.click();
  });
  await sleep(1500);
  await shot(page, '03-after-done-three-labels.png');

  // ─── Step 2: drill via Ctrl+Enter — depth 1 through 10 ───
  // For each depth d:
  //   - Activate the parent blip (or topic root for d=1)
  //   - Click Edit
  //   - Position cursor at end of "Depth-(d-1) leaf A" (or "First label by Claude" for d=1)
  //   - Ctrl+Enter → new child created inline
  //   - Type its bulleted contents: labelA + Enter + labelB
  //   - Click Done on that child, leaving parent's edit if needed
  // For maximum reliability, after each depth re-navigate to topic and drill back.

  const labelA = (d) => d === 1 ? 'Subblip 1.A' : (d === 2 ? 'Depth-2 child A' : `Depth-${d} leaf A`);
  const labelB = (d) => d === 1 ? 'Subblip 1.B' : (d === 2 ? 'Depth-2 leaf B' : `Depth-${d} leaf B`);

  log('Step 3: depth 1 — Ctrl+Enter on First label');
  // Activate topic root + Edit (already done above, but Done was clicked. Re-edit.)
  await page.evaluate(() => {
    const editBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Edit' && b.className.includes('topic-tb-btn'));
    if (editBtn) editBtn.click();
  });
  await sleep(700);
  // Place cursor at end of "First label by Claude"
  await placeCursorAtEndOf(page, '.blip-container.topic-root', 'First label by Claude');
  await sleep(200);
  await page.keyboard.press('Control+Enter');
  await sleep(2500);
  await shot(page, `04-depth-1-after-ctrl-enter.png`);

  // Find the new empty child + type labels
  const d1 = await page.evaluate(() => {
    const newOnes = Array.from(document.querySelectorAll('.blip-container.nested-blip')).filter(b => {
      const ed = b.querySelector(':scope .ProseMirror');
      return ed && (ed.textContent || '').trim().length === 0;
    });
    if (!newOnes.length) return { error: 'no new child' };
    const t = newOnes[0];
    t.setAttribute('data-mcp-d1', '1');
    return { id: t.getAttribute('data-blip-id') };
  });
  log(`depth-1 child: ${JSON.stringify(d1)}`);
  // Type Subblip 1.A
  for (const ch of labelA(1)) await page.keyboard.press(ch);
  await page.keyboard.press('Enter');
  for (const ch of labelB(1)) await page.keyboard.press(ch);
  await sleep(500);
  await shot(page, `05-depth-1-typed.png`);

  // Done (this child's editor)
  await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-d1="1"]');
    const doneBtn = Array.from(c?.querySelectorAll(':scope > .blip-menu-container button') || [])
      .find(b => (b.textContent || '').trim() === 'Done');
    if (doneBtn) doneBtn.click();
  });
  await sleep(1500);
  // Done on topic too
  await page.evaluate(() => {
    const doneBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Done' && b.className.includes('topic-tb-btn'));
    if (doneBtn) doneBtn.click();
  });
  await sleep(1500);
  await shot(page, `06-depth-1-done.png`);

  // ─── Loop depth 2 → 10 ───
  let parentLabel = labelA(1); // 'Subblip 1.A'
  for (let d = 2; d <= 10; d += 1) {
    log(`Step depth ${d}: drill into ${parentLabel}, Ctrl+Enter, type ${labelA(d)} / ${labelB(d)}`);
    // Re-nav fresh
    await page.goto(`${baseUrl}/?layout=rizzoma&reset=d${d}#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
    await sleep(1500);
    // Drill via marker clicks
    await clickMarkerByJS(page, 'First label by Claude');
    await sleep(500);
    for (let k = 1; k < d - 1; k += 1) {
      const ll = labelA(k);
      await clickMarkerByJS(page, ll);
      await sleep(500);
    }
    // Now activate parentLabel's blip + Edit
    const acted = await activateBlipByLabel(page, parentLabel);
    if (!acted?.blipId) { log(`  cannot find ${parentLabel}; abort`); break; }
    await clickEditOnActive(page);
    // Place cursor at end of parentLabel text inside the now-active editor
    const edited = await placeCursorAtEndOf(page, '.blip-container.active', parentLabel);
    if (!edited?.ok) { log(`  cursor placement failed: ${JSON.stringify(edited)}`); }
    await sleep(300);
    await page.keyboard.press('Control+Enter');
    await sleep(2500);
    await shot(page, `${String(5 + d).padStart(2, '0')}-depth-${String(d).padStart(2, '0')}-after-ctrl-enter.png`);
    // Find new child + type
    const dnew = await page.evaluate(() => {
      const newOnes = Array.from(document.querySelectorAll('.blip-container.nested-blip')).filter(b => {
        const ed = b.querySelector(':scope .ProseMirror');
        return ed && (ed.textContent || '').trim().length === 0;
      });
      if (!newOnes.length) return null;
      const t = newOnes[0];
      t.setAttribute('data-mcp-dnew', '1');
      return { id: t.getAttribute('data-blip-id') };
    });
    if (!dnew) { log(`  no new child created for depth ${d}; abort`); break; }
    for (const ch of labelA(d)) await page.keyboard.press(ch);
    await page.keyboard.press('Enter');
    for (const ch of labelB(d)) await page.keyboard.press(ch);
    await sleep(500);
    await shot(page, `${String(5 + d).padStart(2, '0')}b-depth-${String(d).padStart(2, '0')}-typed.png`);
    parentLabel = labelA(d);
  }

  // ─── Final view ───
  await page.goto(`${baseUrl}/?layout=rizzoma&reset=final#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await sleep(1500);
  await shot(page, '99-final-collapsed.png');
  // Expand spine all the way
  await clickMarkerByJS(page, 'First label by Claude');
  await sleep(500);
  for (let k = 1; k <= 9; k += 1) {
    await clickMarkerByJS(page, labelA(k));
    await sleep(500);
  }
  await sleep(1000);
  await shot(page, '99-final-spine-expanded.png');

  log(`DONE — ${outDir}`);
  log(`topic id: ${topicId}`);
  log(`URL: ${baseUrl}/?layout=rizzoma#/topic/${topicId}`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
