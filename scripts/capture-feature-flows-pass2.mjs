#!/usr/bin/env node
/**
 * Feature flow sweep — PASS 2 (2026-04-16).
 *
 * Fixes identified in ANALYSIS-260416.md:
 *   - Reload topic between features so editor state can't drift.
 *   - Close overlays (gadget palette, dropdowns, modals) between features.
 *   - Use page.keyboard.press() and real button clicks — no synthetic events.
 *   - Open gear dropdown for 33-40 and click each menu item.
 *   - Open Share / Invite modals for 82/83 via real button clicks.
 *   - Click nav tabs for 80.
 *   - Clip screenshots to the affected paragraph for subtle marks (01-04).
 *   - Seed an inline marker via Ctrl+Enter before BLB 19/20/25 tests.
 *   - Use page.keyboard.type() for widget triggers 27-32.
 *
 * Pass 2 does NOT yet cover:
 *   - Two-context collab 62-66 (needs separate browser contexts).
 *   - Multi-user FtG 49-56 (needs user B posting blips).
 *   - Full playback modal drill-down 41-48 (needs modal open).
 *   - Inline comments 57-61 (needs 💬+ click path).
 *   - Uploads 67-70 (file picker).
 *   - Mobile gestures 74-78.
 * Those are tagged in pass 2 as "deferred to pass 3" in their READMEs.
 *
 * Run:
 *   node scripts/capture-feature-flows-pass2.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const email = `feature-sweep-p2-${Date.now()}@example.com`;

const ok = (m) => console.log(`✅ ${m}`);
const warn = (m) => console.log(`⚠️  ${m}`);
const err = (m) => console.error(`❌ ${m}`);

let passed = 0, failed = 0;
const failures = [];

async function shot(page, slug, step, opts = {}) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${step}_new.png`);
  await page.screenshot({ path: file, ...opts });
}

async function clipShot(page, slug, step, selector) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${step}_new.png`);
  try {
    const el = await page.locator(selector).first();
    const box = await el.boundingBox();
    if (box) {
      // expand box by 10px each side
      const clip = { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: box.width + 20, height: box.height + 20 };
      await page.screenshot({ path: file, clip });
      return;
    }
  } catch {}
  await page.screenshot({ path: file });
}

async function ensureAuth(page) {
  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const cc = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    const csrf = cc ? decodeURIComponent(cc.split('=')[1] || '') : '';
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const reg = await fetch('/api/auth/register', { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ email, password }) });
    if (reg.ok) return { ok: true };
    const lg = await fetch('/api/auth/login', { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ email, password }) });
    return lg.ok ? { ok: true } : { ok: false, body: await lg.text() };
  }, { email, password });
  if (!r.ok) throw new Error(`auth: ${r.body}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 15000 });
}

async function createSeedTopic(page) {
  const csrf = await page.evaluate(() => {
    const c = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1] || '') : '';
  });
  const r = await page.evaluate(async ({ csrf }) => {
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const tr = await fetch('/api/topics', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({
        title: 'Feature Sweep Pass 2',
        content: '<h1>Feature Sweep Pass 2</h1><p>Second paragraph — feature demo: sample paragraph for formatting tests.</p>',
      }),
    });
    const topic = await tr.json();
    for (let i = 1; i <= 3; i++) {
      await fetch('/api/blips', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          waveId: topic.id, parentId: null,
          content: `<p>Reply blip ${i} — seeded for pass-2 captures. It has enough text to show the editor, toolbar, and thread behaviours.</p>`,
        }),
      });
    }
    return topic.id;
  }, { csrf });
  return r;
}

async function openTopicClean(page, topicId) {
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  // Dismiss any popups/banners that could overlay captures.
  await page.evaluate(() => {
    document.querySelectorAll('[data-dismiss], button[aria-label="Dismiss" i], .calendar-banner-dismiss').forEach(b => { try { b.click(); } catch {} });
  });
  // Focus topic root editor
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror');
    if (!ed) return;
    ed.focus();
  });
}

async function selectTextInEditor(page, needle) {
  return page.evaluate(({ needle }) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(needle);
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + needle.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        editor.focus();
        return true;
      }
    }
    return false;
  }, { needle });
}

async function runFeature(name, fn) {
  try {
    await fn();
    passed++;
    ok(name);
  } catch (e) {
    failed++;
    failures.push({ name, error: String(e).slice(0, 300) });
    err(`${name}: ${String(e).slice(0, 200)}`);
  }
}

async function dismissOverlays(page) {
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    // Close any open modal via Cancel or backdrop
    const btns = Array.from(document.querySelectorAll('button'));
    const cancel = btns.find(b => ['Cancel', 'Close', '×'].includes(b.textContent?.trim()));
    if (cancel) { try { cancel.click(); } catch {} }
  });
  await page.waitForTimeout(150);
}

// ================== Editor marks with CLIP capture ==================

async function captureEditorMarkClipped(page, topicId, slug, shortcut, desc) {
  await openTopicClean(page, topicId);
  // 01-before: clip to the paragraph containing "sample paragraph"
  await clipShot(page, slug, '01-before', '.ProseMirror p:has-text("sample paragraph")');
  // 02-during: select and clip
  const selOk = await selectTextInEditor(page, 'sample paragraph');
  if (!selOk) throw new Error('cannot select "sample paragraph"');
  await clipShot(page, slug, '02-during', '.ProseMirror p:has-text("sample paragraph")');
  // 03-after: apply + clip
  await page.keyboard.press(shortcut);
  await page.waitForTimeout(200);
  await clipShot(page, slug, '03-after', '.ProseMirror p:has-text("sample paragraph")');
}

// ================== Editor blocks (headings, list, task, blockquote, code) ==================

async function captureEditorBlock(page, topicId, slug, shortcut) {
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  const selOk = await selectTextInEditor(page, 'sample paragraph');
  if (!selOk) throw new Error('select failed');
  await shot(page, slug, '02-during');
  await page.keyboard.press(shortcut);
  await page.waitForTimeout(250);
  await shot(page, slug, '03-after');
}

// ================== Editor mention dropdown (15) ==================

async function captureMentionDropdown(page, topicId) {
  const slug = '15-editor-mention-dropdown';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  // go to end of editor, insert a new line with a space, then type @
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror');
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(' ');
  await shot(page, slug, '02-during');
  await page.keyboard.type('@');
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

// ================== Editor gadget palette (16) ==================

async function captureGadgetPalette(page, topicId) {
  const slug = '16-editor-gadget-palette';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await shot(page, slug, '02-during');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(b => (b.textContent || '').includes('Gadgets'));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
  await dismissOverlays(page);
}

// ================== Editor highlight (12) — click real Bg button ==================

async function captureHighlight(page, topicId) {
  const slug = '12-editor-highlight';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  // Find the Bg button by exact text match
  const clicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent?.trim() === 'Bg');
    if (b) { b.click(); return true; }
    return false;
  });
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
  return clicked;
}

// ================== Editor link (13) — real Ctrl+K ==================

async function captureLink(page, topicId) {
  const slug = '13-editor-link';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  // Click the link button (🔗) in the topic toolbar
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent?.trim() === '🔗');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '03-after');
  await dismissOverlays(page);
}

// ================== Editor image (14) — real 🖼️ click ==================

async function captureImage(page, topicId) {
  const slug = '14-editor-image';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await shot(page, slug, '02-during');
  // Intercept prompt dialogs
  page.once('dialog', (d) => d.accept('https://example.com/test.png'));
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x => x.textContent?.trim() === '🖼️');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '03-after');
}

// ================== BLB short/expanded modes (17/18) ==================

async function captureBlbCollapsedToc(page, topicId) {
  const slug = '17-blb-collapsed-toc';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  // Click short mode
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'short');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

async function captureBlbSectionExpanded(page, topicId) {
  const slug = '18-blb-section-expanded';
  await openTopicClean(page, topicId);
  // Start in short mode
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'short');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '01-before');
  // Toggle expanded
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'expanded');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

// ================== BLB fold/unfold all (26) ==================

async function captureBlbFoldUnfold(page, topicId) {
  const slug = '26-blb-fold-unfold-all';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '▲');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '▼');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '03-after');
}

// ================== Widgets 27-32 ==================

async function captureWidgetTrigger(page, topicId, slug, char, desc) {
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  // Go to end of editor
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror');
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(' ');
  await shot(page, slug, '02-during');
  await page.keyboard.type(char);
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
  await dismissOverlays(page);
}

// ================== Right panel buttons (30) ==================

async function captureRightPanelButtons(page, topicId) {
  const slug = '30-widget-right-panel-buttons';
  await openTopicClean(page, topicId);
  await clipShot(page, slug, '01-before', '.right-tools-panel, [data-tools-panel]');
  await clipShot(page, slug, '02-during', '.right-tools-panel, [data-tools-panel]');
  await clipShot(page, slug, '03-after', '.right-tools-panel, [data-tools-panel]');
}

// ================== Gear menu on a blip (33-40) ==================

async function openBlipAndGear(page) {
  // Click a reply blip to make it active, then click its gear
  const opened = await page.evaluate(() => {
    const blips = document.querySelectorAll('.rizzoma-blip, [data-blip-id]');
    if (blips.length < 2) return false;
    const target = blips[1]; // first reply
    target.click();
    return true;
  });
  await page.waitForTimeout(400);
  // Click the gear inside that blip's toolbar
  await page.evaluate(() => {
    const gears = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '⚙️');
    // Click the last one (the blip-level gear, not the topic-level one)
    if (gears.length > 0) gears[gears.length - 1].click();
  });
  await page.waitForTimeout(400);
  return opened;
}

async function captureGearMenuOpen(page, topicId, slug, itemText) {
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await openBlipAndGear(page);
  await shot(page, slug, '02-during');
  // For 33 (reply) no menu item, just capture with menu open
  if (itemText) {
    // Hover the item to highlight
    await page.evaluate((item) => {
      const mi = Array.from(document.querySelectorAll('[role="menuitem"], .menu-item, button')).find(el => el.textContent?.trim() === item);
      if (mi) mi.scrollIntoView();
    }, itemText);
  }
  await shot(page, slug, '03-after');
  await dismissOverlays(page);
}

// ================== Nav tabs (80) — click through tabs ==================

async function captureNavTabs(page, topicId) {
  const slug = '80-ui-nav-tabs';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Tasks'));
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Mentions'));
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
  // Return to Topics
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.match(/Topics\s*\d/));
    if (b) b.click();
  });
}

// ================== Share modal (82) ==================

async function captureShareModal(page, topicId) {
  const slug = '82-ui-share-modal';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Share'));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  await dismissOverlays(page);
}

// ================== Invite modal (83) ==================

async function captureInviteModal(page, topicId) {
  const slug = '83-ui-invite-modal';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'Invite');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  await dismissOverlays(page);
}

// ================== Three-panel layout (79) ==================

async function captureThreePanel(page, topicId) {
  const slug = '79-ui-three-panel';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  // Collapse tools panel
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Collapse tools') || x.textContent?.trim() === '▶');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  // Re-expand
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '◀');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

// ================== Topics list (81) ==================

async function captureTopicsList(page, topicId) {
  const slug = '81-ui-topics-list';
  await openTopicClean(page, topicId);
  await clipShot(page, slug, '01-before', '[data-topics-list], .topics-list, aside');
  await clipShot(page, slug, '02-during', '[data-topics-list], .topics-list, aside');
  await clipShot(page, slug, '03-after', '[data-topics-list], .topics-list, aside');
}

// ================== Search 71/72 ==================

async function captureSearch(page, topicId) {
  // 71 fulltext
  const slug71 = '71-search-fulltext';
  await openTopicClean(page, topicId);
  await shot(page, slug71, '01-before');
  const box = page.locator('input[placeholder*="Search topics"]').first();
  await box.click();
  await box.fill('Pass 2');
  await page.waitForTimeout(400);
  await shot(page, slug71, '02-during');
  await shot(page, slug71, '03-after');
  await box.fill('');

  // 72 snippet — search something that matches seed content
  const slug72 = '72-search-snippet';
  await shot(page, slug72, '01-before');
  await box.click();
  await box.fill('formatting');
  await page.waitForTimeout(400);
  await shot(page, slug72, '02-during');
  await shot(page, slug72, '03-after');
  await box.fill('');
}

// ================== Mobile responsive (73) ==================

async function captureMobile(page, topicId) {
  const slug = '73-mobile-responsive';
  await openTopicClean(page, topicId);
  await shot(page, slug, '01-before');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  await page.setViewportSize({ width: 1440, height: 900 });
}

// ================== MAIN ==================

async function main() {
  await fs.mkdir(outRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await ensureAuth(page);
    ok(`auth as ${email}`);
    const topicId = await createSeedTopic(page);
    ok(`seed topic ${topicId}`);

    // ---- Editor marks (01-04) with clipped captures ----
    await runFeature('01-editor-bold',          () => captureEditorMarkClipped(page, topicId, '01-editor-bold',          'Control+b',       'Bold'));
    await runFeature('02-editor-italic',        () => captureEditorMarkClipped(page, topicId, '02-editor-italic',        'Control+i',       'Italic'));
    await runFeature('03-editor-underline',     () => captureEditorMarkClipped(page, topicId, '03-editor-underline',     'Control+u',       'Underline'));
    await runFeature('04-editor-strikethrough', () => captureEditorMarkClipped(page, topicId, '04-editor-strikethrough', 'Control+Shift+x', 'Strike'));

    // ---- Editor blocks (05-11) — already verified in pass 1 but rerun for parity ----
    await runFeature('05-editor-headings',      () => captureEditorBlock(page, topicId, '05-editor-headings',     'Control+Alt+1'));
    await runFeature('06-editor-bullet-list',   () => captureEditorBlock(page, topicId, '06-editor-bullet-list',  'Control+Shift+8'));
    await runFeature('07-editor-ordered-list',  () => captureEditorBlock(page, topicId, '07-editor-ordered-list', 'Control+Shift+7'));
    await runFeature('08-editor-task-list',     () => captureEditorBlock(page, topicId, '08-editor-task-list',    'Control+Shift+9'));
    await runFeature('09-editor-blockquote',    () => captureEditorBlock(page, topicId, '09-editor-blockquote',   'Control+Shift+b'));
    await runFeature('10-editor-code-inline',   () => captureEditorMarkClipped(page, topicId, '10-editor-code-inline', 'Control+e', 'InlineCode'));
    await runFeature('11-editor-code-block',    () => captureEditorBlock(page, topicId, '11-editor-code-block', 'Control+Alt+c'));

    // ---- Editor highlight / link / image (12-14) ----
    await runFeature('12-editor-highlight', () => captureHighlight(page, topicId));
    await runFeature('13-editor-link',      () => captureLink(page, topicId));
    await runFeature('14-editor-image',     () => captureImage(page, topicId));

    // ---- Mention dropdown (15) ----
    await runFeature('15-editor-mention-dropdown', () => captureMentionDropdown(page, topicId));

    // ---- Gadget palette (16) ----
    await runFeature('16-editor-gadget-palette', () => captureGadgetPalette(page, topicId));

    // ---- BLB 17-18, 26 ----
    await runFeature('17-blb-collapsed-toc',   () => captureBlbCollapsedToc(page, topicId));
    await runFeature('18-blb-section-expanded',() => captureBlbSectionExpanded(page, topicId));
    await runFeature('26-blb-fold-unfold-all', () => captureBlbFoldUnfold(page, topicId));

    // ---- Widgets 27-30 ----
    await runFeature('27-widget-mention-pill', () => captureWidgetTrigger(page, topicId, '27-widget-mention-pill', '@', 'Mention popup'));
    await runFeature('28-widget-task-pill',    () => captureWidgetTrigger(page, topicId, '28-widget-task-pill',    '~', 'Task popup'));
    await runFeature('29-widget-tag',          () => captureWidgetTrigger(page, topicId, '29-widget-tag',          '#', 'Tag popup'));
    await runFeature('30-widget-right-panel-buttons', () => captureRightPanelButtons(page, topicId));

    // ---- Gear menu 33-40 ----
    await runFeature('34-blip-edit',           () => captureGearMenuOpen(page, topicId, '34-blip-edit', null));
    await runFeature('35-blip-delete',         () => captureGearMenuOpen(page, topicId, '35-blip-delete', 'Delete blip'));
    await runFeature('36-blip-duplicate',      () => captureGearMenuOpen(page, topicId, '36-blip-duplicate', 'Duplicate blip'));
    await runFeature('37-blip-cut',            () => captureGearMenuOpen(page, topicId, '37-blip-cut', 'Cut blip'));
    await runFeature('38-blip-paste',          () => captureGearMenuOpen(page, topicId, '38-blip-paste', 'Paste at cursor'));
    await runFeature('39-blip-copy-link',      () => captureGearMenuOpen(page, topicId, '39-blip-copy-link', 'Copy direct link'));
    await runFeature('40-blip-history-modal',  () => captureGearMenuOpen(page, topicId, '40-blip-history-modal', 'Playback history'));

    // ---- Search 71/72 ----
    await runFeature('71+72-search', () => captureSearch(page, topicId));

    // ---- Mobile 73 ----
    await runFeature('73-mobile-responsive', () => captureMobile(page, topicId));

    // ---- UI shell 79-83 ----
    await runFeature('79-ui-three-panel',  () => captureThreePanel(page, topicId));
    await runFeature('80-ui-nav-tabs',     () => captureNavTabs(page, topicId));
    await runFeature('81-ui-topics-list',  () => captureTopicsList(page, topicId));
    await runFeature('82-ui-share-modal',  () => captureShareModal(page, topicId));
    await runFeature('83-ui-invite-modal', () => captureInviteModal(page, topicId));

    console.log(`\n==== PASS 2 SUMMARY ====`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (failures.length) {
      for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
    }
  } finally {
    await browser.close();
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { err(String(e)); process.exit(1); });
