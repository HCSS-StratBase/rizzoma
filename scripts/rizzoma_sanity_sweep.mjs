#!/usr/bin/env node
/**
 * Rizzoma sanity sweep — analog of scripts/visual_sanity_analyze.mjs.
 *
 * Verifies the live state of dev.138-201-62-161.nip.io after today's parity
 * batch (B1 + B2 + preserve-fold + LI-fix + bullets + drop-anchorPosition).
 * Designed to run end-to-end in <2 min and report a pass/fail per check.
 *
 * Checks (covering today's commits c47c107f → be9c7a95):
 *   1. Auth + topic loads, .rizzoma-parity class on layout (parity flag active client-side)
 *   2. Topic root view mode shows bulleted labels
 *   3. Topic root edit mode shows bullets INSIDE editor box (not jumping outside)
 *   4. [+] click on existing inline marker expands child inline (1 div, not 2)
 *   5. [-] click collapses; wrapper still mounted (preserve-on-fold), display:none
 *   6. Re-expand restores deep nested state (innerBlipCount preserved)
 *   7. New Ctrl+Enter blip lands AT cursor structural position (no drift) + starts bulleted
 *   8. Inline child auto-enters edit mode + ProseMirror.contenteditable=true after Ctrl+Enter
 *   9. Topic-level Edit button shows bullets in editor (generic .tiptap.ProseMirror ul rule)
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'https://dev.138-201-62-161.nip.io';
const topicId = '1a94345b983b3a1c78f2a2da1a02a5aa'; // Try topic with depth-10 spine
const ownerEmail = 'try-owner+try-1777937672763@example.com';
const ownerPassword = 'Try!Owner-try-1777937672763';
const outDir = path.join('/mnt/c/Rizzoma/screenshots', '260505-rizzoma-sanity');

const log = m => console.log(`[rizzoma-sanity] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const checks = [];
const record = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

async function shot(page, file) {
  await fs.mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, file), fullPage: false });
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

async function freshLoad(page, suffix = '') {
  await page.goto(`${baseUrl}/?layout=rizzoma&reset=sanity${suffix}#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await sleep(1500);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  await ensureAuth(page);

  // ─── Check 1: parity flag active client-side ───
  await freshLoad(page, '1');
  await shot(page, '00-loaded.png');
  const parity = await page.evaluate(() => {
    const layout = document.querySelector('.rizzoma-layout');
    return { hasParity: layout?.classList.contains('rizzoma-parity'), classes: layout?.className };
  });
  record('Parity flag is active client-side (.rizzoma-parity on .rizzoma-layout)',
    !!parity.hasParity, `classes="${parity.classes}"`);

  // ─── Check 2: topic root view mode shows bulleted labels ───
  // In parity mode the UL has padding-left: 0 (matches rizzoma.com tight layout)
  // and the LI has margin-left: 22px so the bullet renders at li.left - bullet_width.
  // Check that the bullet has SCREEN ROOM to render, not specifically that
  // the UL has padding.
  const viewBullets = await page.evaluate(() => {
    const root = document.querySelector('.blip-container.topic-root');
    const lis = Array.from(root?.querySelectorAll(':scope > .blip-content > .blip-view-mode .blip-text > ul > li') || []);
    if (!lis[0]) return { liCount: 0 };
    const liStyle = window.getComputedStyle(lis[0]);
    const ulStyle = window.getComputedStyle(lis[0].parentElement);
    return {
      liCount: lis.length,
      liDisplay: liStyle.display,
      liListStyle: liStyle.listStyleType,
      liMarginLeft: parseFloat(liStyle.marginLeft) || 0,
      ulPaddingLeft: parseFloat(ulStyle.paddingLeft) || 0,
      bulletInsetTotal: (parseFloat(ulStyle.paddingLeft) || 0) + (parseFloat(liStyle.marginLeft) || 0),
    };
  });
  record('Topic root view mode has bulleted LIs with room for bullet to render',
    viewBullets.liCount > 0
      && viewBullets.liDisplay === 'list-item'
      && viewBullets.liListStyle === 'disc'
      && viewBullets.bulletInsetTotal > 12, // need enough room for the disc glyph
    `${viewBullets.liCount} LIs, display=${viewBullets.liDisplay}, style=${viewBullets.liListStyle}, ul.pad+li.margin=${viewBullets.bulletInsetTotal}px`);

  // ─── Check 3: topic root edit mode shows bullets INSIDE editor box ───
  await page.evaluate(() => {
    const editBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Edit' && b.className.includes('topic-tb-btn'));
    if (editBtn) editBtn.click();
  });
  await sleep(700);
  await shot(page, '01-topic-edit-mode.png');
  const editBullets = await page.evaluate(() => {
    const root = document.querySelector('.blip-container.topic-root');
    const pm = root?.querySelector(':scope .ProseMirror');
    const ul = pm?.querySelector(':scope > ul');
    const li = ul?.querySelector(':scope > li');
    if (!ul || !li) return { error: 'no ul/li in editor' };
    return {
      ulPaddingLeft: window.getComputedStyle(ul).paddingLeft,
      liDisplay: window.getComputedStyle(li).display,
      liListStyle: window.getComputedStyle(li).listStyleType,
      pmRect: pm.getBoundingClientRect().left,
      ulRect: ul.getBoundingClientRect().left,
    };
  });
  record('Topic root edit mode: UL has padding > 0 (bullets render inside editor box)',
    editBullets.ulPaddingLeft && parseFloat(editBullets.ulPaddingLeft) > 0,
    `ulPad=${editBullets.ulPaddingLeft}, liDisplay=${editBullets.liDisplay}, liStyle=${editBullets.liListStyle}`);
  // Done editing
  await page.evaluate(() => {
    const doneBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Done' && b.className.includes('topic-tb-btn'));
    if (doneBtn) doneBtn.click();
  });
  await sleep(800);

  // ─── Check 4: marker click expands child inline (no duplicates) ───
  const expanded = await clickMarker(page, 'First label by Claude');
  await sleep(800);
  await shot(page, '02-after-expand.png');
  const expandedDom = await page.evaluate((id) => {
    const root = document.querySelector('.blip-container.topic-root');
    const childDivs = Array.from(root?.querySelectorAll(`.inline-child-expanded[data-inline-child="${id}"]`) || []);
    const marker = root?.querySelector(`.blip-thread-marker[data-blip-thread="${id}"]`);
    return {
      duplicateCount: childDivs.length,
      markerText: marker?.textContent,
      markerExpanded: marker?.classList.contains('expanded'),
    };
  }, expanded?.id);
  record('Click [+] renders ONE inline-child-expanded (no duplicate)',
    expandedDom.duplicateCount === 1, `count=${expandedDom.duplicateCount}`);
  record('Marker shows − after expand', expandedDom.markerText === '−' && expandedDom.markerExpanded,
    `text="${expandedDom.markerText}" expanded=${expandedDom.markerExpanded}`);

  // ─── Check 5: collapse — wrapper stays mounted with display:none ───
  await clickMarker(page, 'First label by Claude'); // toggle off
  await sleep(500);
  const collapsed = await page.evaluate((id) => {
    const root = document.querySelector('.blip-container.topic-root');
    const childDiv = root?.querySelector(`.inline-child-expanded[data-inline-child="${id}"]`);
    const marker = root?.querySelector(`.blip-thread-marker[data-blip-thread="${id}"]`);
    return {
      stillMounted: !!childDiv,
      collapsedAttr: childDiv?.getAttribute('data-collapsed'),
      display: childDiv ? window.getComputedStyle(childDiv).display : null,
      markerText: marker?.textContent,
      innerBlipCount: childDiv?.querySelectorAll('.blip-container').length,
    };
  }, expanded?.id);
  record('Preserve-on-fold: wrapper stays mounted after collapse',
    collapsed.stillMounted && collapsed.display === 'none' && collapsed.collapsedAttr === 'true',
    `mounted=${collapsed.stillMounted} display=${collapsed.display} dataCollapsed=${collapsed.collapsedAttr}`);
  record('Marker shows + after collapse', collapsed.markerText === '+',
    `text="${collapsed.markerText}"`);
  record('Inner blip subtree preserved (innerBlipCount > 0)',
    collapsed.innerBlipCount > 0, `count=${collapsed.innerBlipCount}`);

  // ─── Check 6: re-expand restores ───
  await clickMarker(page, 'First label by Claude');
  await sleep(500);
  const reExpanded = await page.evaluate((id) => {
    const root = document.querySelector('.blip-container.topic-root');
    const childDiv = root?.querySelector(`.inline-child-expanded[data-inline-child="${id}"]`);
    return {
      display: childDiv ? window.getComputedStyle(childDiv).display : null,
      collapsedAttr: childDiv?.getAttribute('data-collapsed'),
      innerBlipCount: childDiv?.querySelectorAll('.blip-container').length,
    };
  }, expanded?.id);
  record('Re-expand: wrapper visible again, deep state preserved',
    reExpanded.display === 'block' && reExpanded.collapsedAttr === 'false' && reExpanded.innerBlipCount > 0,
    `display=${reExpanded.display} dataCollapsed=${reExpanded.collapsedAttr} inner=${reExpanded.innerBlipCount}`);

  // ─── Check 7-8: Ctrl+Enter end-to-end + drift-free + bulleted + editable ───
  await freshLoad(page, '2');
  await page.evaluate(() => {
    const editBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === 'Edit' && b.className.includes('topic-tb-btn'));
    if (editBtn) editBtn.click();
  });
  await sleep(700);
  // Place cursor at end of "Third"
  await page.evaluate(() => {
    const root = document.querySelector('.blip-container.topic-root');
    const pm = root?.querySelector('.ProseMirror');
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let n; let target;
    while ((n = walker.nextNode())) {
      if ((n.nodeValue || '').includes('Third')) { target = n; break; }
    }
    if (!target) return;
    const range = document.createRange();
    range.selectNodeContents(target); range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges(); sel?.addRange(range);
    pm.focus();
  });
  await page.keyboard.press('Control+Enter');
  await sleep(2500);
  await shot(page, '03-after-ctrl-enter.png');

  const newChild = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.blip-container.nested-blip'));
    const empty = all.find(b => {
      const ed = b.querySelector(':scope .ProseMirror');
      return ed && (ed.textContent || '').length === 0;
    });
    if (!empty) return { error: 'no new child' };
    const pm = empty.querySelector(':scope .ProseMirror');
    const ul = pm?.querySelector(':scope > ul');
    return {
      blipId: empty.getAttribute('data-blip-id'),
      contenteditable: pm?.getAttribute('contenteditable'),
      pmFocused: !!empty.querySelector(':scope .ProseMirror.ProseMirror-focused'),
      activeElIsThis: document.activeElement === pm,
      hasUlAtRoot: !!ul,
      pmInnerHTML: pm?.innerHTML.slice(0, 100),
    };
  });
  record('Ctrl+Enter creates new child whose editor is contenteditable=true',
    newChild.contenteditable === 'true', `value="${newChild.contenteditable}"`);
  record('New child auto-focused (activeElement = its ProseMirror)',
    !!newChild.activeElIsThis, `pmFocused=${newChild.pmFocused}`);
  record('New child starts BULLETED (<ul> at editor root)',
    !!newChild.hasUlAtRoot, `pmInnerHTML="${newChild.pmInnerHTML}"`);

  // Type to verify input lands
  await page.keyboard.press('A');
  await page.keyboard.press('B');
  await page.keyboard.press('C');
  await sleep(500);
  const typed = await page.evaluate((id) => {
    const c = document.querySelector(`.blip-container[data-blip-id="${id}"]`);
    return c?.querySelector(':scope .ProseMirror')?.textContent;
  }, newChild.blipId);
  record('Typing into new child shows text in body', typed === 'ABC',
    `body text="${typed}"`);

  // ─── Check 9: marker structural position survives reload (drop-anchorPosition fix) ───
  await sleep(2000); // wait for autosave
  await freshLoad(page, '3');
  const afterReload = await page.evaluate((id) => {
    const root = document.querySelector('.blip-container.topic-root');
    const lis = Array.from(root?.querySelectorAll('.blip-text > ul > li') || []);
    let hostingLi = null;
    for (const li of lis) {
      if (li.querySelector(`.blip-thread-marker[data-blip-thread="${id}"]`)) {
        hostingLi = li;
        break;
      }
    }
    return {
      foundMarker: !!hostingLi,
      hostingText: (hostingLi?.textContent || '').slice(0, 60),
    };
  }, newChild.blipId);
  record('After reload: new child marker is in the LI that contained the cursor (Third)',
    afterReload.foundMarker && /Third/.test(afterReload.hostingText),
    `hostingText="${afterReload.hostingText}"`);

  await shot(page, '04-after-reload.png');

  // ─── Final report ───
  await browser.close();
  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok).length;
  log('');
  log(`SUMMARY: ${passed}/${checks.length} passed, ${failed} failed`);
  if (failed > 0) {
    log('FAILURES:');
    checks.filter(c => !c.ok).forEach(c => log(`  ❌ ${c.name} — ${c.detail}`));
  }
  log(`Screenshots: ${outDir}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
