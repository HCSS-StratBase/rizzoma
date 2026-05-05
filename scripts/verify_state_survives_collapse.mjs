#!/usr/bin/env node
/**
 * Verify (b): draft text typed into a child blip's editor SURVIVES the
 * parent's collapse → re-expand cycle. This is the operational test of
 * "preserve-subtree-on-fold" — the React subtree is supposed to stay
 * mounted (just hidden via CSS) when the parent collapses, so any in-
 * progress edit state is retained.
 *
 * Test plan:
 *   1. Open Try topic, expand First label → Subblip 1.A → Depth-2 child A.
 *   2. Click Edit on Depth-3 leaf A (innermost expanded).
 *   3. Type "DRAFT-IN-PROGRESS-XYZ" into its editor.
 *   4. WITHOUT clicking Done, collapse the whole spine by clicking First label's [-].
 *   5. Re-expand First label by clicking [+].
 *   6. Drill back down to Depth-3 leaf A (now visible again).
 *   7. Verify the editor still shows "DRAFT-IN-PROGRESS-XYZ" — text survived.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'https://dev.138-201-62-161.nip.io';
const topicId = '1a94345b983b3a1c78f2a2da1a02a5aa';
const ownerEmail = 'try-owner+try-1777937672763@example.com';
const ownerPassword = 'Try!Owner-try-1777937672763';
const outDir = path.join('/mnt/c/Rizzoma/screenshots', '260505-state-survives-collapse');
const DRAFT = 'DRAFT-IN-PROGRESS-XYZ';

const log = m => console.log(`[state-survives] ${m}`);
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

async function clickMarker(page, label) {
  const found = await page.evaluate((label) => {
    for (const li of document.querySelectorAll('.blip-text li')) {
      const t = (li.textContent || '').trim();
      if (t.startsWith(label)) {
        const m = li.querySelector('.blip-thread-marker[data-blip-thread]');
        if (m) {
          m.setAttribute('data-mcp-click', '1');
          return { id: m.getAttribute('data-blip-thread'), wasExpanded: m.classList.contains('expanded') };
        }
      }
    }
    return null;
  }, label);
  if (!found) return null;
  await page.locator('.blip-thread-marker[data-mcp-click="1"]').first().click({ force: true, timeout: 5000 });
  await page.evaluate(() => document.querySelectorAll('[data-mcp-click="1"]').forEach(el => el.removeAttribute('data-mcp-click')));
  await sleep(400);
  return found;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();

  await ensureAuth(page);
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await sleep(1500);
  await shot(page, '00-initial.png');

  log('Step 1: drill to depth 3');
  await clickMarker(page, 'First label by Claude');
  await sleep(500);
  await clickMarker(page, 'Subblip 1.A');
  await sleep(500);
  await clickMarker(page, 'Depth-2 child A');
  await sleep(700);
  await shot(page, '01-depth-3-visible.png');

  log('Step 2: activate Depth-3 leaf A and click Edit');
  const activated = await page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll('.blip-text li'));
    const target = lis.find(li => (li.textContent || '').startsWith('Depth-3 leaf'));
    if (!target) return { error: 'no D3' };
    const c = target.closest('.blip-container');
    c?.setAttribute('data-mcp-d3', '1');
    c?.querySelector(':scope .blip-text')?.setAttribute('data-mcp-d3-text', '1');
    return { blipId: c?.getAttribute('data-blip-id') };
  });
  log('Depth-3 activated: ' + JSON.stringify(activated));
  await page.locator('[data-mcp-d3-text="1"]').click({ force: true });
  await sleep(500);
  await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-d3="1"]');
    const editBtn = Array.from(c?.querySelectorAll(':scope > .blip-menu-container button') || [])
      .find(b => (b.textContent || '').trim() === 'Edit');
    if (editBtn) editBtn.setAttribute('data-mcp-edit-d3', '1');
  });
  await page.locator('[data-mcp-edit-d3="1"]').click({ force: true });
  await sleep(700);
  await shot(page, '02-d3-edit-mode.png');

  log('Step 3: position cursor in Depth-3 editor and type DRAFT');
  const placed = await page.evaluate(() => {
    const c = document.querySelector('[data-mcp-d3="1"]');
    const pm = c?.querySelector(':scope .ProseMirror');
    if (!pm) return { error: 'no PM in D3' };
    pm.setAttribute('data-mcp-d3-pm', '1');
    // Place cursor at end of "Depth-3 leaf B" (last visible text node so insertion is clean)
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let n; let target;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').includes('Depth-3 leaf B')) target = n;
    }
    if (!target) return { error: 'no D3-B text' };
    const range = document.createRange();
    range.selectNodeContents(target); range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges(); sel?.addRange(range);
    pm.focus();
    return { ok: true, contenteditable: pm.getAttribute('contenteditable') };
  });
  log('Cursor placed: ' + JSON.stringify(placed));

  // Type DRAFT
  for (const ch of DRAFT) {
    await page.keyboard.press(ch);
  }
  await sleep(500);
  const beforeCollapse = await page.evaluate((draft) => {
    const c = document.querySelector('[data-mcp-d3="1"]');
    const pm = c?.querySelector(':scope .ProseMirror');
    return {
      bodyText: (pm?.textContent || ''),
      includesDraft: (pm?.textContent || '').includes(draft),
    };
  }, DRAFT);
  log('Body text after typing: "' + beforeCollapse.bodyText.slice(-100) + '"');
  log('Includes DRAFT: ' + beforeCollapse.includesDraft);
  await shot(page, '03-after-type.png');

  if (!beforeCollapse.includesDraft) {
    log('FAIL: typed text did not appear in editor (before collapse). Aborting.');
    await browser.close();
    process.exit(1);
  }

  log('Step 4: collapse First label WITHOUT clicking Done — Depth-3 stays in edit mode');
  await clickMarker(page, 'First label by Claude');
  await sleep(800);
  await shot(page, '04-collapsed.png');

  // Confirm wrapper still in DOM with display:none
  const collapsedState = await page.evaluate(() => {
    const root = document.querySelector('.blip-container.topic-root');
    const allEditModeWrappers = Array.from(root?.querySelectorAll('.inline-child-expanded.inline-child-collapsed') || []);
    const allMountedDeep = Array.from(root?.querySelectorAll('.inline-child-expanded')).map(d => ({
      child: d.getAttribute('data-inline-child'),
      collapsed: d.getAttribute('data-collapsed'),
      display: window.getComputedStyle(d).display,
      innerBlipCount: d.querySelectorAll('.blip-container').length,
    }));
    return { collapsedCount: allEditModeWrappers.length, allMountedDeep };
  });
  log('Collapsed wrappers: ' + JSON.stringify(collapsedState));

  log('Step 5: re-expand First label');
  await clickMarker(page, 'First label by Claude');
  await sleep(800);
  await shot(page, '05-re-expanded.png');

  log('Step 6: query Depth-3 editor again (it should still be in edit mode with DRAFT preserved)');
  const afterReExpand = await page.evaluate((draft) => {
    // Find the Depth-3 leaf A blip-container by data-blip-id (preserved across re-expand)
    const all = Array.from(document.querySelectorAll('.blip-container'));
    const d3 = all.find(b => {
      const view = b.querySelector(':scope .blip-text');
      const ed = b.querySelector(':scope .ProseMirror');
      return (ed || view) && (((ed || view).textContent || '').includes('Depth-3 leaf'));
    });
    if (!d3) return { error: 'no D3 after re-expand' };
    const pm = d3.querySelector(':scope .ProseMirror');
    const view = d3.querySelector(':scope .blip-text');
    return {
      hasEditor: !!pm,
      hasViewMode: !!view && !pm,
      bodyText: (pm || view)?.textContent || '',
      stillIncludesDraft: ((pm || view)?.textContent || '').includes(draft),
    };
  }, DRAFT);
  log('After re-expand: ' + JSON.stringify(afterReExpand, null, 2));

  await browser.close();

  if (afterReExpand.stillIncludesDraft) {
    log('✅ STATE PRESERVED: DRAFT text "' + DRAFT + '" survived collapse → re-expand');
    process.exit(0);
  } else {
    log('❌ STATE LOST: DRAFT text "' + DRAFT + '" did NOT survive collapse → re-expand');
    log('  body text after re-expand: "' + afterReExpand.bodyText.slice(0, 200) + '"');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(2); });
