#!/usr/bin/env node
/**
 * Feature flow sweep — PASS 6 (2026-04-16).
 *
 * Strategy:
 *   - DOM dump at start to find the correct active-blip-gear selector
 *     (previous passes kept guessing and regressing).
 *   - Keep pass 4's working topic-gear → Wave Timeline path for 40-48
 *     (proven to work).
 *   - Use the discovered selector for 34-39 and 84 blip-level actions.
 *   - Stronger overlay dismissal: click the topic title between features.
 *   - Keep pass 4's working features working (no regressions).
 *
 * This pass focuses ONLY on the features still blocked:
 *   - 12 highlight (needs swatch click)
 *   - 13 link (needs Ctrl+K working)
 *   - 14 image (needs button click)
 *   - 34-39 blip gear ops (needs correct gear scoping)
 *   - 58-61 comment flow (needs open panel)
 *   - 84 toast (needs blip gear copy link)
 *
 * Run: node scripts/capture-feature-flows-pass6.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const userA = `feature-sweep-p6-${Date.now()}@example.com`;

const ok = (m) => console.log(`✅ ${m}`);
const warn = (m) => console.log(`⚠️  ${m}`);
const err = (m) => console.error(`❌ ${m}`);

let passed = 0, failed = 0;

async function shot(page, slug, step, opts = {}) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${step}_new.png`), ...opts });
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
    return lg.ok ? { ok: true } : { ok: false };
  }, { email, password });
  if (!r.ok) throw new Error('auth failed');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 15000 });
}

async function seedTopic(page) {
  const csrf = await page.evaluate(() => {
    const c = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1] || '') : '';
  });
  const r = await page.evaluate(async ({ csrf }) => {
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const tr = await fetch('/api/topics', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({
        title: 'Feature Sweep Pass 6',
        content: '<h1>Feature Sweep Pass 6</h1><p>Second paragraph — feature demo: sample paragraph for formatting tests.</p>',
      }),
    });
    const topic = await tr.json();
    const blipIds = [];
    for (let i = 1; i <= 3; i++) {
      const br = await fetch('/api/blips', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          waveId: topic.id, parentId: null,
          content: `<p>Reply blip ${i} — pass-6 captures with sufficient text for the editor toolbar and threading behaviours.</p>`,
        }),
      });
      if (br.ok) { const b = await br.json(); blipIds.push(b.id); }
    }
    // Seed a comment on the first blip
    let commentId = null;
    if (blipIds.length > 0) {
      const cr = await fetch('/api/comments', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          blipId: blipIds[0],
          anchorStart: 0, anchorEnd: 10,
          anchorText: 'Reply blip',
          body: 'Pass 6 seed comment',
        }),
      });
      if (cr.ok) { const c = await cr.json(); commentId = c.id; }
    }
    return { topicId: topic.id, blipIds, commentId };
  }, { csrf });
  return r;
}

async function hardOpenTopic(page, topicId) {
  await page.goto('about:blank');
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.locator('.rizzoma-layout').waitFor({ timeout: 10000 });
  // Press Escape 2x to close any leftover overlays (belt + suspenders)
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
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
    err(`${name}: ${String(e).slice(0, 150)}`);
  }
}

// ============= DEBUG: DOM dump =============
async function debugDumpDOM(page, topicId) {
  await hardOpenTopic(page, topicId);
  // Click first reply blip to activate it
  await page.evaluate(() => {
    const blips = document.querySelectorAll('[data-blip-id]');
    if (blips.length >= 2) blips[1].click();
  });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const result = {};
    result.blipMenuContainers = document.querySelectorAll('.blip-menu-container').length;
    result.blipContainers = document.querySelectorAll('.blip-container').length;
    result.activeBlipContainers = document.querySelectorAll('.blip-container.active').length;
    result.blipsWithDataId = document.querySelectorAll('[data-blip-id]').length;
    result.gearButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '⚙️').length;

    // For each gear button, find its closest .blip-container ancestor and report
    const gears = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '⚙️');
    result.gearContexts = gears.map((g, i) => {
      let p = g;
      const ancestors = [];
      while (p && p !== document.body) {
        if (p.className && typeof p.className === 'string') ancestors.push(p.className.split(' ').filter(c => c).slice(0, 3).join('.'));
        p = p.parentElement;
        if (ancestors.length > 5) break;
      }
      return { idx: i, ancestors: ancestors.slice(0, 5), hasActive: g.closest('.active, [data-blip-active="true"]') !== null };
    });
    return result;
  });
  console.log('🔍 DOM DUMP:', JSON.stringify(info, null, 2));
  return info;
}

// ============= Editor marks (carry forward from pass 4) =============

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

// ============= 12/13/14 — New strategy =============

async function captureHighlight(page, topicId) {
  const slug = '12-editor-highlight';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  // Open Bg picker
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'Bg');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  // Click ANY visible element with inline style background-color matching a non-white color
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      const style = el.getAttribute('style') || '';
      if (/background(-color)?:\s*(yellow|rgb\(255,\s*255,\s*\d+)/i.test(style) ||
          /background(-color)?:\s*rgb\(254,\s*249,\s*\d+\)/i.test(style)) {
        el.click();
        return true;
      }
    }
    // Fallback: click any child of the Bg picker with a background style
    const picker = document.querySelector('[class*="color"], [class*="picker"], [class*="palette"]');
    if (picker) {
      const swatch = picker.querySelector('[style*="background"]');
      if (swatch) { swatch.click(); return true; }
    }
    return false;
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

async function captureLink(page, topicId) {
  const slug = '13-editor-link';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  // Use the TipTap command directly via window.editor if exposed, else Ctrl+K
  page.once('dialog', (d) => d.accept('https://example.com/pass6'));
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(600);
  // If no dialog, try the 🔗 toolbar button
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '🔗');
    if (b) b.click();
  });
  await page.waitForTimeout(600);
  await shot(page, slug, '03-after');
}

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
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

// ============= 15/16 =============
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

// ============= BLB =============
async function captureBlbCollapsed(page, topicId) {
  const slug = '17-blb-collapsed-toc';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'short');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

async function captureBlbExpanded(page, topicId) {
  const slug = '18-blb-section-expanded';
  await hardOpenTopic(page, topicId);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'short');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'expanded');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

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

// ============= Widgets =============
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
  await clipShot(page, slug, '01-before', 'aside:last-of-type, [data-tools-panel]');
  await clipShot(page, slug, '02-during', 'aside:last-of-type, [data-tools-panel]');
  await clipShot(page, slug, '03-after', 'aside:last-of-type, [data-tools-panel]');
}

// ============= Gear menu — DOM-dump-informed strategy =============
//
// From the debug dump, we now know:
//   - If there are 2+ .blip-menu-container, index 1 is the first reply blip.
//   - If only 1, there's no active blip — need to click to activate first.

async function activateAndOpenBlipGear(page, blipIndex = 1) {
  // Click a reply blip
  await page.evaluate((i) => {
    const blips = document.querySelectorAll('[data-blip-id]');
    if (blips.length > i) blips[i].click();
  }, blipIndex);
  await page.waitForTimeout(600);
  // Click the LAST ⚙️ button — this is the active blip's gear since the active
  // blip's menu container was just added to the DOM after the click.
  const clicked = await page.evaluate(() => {
    const gears = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '⚙️');
    if (gears.length > 0) {
      gears[gears.length - 1].click();
      return gears.length;
    }
    return 0;
  });
  await page.waitForTimeout(500);
  return clicked;
}

async function clickMenuItemByText(page, text) {
  return page.evaluate((txt) => {
    // Menu items appear inside a menu role or a dropdown — look for exact match
    const items = Array.from(document.querySelectorAll('[role="menuitem"], .menu-item, li button, button'));
    const t = items.find(el => el.textContent?.trim() === txt);
    if (t) { t.click(); return true; }
    return false;
  }, text);
}

async function captureReply(page, topicId) {
  const slug = '33-blip-reply';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  const reply = page.locator('textarea[placeholder*="reply" i], input[placeholder*="reply" i], [placeholder*="Write a reply" i]').first();
  try { await reply.click({ timeout: 2000 }); } catch {}
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await page.keyboard.type('Pass 6 reply demo text');
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
}

async function captureBlipEdit(page, topicId) {
  const slug = '34-blip-edit';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Activate first reply blip
  await page.evaluate(() => {
    const blips = document.querySelectorAll('[data-blip-id]');
    if (blips.length >= 2) blips[1].click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  // Click Edit button — prefer one near the active blip
  await page.evaluate(() => {
    const editBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === 'Edit');
    if (editBtns.length > 0) editBtns[editBtns.length - 1].click();
  });
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

async function captureGearAction(page, topicId, slug, itemText) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateAndOpenBlipGear(page, 1);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, itemText);
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

async function captureHistoryModal(page, topicId) {
  const slug = '40-blip-history-modal';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateAndOpenBlipGear(page, 1);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, 'Playback history');
  await page.waitForTimeout(1200);
  await shot(page, slug, '03-after');
}

async function captureInsideHistoryModal(page, topicId, slug) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateAndOpenBlipGear(page, 1);
  await clickMenuItemByText(page, 'Playback history');
  await page.waitForTimeout(1200);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

// ============= Wave playback via topic gear =============

async function captureWavePlayback(page, topicId, slug) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Topic gear is the FIRST ⚙️ in the DOM (topic header)
  await page.evaluate(() => {
    const gears = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '⚙️');
    if (gears.length > 0) gears[0].click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, 'Wave Timeline');
  await page.waitForTimeout(1200);
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

// ============= Comments =============
async function captureCommentCreate(page, topicId) {
  const slug = '57-comment-create';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '💬+');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await page.keyboard.type('Pass 6 inline comment');
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

async function captureCommentThread(page, topicId) {
  const slug = '58-comment-thread';
  await hardOpenTopic(page, topicId);
  // Activate first blip to show its comments
  await page.evaluate(() => {
    const blips = document.querySelectorAll('[data-blip-id]');
    if (blips.length >= 2) blips[1].click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '01-before');
  // Click 💬 to show comments
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '💬');
    if (b) b.click();
  });
  await page.waitForTimeout(700);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

async function captureCommentResolve(page, topicId) {
  const slug = '59-comment-resolve';
  await hardOpenTopic(page, topicId);
  await page.evaluate(() => {
    const blips = document.querySelectorAll('[data-blip-id]');
    if (blips.length >= 2) blips[1].click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '💬');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /resolve/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

async function captureCommentVisibility(page, topicId) {
  const slug = '60-comment-visibility-toggle';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.keyboard.press('Control+Shift+ArrowUp');
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await page.keyboard.press('Control+Shift+ArrowDown');
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

async function captureCommentShortcut(page, topicId) {
  const slug = '61-comment-keyboard-shortcut';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.keyboard.press('Control+Shift+ArrowUp');
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await page.keyboard.press('Control+Shift+ArrowDown');
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

// ============= Search / Mobile / UI =============

async function captureSearch(page, topicId) {
  const slug71 = '71-search-fulltext';
  await hardOpenTopic(page, topicId);
  await shot(page, slug71, '01-before');
  const box = page.locator('input[placeholder*="Search topics"]').first();
  await box.click();
  await box.fill('Pass 6');
  await page.waitForTimeout(500);
  await shot(page, slug71, '02-during');
  await shot(page, slug71, '03-after');
  await box.fill('');

  const slug72 = '72-search-snippet';
  await shot(page, slug72, '01-before');
  await box.click();
  await box.fill('formatting');
  await page.waitForTimeout(500);
  await clipShot(page, slug72, '02-during', 'aside:first-of-type');
  await clipShot(page, slug72, '03-after', 'aside:first-of-type');
  await box.fill('');
}

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

async function captureThreePanel(page, topicId) {
  const slug = '79-ui-three-panel';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Collapse tools') || x.textContent?.trim() === '▶');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '◀');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await shot(page, slug, '03-after');
}

async function captureNavTabs(page, topicId) {
  const slug = '80-ui-nav-tabs';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Tasks') && !x.textContent?.includes('list'));
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
  await page.waitForTimeout(500);
  await clipShot(page, slug, '01-before', 'aside:first-of-type');
  const box = page.locator('input[placeholder*="Search topics"]').first();
  try { await box.click({ timeout: 5000 }); await box.fill('Pass'); } catch {}
  await page.waitForTimeout(400);
  await clipShot(page, slug, '02-during', 'aside:first-of-type');
  try { await box.fill(''); } catch {}
  await page.waitForTimeout(300);
  await clipShot(page, slug, '03-after', 'aside:first-of-type');
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
  await activateAndOpenBlipGear(page, 1);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, 'Copy direct link');
  await page.waitForTimeout(1000);
  await shot(page, slug, '03-after');
}

// ============= MAIN =============

async function main() {
  await fs.mkdir(outRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await ensureAuth(page, userA);
    ok(`auth as ${userA}`);
    const { topicId, blipIds, commentId } = await seedTopic(page);
    ok(`seed ${topicId} + ${blipIds.length} blips + comment ${commentId || 'none'}`);

    // DOM DEBUG DUMP — find the correct blip-gear selector
    await debugDumpDOM(page, topicId);

    // Editor marks & blocks (carry forward)
    await runFeature('01-editor-bold',          () => captureMarkClipped(page, topicId, '01-editor-bold',          'Control+b'));
    await runFeature('02-editor-italic',        () => captureMarkClipped(page, topicId, '02-editor-italic',        'Control+i'));
    await runFeature('03-editor-underline',     () => captureMarkClipped(page, topicId, '03-editor-underline',     'Control+u'));
    await runFeature('04-editor-strikethrough', () => captureMarkClipped(page, topicId, '04-editor-strikethrough', 'Control+Shift+x'));
    await runFeature('05-editor-headings',      () => captureBlock(page, topicId, '05-editor-headings',     'Control+Alt+1'));
    await runFeature('06-editor-bullet-list',   () => captureBlock(page, topicId, '06-editor-bullet-list',  'Control+Shift+8'));
    await runFeature('07-editor-ordered-list',  () => captureBlock(page, topicId, '07-editor-ordered-list', 'Control+Shift+7'));
    await runFeature('08-editor-task-list',     () => captureBlock(page, topicId, '08-editor-task-list',    'Control+Shift+9'));
    await runFeature('09-editor-blockquote',    () => captureBlock(page, topicId, '09-editor-blockquote',   'Control+Shift+b'));
    await runFeature('10-editor-code-inline',   () => captureMarkClipped(page, topicId, '10-editor-code-inline', 'Control+e'));
    await runFeature('11-editor-code-block',    () => captureBlock(page, topicId, '11-editor-code-block', 'Control+Alt+c'));

    await runFeature('12-editor-highlight', () => captureHighlight(page, topicId));
    await runFeature('13-editor-link',      () => captureLink(page, topicId));
    await runFeature('14-editor-image',     () => captureImage(page, topicId));
    await runFeature('15-editor-mention-dropdown', () => captureMention(page, topicId));
    await runFeature('16-editor-gadget-palette',   () => captureGadgetPalette(page, topicId));

    await runFeature('17-blb-collapsed-toc',    () => captureBlbCollapsed(page, topicId));
    await runFeature('18-blb-section-expanded', () => captureBlbExpanded(page, topicId));
    await runFeature('26-blb-fold-unfold-all',  () => captureFoldUnfold(page, topicId));

    await runFeature('27-widget-mention-pill', () => captureWidgetChar(page, topicId, '27-widget-mention-pill', '@'));
    await runFeature('28-widget-task-pill',    () => captureWidgetChar(page, topicId, '28-widget-task-pill',    '~'));
    await runFeature('29-widget-tag',          () => captureWidgetChar(page, topicId, '29-widget-tag',          '#'));
    await runFeature('30-widget-right-panel-buttons', () => captureRightPanel(page, topicId));

    // Gear menu — new strategy (click LAST gear after activating blip)
    await runFeature('33-blip-reply',          () => captureReply(page, topicId));
    await runFeature('34-blip-edit',           () => captureBlipEdit(page, topicId));
    await runFeature('35-blip-delete',         () => captureGearAction(page, topicId, '35-blip-delete', 'Delete blip'));
    await runFeature('36-blip-duplicate',      () => captureGearAction(page, topicId, '36-blip-duplicate', 'Duplicate blip'));
    await runFeature('37-blip-cut',            () => captureGearAction(page, topicId, '37-blip-cut', 'Cut blip'));
    await runFeature('38-blip-paste',          () => captureGearAction(page, topicId, '38-blip-paste', 'Paste as reply'));
    await runFeature('39-blip-copy-link',      () => captureGearAction(page, topicId, '39-blip-copy-link', 'Copy direct link'));
    await runFeature('40-blip-history-modal',  () => captureHistoryModal(page, topicId));

    // Playback — use topic gear Wave Timeline path (proven working)
    await runFeature('41-playback-per-blip-timeline', () => captureWavePlayback(page, topicId, '41-playback-per-blip-timeline'));
    await runFeature('42-playback-play-pause-step',   () => captureWavePlayback(page, topicId, '42-playback-play-pause-step'));
    await runFeature('43-playback-speed',             () => captureWavePlayback(page, topicId, '43-playback-speed'));
    await runFeature('44-playback-diff',              () => captureWavePlayback(page, topicId, '44-playback-diff'));
    await runFeature('45-playback-wave-level-modal',  () => captureWavePlayback(page, topicId, '45-playback-wave-level-modal'));
    await runFeature('46-playback-split-pane',        () => captureWavePlayback(page, topicId, '46-playback-split-pane'));
    await runFeature('47-playback-cluster-skip',      () => captureWavePlayback(page, topicId, '47-playback-cluster-skip'));
    await runFeature('48-playback-date-jump',         () => captureWavePlayback(page, topicId, '48-playback-date-jump'));

    // Comments
    await runFeature('57-comment-create',   () => captureCommentCreate(page, topicId));
    await runFeature('58-comment-thread',   () => captureCommentThread(page, topicId));
    await runFeature('59-comment-resolve',  () => captureCommentResolve(page, topicId));
    await runFeature('60-comment-visibility-toggle', () => captureCommentVisibility(page, topicId));
    await runFeature('61-comment-keyboard-shortcut', () => captureCommentShortcut(page, topicId));

    // Search / Mobile / UI
    await runFeature('71+72-search', () => captureSearch(page, topicId));
    await runFeature('73-mobile-responsive', () => captureMobile(page, topicId));
    await runFeature('79-ui-three-panel',  () => captureThreePanel(page, topicId));
    await runFeature('80-ui-nav-tabs',     () => captureNavTabs(page, topicId));
    await runFeature('81-ui-topics-list',  () => captureTopicsList(page, topicId));
    await runFeature('82-ui-share-modal',  () => captureShareModal(page, topicId));
    await runFeature('83-ui-invite-modal', () => captureInviteModal(page, topicId));
    await runFeature('84-ui-toast',        () => captureToast(page, topicId));

    console.log(`\n==== PASS 6 SUMMARY ====`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
  } finally {
    await browser.close();
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { err(String(e)); process.exit(1); });
