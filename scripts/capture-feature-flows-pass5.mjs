#!/usr/bin/env node
/**
 * Feature flow sweep — PASS 5 (2026-04-16).
 *
 * Fixes:
 *   1. Gear-menu scoping — use `.blip-menu-container` nth(1) (second one =
 *      first reply blip's menu, not the topic-root editor menu).
 *   2. Picker dismissal — click the ProseMirror editor area BEFORE the
 *      next feature runs so any open TipTap bubble menu closes.
 *   3. Highlight swatch click — use the real picker DOM structure.
 *   4. Comment thread seeding — POST /api/comments to create a seed
 *      comment, then the thread/resolve/visibility/shortcut tests can
 *      interact with it.
 *
 * Run: node scripts/capture-feature-flows-pass5.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const userA = `feature-sweep-p5-${Date.now()}@example.com`;

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

// Seed topic + blips + 1 inline comment (for thread tests)
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
        title: 'Feature Sweep Pass 5',
        content: '<h1>Feature Sweep Pass 5</h1><p>Second paragraph — feature demo: sample paragraph for formatting tests.</p>',
      }),
    });
    const topic = await tr.json();
    const blipIds = [];
    for (let i = 1; i <= 3; i++) {
      const br = await fetch('/api/blips', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          waveId: topic.id, parentId: null,
          content: `<p>Reply blip ${i} — pass-5 captures. Has enough text to show editor toolbar + threading.</p>`,
        }),
      });
      if (br.ok) { const b = await br.json(); blipIds.push(b.id); }
    }
    // Seed a comment on the first reply blip
    let commentId = null;
    if (blipIds.length > 0) {
      const cr = await fetch('/api/comments', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          blipId: blipIds[0],
          anchorStart: 0,
          anchorEnd: 10,
          anchorText: 'Reply blip',
          body: 'Seed comment for pass-5 thread tests',
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
  await page.waitForTimeout(800);
  await page.locator('.rizzoma-layout').waitFor({ timeout: 10000 });
  // Close any picker/menu that survived the remount
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
    failures.push({ name, error: String(e).slice(0, 300) });
    err(`${name}: ${String(e).slice(0, 200)}`);
  }
}

// ==================== Core capture helpers ====================

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

// ==================== 12/13/14 fixed ====================

async function captureHighlight(page, topicId) {
  const slug = '12-editor-highlight';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await selectTextInEditor(page, 'sample paragraph');
  await shot(page, slug, '02-during');
  // Click Bg button
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === 'Bg');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  // Click a colored swatch — try multiple patterns
  const swatchClicked = await page.evaluate(() => {
    const strategies = [
      () => Array.from(document.querySelectorAll('button[aria-label*="yellow" i], button[title*="yellow" i]')),
      () => Array.from(document.querySelectorAll('[class*="highlight"] button, [class*="color-picker"] button')),
      () => Array.from(document.querySelectorAll('button')).filter(b => {
        const bg = window.getComputedStyle(b).backgroundColor;
        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)' && !bg.includes('0, 0, 0') && b.offsetWidth > 0 && b.offsetWidth < 60 && b.offsetHeight < 60;
      }),
      () => Array.from(document.querySelectorAll('[role="menuitem"]')),
    ];
    for (const s of strategies) {
      const arr = s();
      if (arr.length > 0) {
        arr[0].click();
        return 'clicked';
      }
    }
    return 'no swatch';
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
  // Dismiss any open bubble menu first
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  await selectTextInEditor(page, 'sample paragraph');
  // Use Ctrl+K keyboard shortcut (TipTap link command)
  page.once('dialog', (d) => d.accept('https://example.com/pass5'));
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

async function captureImage(page, topicId) {
  const slug = '14-editor-image';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await shot(page, slug, '02-during');
  page.once('dialog', (d) => d.accept('https://via.placeholder.com/200x100.png'));
  // Click the 🖼️ button inside the topic-root editor only (first match from ProseMirror upward)
  await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    if (!pm) return;
    let wrapper = pm.parentElement;
    while (wrapper && wrapper.parentElement) {
      const btn = Array.from(wrapper.querySelectorAll('button')).find(b => b.textContent?.trim() === '🖼️');
      if (btn) { btn.click(); return; }
      wrapper = wrapper.parentElement;
    }
  });
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

// ==================== 15/16 ====================

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

// ==================== BLB 17/18/26 ====================

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

// ==================== Widgets 27-30 ====================

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

// ==================== GEAR MENU — FIXED SCOPING ====================
//
// The DOM has multiple `.blip-menu-container` elements:
//   index 0 = topic-root editor's menu container (Done / 💬 / 💬+ / 🔗 / ⚙️)
//   index 1 = first reply blip's menu container (Edit / ... / ⚙️)
// Clicking index 0's ⚙️ opens the TOPIC gear.
// Clicking index 1's ⚙️ opens the BLIP gear.
//
// So the fix is: activate the blip, then click the SECOND .blip-menu-container's ⚙️.

async function activateBlipIndex(page, index = 1) {
  // Click a reply blip to activate it. Index 1 = first reply (0 = topic root).
  const ok = await page.evaluate((i) => {
    const blips = document.querySelectorAll('[data-blip-id]');
    if (blips.length <= i) return false;
    blips[i].click();
    return true;
  }, index);
  await page.waitForTimeout(500);
  return ok;
}

async function openBlipGearIndex(page, index = 1) {
  // Click the ⚙️ inside the Nth .blip-menu-container
  const clicked = await page.evaluate((i) => {
    const containers = document.querySelectorAll('.blip-menu-container');
    if (containers.length <= i) return false;
    const gear = Array.from(containers[i].querySelectorAll('button')).find(b => b.textContent?.trim() === '⚙️');
    if (gear) { gear.click(); return true; }
    return false;
  }, index);
  await page.waitForTimeout(500);
  return clicked;
}

async function clickMenuItemByText(page, text) {
  return page.evaluate((txt) => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"], .menu-item, li, button'));
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
  await page.keyboard.type('Pass 5 reply demo text');
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
}

async function captureBlipEdit(page, topicId) {
  const slug = '34-blip-edit';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateBlipIndex(page, 1);
  await shot(page, slug, '02-during');
  // Click the Edit button inside the second .blip-menu-container (first reply's menu)
  await page.evaluate(() => {
    const containers = document.querySelectorAll('.blip-menu-container');
    if (containers.length < 2) return;
    const edit = Array.from(containers[1].querySelectorAll('button')).find(b => b.textContent?.trim() === 'Edit');
    if (edit) edit.click();
  });
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

async function captureGearAction(page, topicId, slug, itemText, postDelay = 700) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateBlipIndex(page, 1);
  await openBlipGearIndex(page, 1);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, itemText);
  await page.waitForTimeout(postDelay);
  await shot(page, slug, '03-after');
}

async function captureHistoryModal(page, topicId) {
  const slug = '40-blip-history-modal';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateBlipIndex(page, 1);
  await openBlipGearIndex(page, 1);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, 'Playback history');
  await page.waitForTimeout(1000);
  await shot(page, slug, '03-after');
}

async function captureInsideHistoryModal(page, topicId, slug, modalAction) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateBlipIndex(page, 1);
  await openBlipGearIndex(page, 1);
  await clickMenuItemByText(page, 'Playback history');
  await page.waitForTimeout(1000);
  await shot(page, slug, '02-during');
  if (modalAction) await modalAction();
  await page.waitForTimeout(400);
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

async function captureWavePlayback(page, topicId, slug) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Topic-level gear is index 0 of .blip-menu-container
  await openBlipGearIndex(page, 0);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, 'Wave Timeline');
  await page.waitForTimeout(1000);
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

// ==================== Comments 57-61 ====================

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
  await page.keyboard.type('Pass 5 inline comment');
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

async function captureCommentThread(page, topicId) {
  // A seed comment already exists on the first reply blip.
  // Open the comment panel, then show the thread.
  const slug = '58-comment-thread';
  await hardOpenTopic(page, topicId);
  await activateBlipIndex(page, 1);
  await page.waitForTimeout(300);
  await shot(page, slug, '01-before');
  // Click 💬 (show comments)
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '💬');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await shot(page, slug, '03-after');
}

async function captureCommentResolve(page, topicId) {
  const slug = '59-comment-resolve';
  await hardOpenTopic(page, topicId);
  await activateBlipIndex(page, 1);
  await page.waitForTimeout(300);
  // Open comments panel
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === '💬');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '01-before');
  // Click a Resolve button
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
  // Ctrl+Shift+Up should hide comments
  await page.keyboard.press('Control+Shift+ArrowUp');
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  // Ctrl+Shift+Down should show them
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

// ==================== 71/72 Search ====================

async function captureSearch(page, topicId) {
  const slug71 = '71-search-fulltext';
  await hardOpenTopic(page, topicId);
  await shot(page, slug71, '01-before');
  const box = page.locator('input[placeholder*="Search topics"]').first();
  await box.click();
  await box.fill('Pass 5');
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

// ==================== Mobile ====================

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

// ==================== UI shell ====================

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
  await clipShot(page, slug, '01-before', 'aside:first-of-type');
  const box = page.locator('input[placeholder*="Search topics"]').first();
  await box.click();
  await box.fill('Pass');
  await page.waitForTimeout(400);
  await clipShot(page, slug, '02-during', 'aside:first-of-type');
  await box.fill('');
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
  await activateBlipIndex(page, 1);
  await openBlipGearIndex(page, 1);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, 'Copy direct link');
  await page.waitForTimeout(800);
  await shot(page, slug, '03-after');
}

// ==================== MAIN ====================

async function main() {
  await fs.mkdir(outRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await ensureAuth(page, userA);
    ok(`auth as ${userA}`);
    const { topicId, blipIds, commentId } = await seedTopic(page);
    ok(`seed topic ${topicId} + ${blipIds.length} blips + comment ${commentId || 'none'}`);

    // Editor marks & blocks
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

    // BLB
    await runFeature('17-blb-collapsed-toc',    () => captureBlbCollapsed(page, topicId));
    await runFeature('18-blb-section-expanded', () => captureBlbExpanded(page, topicId));
    await runFeature('26-blb-fold-unfold-all',  () => captureFoldUnfold(page, topicId));

    // Widgets
    await runFeature('27-widget-mention-pill', () => captureWidgetChar(page, topicId, '27-widget-mention-pill', '@'));
    await runFeature('28-widget-task-pill',    () => captureWidgetChar(page, topicId, '28-widget-task-pill',    '~'));
    await runFeature('29-widget-tag',          () => captureWidgetChar(page, topicId, '29-widget-tag',          '#'));
    await runFeature('30-widget-right-panel-buttons', () => captureRightPanel(page, topicId));

    // Gear menu (FIXED scoping)
    await runFeature('33-blip-reply',          () => captureReply(page, topicId));
    await runFeature('34-blip-edit',           () => captureBlipEdit(page, topicId));
    await runFeature('35-blip-delete',         () => captureGearAction(page, topicId, '35-blip-delete', 'Delete blip'));
    await runFeature('36-blip-duplicate',      () => captureGearAction(page, topicId, '36-blip-duplicate', 'Duplicate blip'));
    await runFeature('37-blip-cut',            () => captureGearAction(page, topicId, '37-blip-cut', 'Cut blip'));
    await runFeature('38-blip-paste',          () => captureGearAction(page, topicId, '38-blip-paste', 'Paste as reply'));
    await runFeature('39-blip-copy-link',      () => captureGearAction(page, topicId, '39-blip-copy-link', 'Copy direct link'));
    await runFeature('40-blip-history-modal',  () => captureHistoryModal(page, topicId));

    // Playback
    await runFeature('41-playback-per-blip-timeline', () => captureInsideHistoryModal(page, topicId, '41-playback-per-blip-timeline', null));
    await runFeature('42-playback-play-pause-step',   () => captureInsideHistoryModal(page, topicId, '42-playback-play-pause-step', null));
    await runFeature('43-playback-speed',             () => captureInsideHistoryModal(page, topicId, '43-playback-speed', null));
    await runFeature('44-playback-diff',              () => captureInsideHistoryModal(page, topicId, '44-playback-diff', null));
    await runFeature('45-playback-wave-level-modal',  () => captureWavePlayback(page, topicId, '45-playback-wave-level-modal'));
    await runFeature('46-playback-split-pane',        () => captureWavePlayback(page, topicId, '46-playback-split-pane'));
    await runFeature('47-playback-cluster-skip',      () => captureWavePlayback(page, topicId, '47-playback-cluster-skip'));
    await runFeature('48-playback-date-jump',         () => captureWavePlayback(page, topicId, '48-playback-date-jump'));

    // Comments (with seed)
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

    console.log(`\n==== PASS 5 SUMMARY ====`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  } finally {
    await browser.close();
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { err(String(e)); process.exit(1); });
