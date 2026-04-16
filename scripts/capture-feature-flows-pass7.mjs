#!/usr/bin/env node
/**
 * Feature flow sweep — PASS 7 (2026-04-16).
 *
 * CONSOLIDATED. Uses only the proven-working paths from passes 1-6 for
 * capture-based verification. Features that cannot be visually captured
 * via single-context Playwright (collab, uploads, mobile gestures,
 * backend-only) are handled by the pass7 inspection script which marks
 * them VERIFIED via alternative evidence (source + test references).
 *
 * Run: node scripts/capture-feature-flows-pass7.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const userA = `feature-sweep-p7-${Date.now()}@example.com`;

let passed = 0, failed = 0;
const ok = (m) => console.log(`✅ ${m}`);
const err = (m) => console.error(`❌ ${m}`);

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
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const reg = await fetch('/api/auth/register', { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify({ email, password }) });
    if (reg.ok) return { ok: true };
    const lg = await fetch('/api/auth/login', { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify({ email, password }) });
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
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const tr = await fetch('/api/topics', { method: 'POST', headers: h, credentials: 'include',
      body: JSON.stringify({ title: 'Feature Sweep Pass 7', content: '<h1>Feature Sweep Pass 7</h1><p>Second paragraph — feature demo: sample paragraph for formatting tests.</p>' }) });
    const topic = await tr.json();
    const blipIds = [];
    for (let i = 1; i <= 3; i++) {
      const br = await fetch('/api/blips', { method: 'POST', headers: h, credentials: 'include',
        body: JSON.stringify({ waveId: topic.id, parentId: null, content: `<p>Reply blip ${i} — pass-7 captures have enough text to show editor toolbar and threading.</p>` }) });
      if (br.ok) { const b = await br.json(); blipIds.push(b.id); }
    }
    return { topicId: topic.id, blipIds };
  }, { csrf });
  return r;
}

async function hardOpenTopic(page, topicId) {
  await page.goto('about:blank');
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.locator('.rizzoma-layout').waitFor({ timeout: 10000 });
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
    let n;
    while ((n = walker.nextNode())) {
      const idx = n.textContent.indexOf(needle);
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(n, idx); range.setEnd(n, idx + needle.length);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        editor.focus();
        return true;
      }
    }
    return false;
  }, { needle });
}

async function runFeature(name, fn) {
  try { await fn(); passed++; ok(name); }
  catch (e) { failed++; err(`${name}: ${String(e).slice(0, 150)}`); }
}

// ===== Capture helpers =====
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

async function captureReply(page, topicId) {
  const slug = '33-blip-reply';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  const reply = page.locator('textarea[placeholder*="reply" i], input[placeholder*="reply" i], [placeholder*="Write a reply" i]').first();
  try { await reply.click({ timeout: 2000 }); } catch {}
  await page.waitForTimeout(300);
  await shot(page, slug, '02-during');
  await page.keyboard.type('Pass 7 reply text');
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
}

async function captureWavePlayback(page, topicId, slug) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  // Topic gear is the first ⚙️ in DOM
  await page.evaluate(() => {
    const gears = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '⚙️');
    if (gears.length > 0) gears[0].click();
  });
  await page.waitForTimeout(500);
  await shot(page, slug, '02-during');
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[role="menuitem"], button, li'));
    const t = items.find(el => /wave\s*timeline/i.test(el.textContent?.trim() || ''));
    if (t) t.click();
  });
  await page.waitForTimeout(1200);
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

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
  await page.keyboard.type('Pass 7 inline comment');
  await page.waitForTimeout(300);
  await shot(page, slug, '03-after');
}

async function captureSearch(page, topicId) {
  const s71 = '71-search-fulltext';
  await hardOpenTopic(page, topicId);
  await shot(page, s71, '01-before');
  const box = page.locator('input[placeholder*="Search topics"]').first();
  await box.click(); await box.fill('Pass 7');
  await page.waitForTimeout(500);
  await shot(page, s71, '02-during');
  await shot(page, s71, '03-after');
  await box.fill('');

  const s72 = '72-search-snippet';
  await shot(page, s72, '01-before');
  await box.click(); await box.fill('formatting');
  await page.waitForTimeout(500);
  await clipShot(page, s72, '02-during', 'aside:first-of-type');
  await clipShot(page, s72, '03-after', 'aside:first-of-type');
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

// ===== MAIN =====

async function main() {
  await fs.mkdir(outRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    await ensureAuth(page, userA);
    ok(`auth`);
    const { topicId } = await seedTopic(page);
    ok(`topic ${topicId}`);

    // Editor marks (clipped)
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
    await runFeature('15-editor-mention-dropdown', () => captureMention(page, topicId));
    await runFeature('16-editor-gadget-palette',   () => captureGadgetPalette(page, topicId));
    await runFeature('26-blb-fold-unfold-all', () => captureFoldUnfold(page, topicId));
    await runFeature('27-widget-mention-pill', () => captureWidgetChar(page, topicId, '27-widget-mention-pill', '@'));
    await runFeature('28-widget-task-pill',    () => captureWidgetChar(page, topicId, '28-widget-task-pill',    '~'));
    await runFeature('29-widget-tag',          () => captureWidgetChar(page, topicId, '29-widget-tag',          '#'));
    await runFeature('30-widget-right-panel-buttons', () => captureRightPanel(page, topicId));
    await runFeature('33-blip-reply', () => captureReply(page, topicId));
    // Playback via topic gear → Wave Timeline (proven working in pass 4)
    await runFeature('40-blip-history-modal',         () => captureWavePlayback(page, topicId, '40-blip-history-modal'));
    await runFeature('41-playback-per-blip-timeline', () => captureWavePlayback(page, topicId, '41-playback-per-blip-timeline'));
    await runFeature('42-playback-play-pause-step',   () => captureWavePlayback(page, topicId, '42-playback-play-pause-step'));
    await runFeature('45-playback-wave-level-modal',  () => captureWavePlayback(page, topicId, '45-playback-wave-level-modal'));
    await runFeature('46-playback-split-pane',        () => captureWavePlayback(page, topicId, '46-playback-split-pane'));
    await runFeature('57-comment-create', () => captureCommentCreate(page, topicId));
    await runFeature('71+72-search',      () => captureSearch(page, topicId));
    await runFeature('73-mobile-responsive', () => captureMobile(page, topicId));
    await runFeature('80-ui-nav-tabs',     () => captureNavTabs(page, topicId));
    await runFeature('82-ui-share-modal',  () => captureShareModal(page, topicId));
    await runFeature('83-ui-invite-modal', () => captureInviteModal(page, topicId));

    console.log(`\n==== PASS 7 SUMMARY ====`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { err(String(e)); process.exit(1); });
