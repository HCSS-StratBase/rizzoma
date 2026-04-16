#!/usr/bin/env node
/**
 * Feature flow sweep — PASS 4 (2026-04-16).
 *
 * Fixes three bugs that blocked pass 3:
 *   1. Gear-menu scoping — was picking the last ⚙️ in DOM (= topic gear).
 *      Pass 4: scope to the ACTIVE blip's .blip-menu-container.
 *   2. Editor-toolbar button selectors — matched multiple buttons.
 *      Pass 4: scope to the topic-root editor's own toolbar container.
 *   3. BLB inline markers missing — seeded blips had no anchorPosition.
 *      Pass 4: seed a child blip with `anchorPosition` so the parent
 *      renders a real inline [+] marker in its text.
 *
 * Unlocks target features:
 *   - 12, 13, 14 editor highlight/link/image (toolbar scoping)
 *   - 19, 20, 25 BLB inline expand/collapse/child (inline marker seed)
 *   - 34-40 blip ops (gear scoping)
 *   - 41-48 playback modals (depends on 40)
 *   - 84 toast (depends on gear-menu copy-link)
 *
 * Run:
 *   node scripts/capture-feature-flows-pass4.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const userA = `feature-sweep-p4a-${Date.now()}@example.com`;

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

// Seed a topic + parent blip + CHILD blip with anchorPosition (for inline markers)
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
        title: 'Feature Sweep Pass 4',
        content: '<h1>Feature Sweep Pass 4</h1><p>Second paragraph — feature demo: sample paragraph for formatting tests.</p>',
      }),
    });
    const topic = await tr.json();
    const blipIds = [];
    for (let i = 1; i <= 3; i++) {
      const br = await fetch('/api/blips', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          waveId: topic.id, parentId: null,
          content: `<p>Reply blip ${i} — pass-4 captures. Has enough text to demonstrate the editor toolbar + thread behaviours in follow-up tests.</p>`,
        }),
      });
      if (br.ok) { const b = await br.json(); blipIds.push(b.id); }
    }
    // Inline child blip anchored inside the first reply blip's text (position 10)
    let inlineChildId = null;
    if (blipIds.length > 0) {
      const ir = await fetch('/api/blips', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          waveId: topic.id,
          parentId: blipIds[0],
          anchorPosition: 10,
          content: '<p>Inline child for BLB pass-4 tests.</p>',
        }),
      });
      if (ir.ok) { const b = await ir.json(); inlineChildId = b.id; }
    }
    return { topicId: topic.id, blipIds, inlineChildId };
  }, { csrf });
  return r;
}

async function hardOpenTopic(page, topicId) {
  await page.goto('about:blank');
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.locator('.rizzoma-layout').waitFor({ timeout: 10000 });
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

// ============= Editor toolbar button click (SCOPED) =============
// Find the topic-root editor's toolbar and click the button by label.
async function clickEditorToolbarButton(page, label) {
  return page.evaluate((lbl) => {
    // The topic-root editor has a TipTap toolbar just above the ProseMirror.
    // Walk up from .ProseMirror to find the containing form/editor wrapper,
    // then find buttons in that wrapper only.
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return false;
    let wrapper = pm.parentElement;
    while (wrapper && wrapper.parentElement) {
      const btns = wrapper.querySelectorAll('button');
      if (btns.length > 5) break; // found the toolbar wrapper
      wrapper = wrapper.parentElement;
    }
    if (!wrapper) wrapper = document;
    const btns = Array.from(wrapper.querySelectorAll('button'));
    const match = btns.find(b => b.textContent?.trim() === lbl);
    if (match) { match.click(); return true; }
    return false;
  }, label);
}

// ============= Editor marks (clipped) =============
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

// ============= 12 Highlight — scoped toolbar + swatch click =============
async function captureHighlight(page, topicId) {
  const slug = '12-editor-highlight';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  await clickEditorToolbarButton(page, 'Bg');
  await page.waitForTimeout(400);
  // Click first visible swatch in the picker
  await page.evaluate(() => {
    // Look for color swatches — inline-styled backgrounds, or role=menuitemradio
    const candidates = Array.from(document.querySelectorAll('button, [role="menuitem"], [role="menuitemradio"], .swatch, [data-color]'));
    const colorSwatch = candidates.find(b => {
      const bg = window.getComputedStyle(b).backgroundColor;
      return bg && !bg.includes('rgba(0, 0, 0, 0)') && !bg.includes('rgb(255, 255, 255)') && b.offsetWidth > 0 && b.offsetWidth < 60;
    });
    if (colorSwatch) colorSwatch.click();
  });
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

// ============= 13 Link — scoped + dialog handler =============
async function captureLink(page, topicId) {
  const slug = '13-editor-link';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  page.once('dialog', (d) => d.accept('https://example.com/pass4'));
  await clickEditorToolbarButton(page, '🔗');
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

// ============= 14 Image — scoped + dialog handler =============
async function captureImage(page, topicId) {
  const slug = '14-editor-image';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await shot(page, slug, '02-during');
  page.once('dialog', (d) => d.accept('https://via.placeholder.com/200x100.png'));
  await clickEditorToolbarButton(page, '🖼️');
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

// ============= 15 / 16 =============
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

// ============= BLB 17/18 =============
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

// ============= BLB 19/20 inline expand/collapse (with seeded marker) =============
async function captureInlineExpand(page, topicId) {
  const slug = '19-blb-inline-expand';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Find any inline marker span. Our seed has a child blip with anchorPosition
  // in the first reply blip — RizzomaBlip should render a [+] span.
  const found = await page.evaluate(() => {
    // Rizzoma renders markers as span elements with text "+ +" or "+"
    const spans = Array.from(document.querySelectorAll('span')).filter(s => /^\+\s*\+?$/.test(s.textContent?.trim() || ''));
    if (spans.length > 0) { spans[0].click(); return 'span+'; }
    // Fallback: look for data attributes
    const alt = document.querySelectorAll('[data-inline-marker], .inline-blip-marker, [class*="inline-marker"]');
    if (alt.length > 0) { alt[0].click(); return 'data'; }
    return 'none';
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
  return found;
}

async function captureCollapseBack(page, topicId) {
  const slug = '20-blb-collapse-back';
  await hardOpenTopic(page, topicId);
  // Expand first
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span')).filter(s => /^\+\s*\+?$/.test(s.textContent?.trim() || ''));
    if (spans.length > 0) spans[0].click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '01-before');
  // Collapse (click same marker, now −)
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span')).filter(s => /^[−\-]\s*[−\-]?$/.test(s.textContent?.trim() || ''));
    if (spans.length > 0) { spans[0].click(); return; }
    // Fallback: click the marker again
    const plus = Array.from(document.querySelectorAll('span')).filter(s => /^\+\s*\+?$/.test(s.textContent?.trim() || ''));
    if (plus.length > 0) plus[0].click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

async function captureCtrlEnterChild(page, topicId) {
  const slug = '25-blb-ctrl-enter-child';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Click into the first reply blip to make it editable
  await page.evaluate(() => {
    const blips = document.querySelectorAll('[data-blip-id], .rizzoma-blip');
    if (blips.length >= 2) blips[1].click();
  });
  await page.waitForTimeout(400);
  // Place cursor somewhere inside reply
  await page.evaluate(() => {
    const eds = document.querySelectorAll('.ProseMirror');
    if (eds.length >= 2) {
      eds[1].focus();
      const range = document.createRange();
      range.selectNodeContents(eds[1]);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
  await shot(page, slug, '02-during');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

// ============= BLB 26 fold/unfold =============
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

// ============= Widgets 27-30 =============
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

// ============= GEAR MENU — SCOPED TO ACTIVE BLIP =============

async function activateFirstReplyBlipLocator(page) {
  // Use Playwright locator to click the first reply blip (robust)
  const blip = page.locator('[data-blip-id]').nth(1);
  try {
    await blip.click({ timeout: 3000 });
    await page.waitForTimeout(400);
    return true;
  } catch { return false; }
}

// Open the ACTIVE blip's gear menu (not the topic-level gear)
async function openActiveBlipGear(page) {
  // Try a scoped locator: gear button inside an active blip's menu container
  const gear = page.locator('.blip-container.active .blip-menu-container button, .rizzoma-blip[data-blip-active="true"] button').filter({ hasText: '⚙️' }).first();
  try {
    await gear.click({ timeout: 2000 });
    await page.waitForTimeout(400);
    return true;
  } catch {
    // Fallback: any gear inside a blip-menu-container (not in the topic header)
    const alt = page.locator('.blip-menu-container button').filter({ hasText: '⚙️' }).first();
    try {
      await alt.click({ timeout: 2000 });
      await page.waitForTimeout(400);
      return true;
    } catch {}
  }
  return false;
}

async function clickMenuItem(page, text) {
  const item = page.locator('[role="menuitem"], .menu-item, li, button').filter({ hasText: new RegExp(`^${text}$`) }).first();
  try {
    await item.click({ timeout: 2000 });
    await page.waitForTimeout(500);
    return true;
  } catch { return false; }
}

async function captureReply(page, topicId) {
  const slug = '33-blip-reply';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Click the Write a reply... textarea
  const reply = page.locator('textarea[placeholder*="reply" i], input[placeholder*="reply" i], [placeholder*="Write a reply" i]').first();
  try { await reply.click({ timeout: 2000 }); } catch {}
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await page.keyboard.type('Pass 4 reply demo text');
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
}

async function captureBlipEdit(page, topicId) {
  const slug = '34-blip-edit';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlipLocator(page);
  await shot(page, slug, '02-during');
  // Click the Edit button in the active blip's menu
  const editBtn = page.locator('.blip-menu-container button').filter({ hasText: 'Edit' }).first();
  try { await editBtn.click({ timeout: 2000 }); } catch {}
  await page.waitForTimeout(500);
  await shot(page, slug, '03-after');
}

async function captureGearAction(page, topicId, slug, itemText, postDelay = 500) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlipLocator(page);
  const opened = await openActiveBlipGear(page);
  await shot(page, slug, '02-during');
  if (opened) {
    await clickMenuItem(page, itemText);
  }
  await page.waitForTimeout(postDelay);
  await shot(page, slug, '03-after');
}

async function captureHistoryModal(page, topicId) {
  const slug = '40-blip-history-modal';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlipLocator(page);
  await openActiveBlipGear(page);
  await shot(page, slug, '02-during');
  await clickMenuItem(page, 'Playback history');
  await page.waitForTimeout(1000);
  await shot(page, slug, '03-after');
}

async function captureInsideHistoryModal(page, topicId, slug, modalAction) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlipLocator(page);
  await openActiveBlipGear(page);
  await clickMenuItem(page, 'Playback history');
  await page.waitForTimeout(1000);
  await shot(page, slug, '02-during');
  if (modalAction) await modalAction();
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

// ============= Wave playback (topic gear → Wave Timeline) =============
async function captureWavePlayback(page, topicId, slug, modalAction) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Topic-level gear is the FIRST ⚙️ (inside the topic toolbar)
  const topicGear = page.locator('.rizzoma-topic-detail .blip-menu-container button, button').filter({ hasText: '⚙️' }).first();
  try { await topicGear.click({ timeout: 2000 }); } catch {}
  await page.waitForTimeout(400);
  await shot(page, slug, '02-during');
  // Click Wave Timeline / Wave playback
  const waveBtn = page.locator('[role="menuitem"], .menu-item, button').filter({ hasText: /wave\s*(timeline|playback)/i }).first();
  try { await waveBtn.click({ timeout: 2000 }); } catch {}
  await page.waitForTimeout(1000);
  if (modalAction) await modalAction();
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

// ============= Inline comments =============
async function captureCommentCreate(page, topicId) {
  const slug = '57-comment-create';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  // Click the 💬+ button
  const commentBtn = page.locator('button').filter({ hasText: '💬+' }).first();
  try { await commentBtn.click({ timeout: 2000 }); } catch {}
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await page.keyboard.type('Pass 4 inline comment');
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

// ============= Search =============
async function captureSearch(page, topicId) {
  const slug71 = '71-search-fulltext';
  await hardOpenTopic(page, topicId);
  await shot(page, slug71, '01-before');
  const box = page.locator('input[placeholder*="Search topics"]').first();
  await box.click();
  await box.fill('Pass 4');
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
  await clipShot(page, slug, '01-before', 'aside:first-of-type, [data-topics-list], .topics-list');
  await clipShot(page, slug, '02-during', 'aside:first-of-type, [data-topics-list], .topics-list');
  await clipShot(page, slug, '03-after', 'aside:first-of-type, [data-topics-list], .topics-list');
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
  await activateFirstReplyBlipLocator(page);
  await openActiveBlipGear(page);
  await shot(page, slug, '02-during');
  await clickMenuItem(page, 'Copy direct link');
  await page.waitForTimeout(800);
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
    const { topicId, blipIds, inlineChildId } = await seedTopic(page);
    ok(`seed topic ${topicId} with ${blipIds.length} blips + inline child ${inlineChildId || 'none'}`);

    // Editor marks
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

    // 12 / 13 / 14 with scoped toolbar
    await runFeature('12-editor-highlight', () => captureHighlight(page, topicId));
    await runFeature('13-editor-link',      () => captureLink(page, topicId));
    await runFeature('14-editor-image',     () => captureImage(page, topicId));

    // 15 / 16
    await runFeature('15-editor-mention-dropdown', () => captureMention(page, topicId));
    await runFeature('16-editor-gadget-palette',   () => captureGadgetPalette(page, topicId));

    // BLB
    await runFeature('17-blb-collapsed-toc',    () => captureBlbCollapsed(page, topicId));
    await runFeature('18-blb-section-expanded', () => captureBlbExpanded(page, topicId));
    await runFeature('19-blb-inline-expand',    () => captureInlineExpand(page, topicId));
    await runFeature('20-blb-collapse-back',    () => captureCollapseBack(page, topicId));
    await runFeature('25-blb-ctrl-enter-child', () => captureCtrlEnterChild(page, topicId));
    await runFeature('26-blb-fold-unfold-all',  () => captureFoldUnfold(page, topicId));

    // Widgets
    await runFeature('27-widget-mention-pill', () => captureWidgetChar(page, topicId, '27-widget-mention-pill', '@'));
    await runFeature('28-widget-task-pill',    () => captureWidgetChar(page, topicId, '28-widget-task-pill',    '~'));
    await runFeature('29-widget-tag',          () => captureWidgetChar(page, topicId, '29-widget-tag',          '#'));
    await runFeature('30-widget-right-panel-buttons', () => captureRightPanel(page, topicId));

    // Gear menu (scoped)
    await runFeature('33-blip-reply',          () => captureReply(page, topicId));
    await runFeature('34-blip-edit',           () => captureBlipEdit(page, topicId));
    await runFeature('35-blip-delete',         () => captureGearAction(page, topicId, '35-blip-delete', 'Delete blip'));
    await runFeature('36-blip-duplicate',      () => captureGearAction(page, topicId, '36-blip-duplicate', 'Duplicate blip'));
    await runFeature('37-blip-cut',            () => captureGearAction(page, topicId, '37-blip-cut', 'Cut blip'));
    await runFeature('38-blip-paste',          () => captureGearAction(page, topicId, '38-blip-paste', 'Paste as reply'));
    await runFeature('39-blip-copy-link',      () => captureGearAction(page, topicId, '39-blip-copy-link', 'Copy direct link'));
    await runFeature('40-blip-history-modal',  () => captureHistoryModal(page, topicId));

    // Playback drill-down
    await runFeature('41-playback-per-blip-timeline', () => captureInsideHistoryModal(page, topicId, '41-playback-per-blip-timeline', null));
    await runFeature('42-playback-play-pause-step',   () => captureInsideHistoryModal(page, topicId, '42-playback-play-pause-step', async () => {
      const p = page.locator('button').filter({ hasText: /^▶$|play/i }).first();
      try { await p.click({ timeout: 1000 }); } catch {}
    }));
    await runFeature('43-playback-speed', () => captureInsideHistoryModal(page, topicId, '43-playback-speed', async () => {
      const s = page.locator('select, [class*="speed"] button').first();
      try { await s.click({ timeout: 1000 }); } catch {}
    }));
    await runFeature('44-playback-diff',  () => captureInsideHistoryModal(page, topicId, '44-playback-diff', async () => {
      const d = page.locator('button').filter({ hasText: /diff/i }).first();
      try { await d.click({ timeout: 1000 }); } catch {}
    }));

    // Wave playback
    await runFeature('45-playback-wave-level-modal', () => captureWavePlayback(page, topicId, '45-playback-wave-level-modal', null));
    await runFeature('46-playback-split-pane',       () => captureWavePlayback(page, topicId, '46-playback-split-pane', null));
    await runFeature('47-playback-cluster-skip',     () => captureWavePlayback(page, topicId, '47-playback-cluster-skip', null));
    await runFeature('48-playback-date-jump',        () => captureWavePlayback(page, topicId, '48-playback-date-jump', null));

    // Comments
    await runFeature('57-comment-create', () => captureCommentCreate(page, topicId));

    // Search / Mobile / UI
    await runFeature('71+72-search', () => captureSearch(page, topicId));
    await runFeature('73-mobile-responsive', () => captureMobile(page, topicId));
    await runFeature('79-ui-three-panel',  () => captureThreePanel(page, topicId));
    await runFeature('80-ui-nav-tabs',     () => captureNavTabs(page, topicId));
    await runFeature('81-ui-topics-list',  () => captureTopicsList(page, topicId));
    await runFeature('82-ui-share-modal',  () => captureShareModal(page, topicId));
    await runFeature('83-ui-invite-modal', () => captureInviteModal(page, topicId));
    await runFeature('84-ui-toast',        () => captureToast(page, topicId));

    console.log(`\n==== PASS 4 SUMMARY ====`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  } finally {
    await browser.close();
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { err(String(e)); process.exit(1); });
