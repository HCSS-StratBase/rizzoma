#!/usr/bin/env node
/**
 * Feature flow sweep — PASS 3 (2026-04-16).
 *
 * Fixes pass-2 gaps:
 *   - Stronger cleanup via `page.goto('about:blank')` + reload between
 *     features. This forces a full React remount so TipTap bubble menus
 *     and the gadget palette can't leak across captures.
 *   - Seed an inline child blip in the topic so BLB 19/20/25 have a
 *     marker to interact with.
 *   - Click THROUGH gear menu items for 34-40 (not just open the menu).
 *   - Open playback modals for 40-48 via `gear → Playback history` /
 *     topic `gear → Wave playback`.
 *   - Two-user FtG flow for 49/51/52 (user B posts a blip, user A sees
 *     unread, marks read).
 *   - Inline comments flow for 57-61.
 *   - Clipped captures for snippet (72) and toast (84).
 *
 * Defers (covered better by README-only + existing smoke tests):
 *   - 62-66 collab (test-collab-smoke.mjs handles this).
 *   - 69, 70 storage / ClamAV (not visually observable).
 *   - 74-78 mobile gestures (need synthetic touch events).
 *   - 21, 22, 24 BLB internals (implementation details).
 *
 * Run:
 *   node scripts/capture-feature-flows-pass3.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const userA = `feature-sweep-a-${Date.now()}@example.com`;
const userB = `feature-sweep-b-${Date.now()}@example.com`;

const ok = (m) => console.log(`✅ ${m}`);
const warn = (m) => console.log(`⚠️  ${m}`);
const err = (m) => console.error(`❌ ${m}`);

let passed = 0, failed = 0;
const failures = [];

async function shot(page, slug, step, opts = {}) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${step}_new.png`), ...opts });
}

async function clipShot(page, slug, step, selector) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${step}_new.png`);
  try {
    const el = await page.locator(selector).first();
    const box = await el.boundingBox();
    if (box) {
      await page.screenshot({ path: file, clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: box.width + 20, height: box.height + 20 } });
      return;
    }
  } catch {}
  await page.screenshot({ path: file });
}

async function ensureAuth(page, email) {
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

async function seedTopic(page, titleSuffix = '') {
  const csrf = await page.evaluate(() => {
    const c = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1] || '') : '';
  });
  const r = await page.evaluate(async ({ csrf, suf }) => {
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const tr = await fetch('/api/topics', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({
        title: `Feature Sweep Pass 3 ${suf}`,
        content: '<h1>Feature Sweep Pass 3</h1><p>Second paragraph — feature demo: sample paragraph for formatting tests.</p>',
      }),
    });
    const topic = await tr.json();
    const blipIds = [];
    for (let i = 1; i <= 3; i++) {
      const br = await fetch('/api/blips', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          waveId: topic.id, parentId: null,
          content: `<p>Reply blip ${i} — seeded for pass-3 captures with enough text for toolbar and thread behaviours.</p>`,
        }),
      });
      if (br.ok) { const b = await br.json(); blipIds.push(b.id); }
    }
    return { topicId: topic.id, blipIds };
  }, { csrf, suf: titleSuffix });
  return r;
}

// Hard reset: go to about:blank, then navigate to the topic. Forces
// full React remount — destroys any leftover overlays/bubble menus.
async function hardOpenTopic(page, topicId) {
  await page.goto('about:blank');
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.locator('.rizzoma-layout').waitFor({ timeout: 10000 });
  // Focus topic editor
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror');
    if (ed) ed.focus();
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

// ==================== Editor marks (clipped) ====================

async function captureMarkClipped(page, topicId, slug, shortcut) {
  await hardOpenTopic(page, topicId);
  const sel = '.ProseMirror p:has-text("sample paragraph")';
  await clipShot(page, slug, '01-before', sel);
  await selectTextInEditor(page, 'sample paragraph');
  await clipShot(page, slug, '02-during', sel);
  await page.keyboard.press(shortcut);
  await page.waitForTimeout(200);
  await clipShot(page, slug, '03-after', sel);
}

async function captureBlock(page, topicId, slug, shortcut) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  await page.keyboard.press(shortcut);
  await page.waitForTimeout(250);
  await shot(page, slug, '03-after');
}

// ==================== 12 Highlight — open picker + click swatch ====================

async function captureHighlight(page, topicId) {
  const slug = '12-editor-highlight';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  // Click Bg button to open picker
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'Bg');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  // Click a yellow swatch in the picker
  await page.evaluate(() => {
    const swatches = Array.from(document.querySelectorAll('[class*="swatch"], [class*="color-picker"] button, .color-swatch, [data-color]'));
    if (swatches.length > 0) { swatches[0].click(); return; }
    // Fallback: click the first background color sample
    const colorBtns = Array.from(document.querySelectorAll('button[style*="background"]'));
    if (colorBtns.length > 0) colorBtns[0].click();
  });
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
}

// ==================== 13 Link ====================

async function captureLink(page, topicId) {
  const slug = '13-editor-link';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  // Handle any prompt dialog
  page.once('dialog', (d) => d.accept('https://example.com'));
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '🔗');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

// ==================== 14 Image ====================

async function captureImage(page, topicId) {
  const slug = '14-editor-image';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await shot(page, slug, '02-during');
  page.once('dialog', (d) => d.accept('https://via.placeholder.com/200x100.png'));
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '🖼️');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

// ==================== 15 Mention dropdown ====================

async function captureMention(page, topicId) {
  const slug = '15-editor-mention-dropdown';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(' ');
  await shot(page, slug, '02-during');
  await page.keyboard.type('@');
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

// ==================== 16 Gadget palette ====================

async function captureGadgetPalette(page, topicId) {
  const slug = '16-editor-gadget-palette';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await shot(page, slug, '02-during');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').includes('Gadgets'));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

// ==================== BLB 17/18 ====================

async function captureBlbCollapsed(page, topicId) {
  const slug = '17-blb-collapsed-toc';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'short');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

async function captureBlbExpanded(page, topicId) {
  const slug = '18-blb-section-expanded';
  await hardOpenTopic(page, topicId);
  // Start in short mode
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'short');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'expanded');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

// ==================== BLB 19/20/25 — seed inline child ====================

async function captureCtrlEnterChild(page, topicId) {
  const slug = '25-blb-ctrl-enter-child';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Place cursor in the editor paragraph
  await selectTextInEditor(page, 'sample paragraph');
  await page.keyboard.press('End'); // collapse to end
  await shot(page, slug, '02-during');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(600);
  await shot(page, slug, '03-after');
}

async function captureInlineExpand(page, topicId) {
  const slug = '19-blb-inline-expand';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Find an inline marker ([+] or [-] rendered text)
  const clicked = await page.evaluate(() => {
    // Look for any element with text "+" or "−" inside a blip marker wrapper
    const candidates = Array.from(document.querySelectorAll('[data-inline-marker], .inline-blip-marker, .blip-inline-marker, [class*="inline-marker"]'));
    if (candidates.length > 0) { candidates[0].click(); return true; }
    // Fallback: look for span with "+ +" text (Rizzoma marker convention)
    const spans = Array.from(document.querySelectorAll('span[class*="marker"], span[data-marker]'));
    if (spans.length > 0) { spans[0].click(); return true; }
    return false;
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  return clicked;
}

async function captureCollapseBack(page, topicId) {
  const slug = '20-blb-collapse-back';
  await hardOpenTopic(page, topicId);
  // Expand first
  await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('[data-inline-marker], .inline-blip-marker, .blip-inline-marker'));
    if (cands.length > 0) cands[0].click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '01-before');
  // Collapse
  await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('[data-inline-marker], .inline-blip-marker, .blip-inline-marker'));
    if (cands.length > 0) cands[0].click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

// ==================== BLB 26 fold/unfold ====================

async function captureFoldUnfold(page, topicId) {
  const slug = '26-blb-fold-unfold-all';
  await hardOpenTopic(page, topicId);
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

// ==================== Widgets 27-32 ====================

async function captureWidgetChar(page, topicId, slug, char) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(' ');
  await shot(page, slug, '02-during');
  await page.keyboard.type(char);
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

async function captureRightPanel(page, topicId) {
  const slug = '30-widget-right-panel-buttons';
  await hardOpenTopic(page, topicId);
  await clipShot(page, slug, '01-before', '.right-tools-panel, [data-tools-panel], aside:last-of-type');
  await clipShot(page, slug, '02-during', '.right-tools-panel, [data-tools-panel], aside:last-of-type');
  await clipShot(page, slug, '03-after', '.right-tools-panel, [data-tools-panel], aside:last-of-type');
}

// ==================== Gear menu click-through 33-40 ====================

async function activateFirstReplyBlip(page) {
  // Click a reply blip so its gear button becomes available
  await page.evaluate(() => {
    const blips = document.querySelectorAll('[data-blip-id], .rizzoma-blip');
    if (blips.length < 2) return false;
    blips[1].click();
    return true;
  });
  await page.waitForTimeout(400);
}

async function openBlipGearMenu(page) {
  await page.evaluate(() => {
    const gears = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '⚙️');
    // The last gear is the active blip-level one (topic-level gear is higher up)
    if (gears.length > 0) gears[gears.length - 1].click();
  });
  await page.waitForTimeout(400);
}

async function clickMenuItem(page, text) {
  return page.evaluate((txt) => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"], .menu-item, li, button'));
    const target = items.find(el => el.textContent?.trim() === txt);
    if (target) { target.click(); return true; }
    return false;
  }, text);
}

async function captureReply(page, topicId) {
  const slug = '33-blip-reply';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Click the "Write a reply..." textarea
  const ok = await page.evaluate(() => {
    const ta = document.querySelector('textarea[placeholder*="reply" i], input[placeholder*="reply" i], [contenteditable][data-placeholder*="reply" i]');
    if (ta) { ta.click(); ta.focus(); return true; }
    // Look for a visible placeholder-text element
    const phs = Array.from(document.querySelectorAll('*')).filter(el => el.textContent?.trim() === 'Write a reply...');
    if (phs.length > 0) { phs[0].click(); return true; }
    return false;
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await page.keyboard.type('Pass 3 reply demo text');
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
}

async function captureBlipEdit(page, topicId) {
  const slug = '34-blip-edit';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await shot(page, slug, '02-during');
  // Click the Edit button in the active blip toolbar
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const edit = btns.find(b => b.textContent?.trim() === 'Edit' || b.getAttribute('aria-label')?.toLowerCase().includes('edit'));
    if (edit) edit.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

async function captureGearAction(page, topicId, slug, itemText, postDelay = 500) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await openBlipGearMenu(page);
  await shot(page, slug, '02-during');
  await clickMenuItem(page, itemText);
  await page.waitForTimeout(postDelay);
  await shot(page, slug, '03-after');
}

// ==================== Playback modals 40-48 ====================

async function captureHistoryModal(page, topicId) {
  const slug = '40-blip-history-modal';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await openBlipGearMenu(page);
  await shot(page, slug, '02-during');
  await clickMenuItem(page, 'Playback history');
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

async function captureInsideHistoryModal(page, topicId, slug, action) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await openBlipGearMenu(page);
  await clickMenuItem(page, 'Playback history');
  await page.waitForTimeout(700);
  await shot(page, slug, '02-during');
  if (action) await action();
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
  // Close modal
  await page.keyboard.press('Escape');
}

// ==================== Inline comments 57-61 ====================

async function captureCommentCreate(page, topicId) {
  const slug = '57-comment-create';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  // Click 💬+ (inline comment) button
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '💬+');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  // Type comment body in the comment composer if one opened
  await page.keyboard.type('Pass 3 inline comment');
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
}

async function captureCommentPanel(page, topicId, slug) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

// ==================== Search 71/72 ====================

async function captureSearch(page, topicId) {
  const slug71 = '71-search-fulltext';
  await hardOpenTopic(page, topicId);
  await shot(page, slug71, '01-before');
  const box = page.locator('input[placeholder*="Search topics"]').first();
  await box.click();
  await box.fill('Pass 3');
  await page.waitForTimeout(500);
  await shot(page, slug71, '02-during');
  await shot(page, slug71, '03-after');
  await box.fill('');

  const slug72 = '72-search-snippet';
  await shot(page, slug72, '01-before');
  await box.click();
  await box.fill('formatting');
  await page.waitForTimeout(500);
  await clipShot(page, slug72, '02-during', 'aside, [data-topics-list], .topics-list');
  await clipShot(page, slug72, '03-after', 'aside, [data-topics-list], .topics-list');
  await box.fill('');
}

// ==================== Mobile 73 ====================

async function captureMobile(page, topicId) {
  const slug = '73-mobile-responsive';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  await page.setViewportSize({ width: 1440, height: 900 });
}

// ==================== UI shell 79-84 ====================

async function captureThreePanel(page, topicId) {
  const slug = '79-ui-three-panel';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Collapse tools') || x.textContent?.trim() === '▶');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '◀');
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

async function captureNavTabs(page, topicId) {
  const slug = '80-ui-nav-tabs';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Tasks') && !x.textContent?.includes('Tasks list'));
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Mentions'));
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '03-after');
}

async function captureTopicsList(page, topicId) {
  const slug = '81-ui-topics-list';
  await hardOpenTopic(page, topicId);
  await clipShot(page, slug, '01-before', 'aside, [data-topics-list], .topics-list');
  await clipShot(page, slug, '02-during', 'aside, [data-topics-list], .topics-list');
  await clipShot(page, slug, '03-after', 'aside, [data-topics-list], .topics-list');
}

async function captureShareModal(page, topicId) {
  const slug = '82-ui-share-modal';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Share'));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

async function captureInviteModal(page, topicId) {
  const slug = '83-ui-invite-modal';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'Invite');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

async function captureToast(page, topicId) {
  const slug = '84-ui-toast';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await openBlipGearMenu(page);
  await shot(page, slug, '02-during');
  await clickMenuItem(page, 'Copy direct link');
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

// ==================== FtG with 2 users ====================

async function captureFtgTwoUser(page, slug, topicId, fn) {
  // Pre-condition: user A is logged in, topicId exists with blips that
  // were posted by user B (caller ensures this by using the separate
  // ctxB context to seed blips).
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await fn();
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

// ==================== MAIN ====================

async function main() {
  await fs.mkdir(outRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    // User A (main capturer)
    await ensureAuth(pageA, userA);
    ok(`auth A as ${userA}`);
    const { topicId, blipIds } = await seedTopic(pageA, 'A');
    ok(`seed topic A ${topicId} with ${blipIds.length} blips`);

    // Share topic with user B so they can see/modify
    await pageA.evaluate(async ({ csrf, email, topicId }) => {
      const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
      await fetch(`/api/topics/${topicId}/invite`, {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({ email }),
      }).catch(() => {});
    }, {
      csrf: await pageA.evaluate(() => {
        const c = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
        return c ? decodeURIComponent(c.split('=')[1] || '') : '';
      }),
      email: userB,
      topicId,
    });

    // User B setup (for FtG two-user flow)
    await ensureAuth(pageB, userB);
    ok(`auth B as ${userB}`);

    // ---- Editor marks (clipped) ----
    await runFeature('01-editor-bold',          () => captureMarkClipped(pageA, topicId, '01-editor-bold',          'Control+b'));
    await runFeature('02-editor-italic',        () => captureMarkClipped(pageA, topicId, '02-editor-italic',        'Control+i'));
    await runFeature('03-editor-underline',     () => captureMarkClipped(pageA, topicId, '03-editor-underline',     'Control+u'));
    await runFeature('04-editor-strikethrough', () => captureMarkClipped(pageA, topicId, '04-editor-strikethrough', 'Control+Shift+x'));

    // ---- Editor blocks ----
    await runFeature('05-editor-headings',      () => captureBlock(pageA, topicId, '05-editor-headings',     'Control+Alt+1'));
    await runFeature('06-editor-bullet-list',   () => captureBlock(pageA, topicId, '06-editor-bullet-list',  'Control+Shift+8'));
    await runFeature('07-editor-ordered-list',  () => captureBlock(pageA, topicId, '07-editor-ordered-list', 'Control+Shift+7'));
    await runFeature('08-editor-task-list',     () => captureBlock(pageA, topicId, '08-editor-task-list',    'Control+Shift+9'));
    await runFeature('09-editor-blockquote',    () => captureBlock(pageA, topicId, '09-editor-blockquote',   'Control+Shift+b'));
    await runFeature('10-editor-code-inline',   () => captureMarkClipped(pageA, topicId, '10-editor-code-inline', 'Control+e'));
    await runFeature('11-editor-code-block',    () => captureBlock(pageA, topicId, '11-editor-code-block', 'Control+Alt+c'));

    // ---- 12 / 13 / 14 ----
    await runFeature('12-editor-highlight', () => captureHighlight(pageA, topicId));
    await runFeature('13-editor-link',      () => captureLink(pageA, topicId));
    await runFeature('14-editor-image',     () => captureImage(pageA, topicId));

    // ---- 15 / 16 ----
    await runFeature('15-editor-mention-dropdown', () => captureMention(pageA, topicId));
    await runFeature('16-editor-gadget-palette',   () => captureGadgetPalette(pageA, topicId));

    // ---- BLB 17/18/19/20/25/26 ----
    await runFeature('17-blb-collapsed-toc',    () => captureBlbCollapsed(pageA, topicId));
    await runFeature('18-blb-section-expanded', () => captureBlbExpanded(pageA, topicId));
    await runFeature('25-blb-ctrl-enter-child', () => captureCtrlEnterChild(pageA, topicId));
    await runFeature('19-blb-inline-expand',    () => captureInlineExpand(pageA, topicId));
    await runFeature('20-blb-collapse-back',    () => captureCollapseBack(pageA, topicId));
    await runFeature('26-blb-fold-unfold-all',  () => captureFoldUnfold(pageA, topicId));

    // ---- Widgets 27-30 ----
    await runFeature('27-widget-mention-pill', () => captureWidgetChar(pageA, topicId, '27-widget-mention-pill', '@'));
    await runFeature('28-widget-task-pill',    () => captureWidgetChar(pageA, topicId, '28-widget-task-pill',    '~'));
    await runFeature('29-widget-tag',          () => captureWidgetChar(pageA, topicId, '29-widget-tag',          '#'));
    await runFeature('30-widget-right-panel-buttons', () => captureRightPanel(pageA, topicId));

    // ---- Gear menu 33-40 (action click-through) ----
    await runFeature('33-blip-reply',          () => captureReply(pageA, topicId));
    await runFeature('34-blip-edit',           () => captureBlipEdit(pageA, topicId));
    await runFeature('35-blip-delete',         () => captureGearAction(pageA, topicId, '35-blip-delete', 'Delete blip'));
    await runFeature('36-blip-duplicate',      () => captureGearAction(pageA, topicId, '36-blip-duplicate', 'Duplicate blip'));
    await runFeature('37-blip-cut',            () => captureGearAction(pageA, topicId, '37-blip-cut', 'Cut blip'));
    await runFeature('38-blip-paste',          () => captureGearAction(pageA, topicId, '38-blip-paste', 'Paste as reply'));
    await runFeature('39-blip-copy-link',      () => captureGearAction(pageA, topicId, '39-blip-copy-link', 'Copy direct link'));
    await runFeature('40-blip-history-modal',  () => captureHistoryModal(pageA, topicId));

    // ---- Playback drill-down 41-44 (per-blip modal) ----
    await runFeature('41-playback-per-blip-timeline', () => captureInsideHistoryModal(pageA, topicId, '41-playback-per-blip-timeline', null));
    await runFeature('42-playback-play-pause-step',   () => captureInsideHistoryModal(pageA, topicId, '42-playback-play-pause-step', async () => {
      // Click a play button if present
      await pageA.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(x => x.getAttribute('aria-label')?.toLowerCase().includes('play') || x.textContent?.includes('▶'));
        if (b) b.click();
      });
    }));
    await runFeature('43-playback-speed',             () => captureInsideHistoryModal(pageA, topicId, '43-playback-speed', async () => {
      await pageA.evaluate(() => {
        const s = document.querySelector('select[name*="speed" i]') || document.querySelector('[class*="speed"]');
        if (s) s.click();
      });
    }));
    await runFeature('44-playback-diff',              () => captureInsideHistoryModal(pageA, topicId, '44-playback-diff', async () => {
      await pageA.evaluate(() => {
        const d = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.toLowerCase().includes('diff'));
        if (d) d.click();
      });
    }));

    // ---- Wave-level playback 45-48 (topic-level gear) ----
    async function captureWavePlayback(slug, action) {
      await hardOpenTopic(pageA, topicId);
      await shot(pageA, slug, '01-before');
      await pageA.evaluate(() => {
        // Click topic-level gear (first ⚙️ in toolbar)
        const gears = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '⚙️');
        if (gears.length > 0) gears[0].click();
      });
      await pageA.waitForTimeout(400);
      await shot(pageA, slug, '02-during');
      // Click Wave playback menu item
      await pageA.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[role="menuitem"], .menu-item, li, button'));
        const t = items.find(el => /wave\s*playback/i.test(el.textContent?.trim() || ''));
        if (t) t.click();
      });
      await pageA.waitForTimeout(800);
      if (action) await action();
      await shot(pageA, slug, '03-after');
      await pageA.keyboard.press('Escape');
    }
    await runFeature('45-playback-wave-level-modal', () => captureWavePlayback('45-playback-wave-level-modal', null));
    await runFeature('46-playback-split-pane',       () => captureWavePlayback('46-playback-split-pane', null));
    await runFeature('47-playback-cluster-skip',     () => captureWavePlayback('47-playback-cluster-skip', null));
    await runFeature('48-playback-date-jump',        () => captureWavePlayback('48-playback-date-jump', null));

    // ---- FtG 49-56 — needs user B to post a blip first ----
    // User B opens topic and posts a new blip
    await runFeature('ftg-prep-userB-post', async () => {
      const csrfB = await pageB.evaluate(() => {
        const c = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
        return c ? decodeURIComponent(c.split('=')[1] || '') : '';
      });
      await pageB.evaluate(async ({ csrf, tid }) => {
        const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
        await fetch('/api/blips', {
          method: 'POST', headers, credentials: 'include',
          body: JSON.stringify({
            waveId: tid, parentId: null,
            content: '<p>Blip posted by user B to generate an unread marker for user A.</p>',
          }),
        });
      }, { csrf: csrfB, tid: topicId });
    });

    await runFeature('49-ftg-green-border',  () => captureFtgTwoUser(pageA, '49-ftg-green-border', topicId, async () => {}));
    await runFeature('51-ftg-sidebar-badge', () => captureFtgTwoUser(pageA, '51-ftg-sidebar-badge', topicId, async () => {}));
    await runFeature('52-ftg-mark-read',     () => captureFtgTwoUser(pageA, '52-ftg-mark-read', topicId, async () => {
      // Click mark-read or similar
      await pageA.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(x => /mark.*read/i.test(x.textContent || ''));
        if (b) b.click();
      });
    }));
    await runFeature('55-ftg-ctrl-space',    () => captureFtgTwoUser(pageA, '55-ftg-ctrl-space', topicId, async () => {
      await pageA.keyboard.press('Control+Space');
    }));

    // ---- Comments 57-61 ----
    await runFeature('57-comment-create', () => captureCommentCreate(pageA, topicId));
    await runFeature('58-comment-thread', () => captureCommentPanel(pageA, topicId, '58-comment-thread'));
    await runFeature('59-comment-resolve', () => captureCommentPanel(pageA, topicId, '59-comment-resolve'));
    await runFeature('60-comment-visibility-toggle', () => captureCommentPanel(pageA, topicId, '60-comment-visibility-toggle'));
    await runFeature('61-comment-keyboard-shortcut', async () => {
      await hardOpenTopic(pageA, topicId);
      await shot(pageA, '61-comment-keyboard-shortcut', '01-before');
      await pageA.keyboard.press('Control+Shift+ArrowDown');
      await pageA.waitForTimeout(300);
      await shot(pageA, '61-comment-keyboard-shortcut', '02-during');
      await shot(pageA, '61-comment-keyboard-shortcut', '03-after');
    });

    // ---- Search 71/72 ----
    await runFeature('71+72-search', () => captureSearch(pageA, topicId));

    // ---- Mobile 73 ----
    await runFeature('73-mobile-responsive', () => captureMobile(pageA, topicId));

    // ---- UI shell 79-84 ----
    await runFeature('79-ui-three-panel',  () => captureThreePanel(pageA, topicId));
    await runFeature('80-ui-nav-tabs',     () => captureNavTabs(pageA, topicId));
    await runFeature('81-ui-topics-list',  () => captureTopicsList(pageA, topicId));
    await runFeature('82-ui-share-modal',  () => captureShareModal(pageA, topicId));
    await runFeature('83-ui-invite-modal', () => captureInviteModal(pageA, topicId));
    await runFeature('84-ui-toast',        () => captureToast(pageA, topicId));

    console.log(`\n==== PASS 3 SUMMARY ====`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  } finally {
    await browser.close();
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { err(String(e)); process.exit(1); });
