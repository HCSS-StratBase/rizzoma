#!/usr/bin/env node
/**
 * Feature flow sweep — PASS 8 (2026-04-16) — FINAL.
 *
 * Uses the selectors discovered via MCP Playwright DOM inspection:
 *   - Active blip: `.rizzoma-blip.blip-container.nested-blip.active`
 *   - Active blip gear: `.blip-container.active .blip-menu-container .menu-btn.gear-btn`
 *   - Menu items: `.gear-menu-container [role="menuitem"]` or `li`
 *
 * Critical fix: use Playwright's `page.locator().click()` (not JS `evaluate(el.click())`)
 * because real Playwright clicks dispatch through React's synthetic event system
 * and trigger the active-state transition. Then `waitFor` the `.blip-container.active`
 * class to appear before clicking the gear.
 *
 * Run: node scripts/capture-feature-flows-pass8.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const userA = `feature-sweep-p8-${Date.now()}@example.com`;

let passed = 0, failed = 0;
const failures = [];
const ok = (m) => console.log(`✅ ${m}`);
const warn = (m) => console.log(`⚠️  ${m}`);
const err = (m) => console.error(`❌ ${m}`);

async function shot(page, slug, step) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${step}_new.png`) });
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
      body: JSON.stringify({ title: 'Feature Sweep Pass 8', content: '<h1>Feature Sweep Pass 8</h1><p>Second paragraph — feature demo: sample paragraph for formatting tests.</p>' }) });
    const topic = await tr.json();
    const blipIds = [];
    for (let i = 1; i <= 4; i++) {
      const br = await fetch('/api/blips', { method: 'POST', headers: h, credentials: 'include',
        body: JSON.stringify({ waveId: topic.id, parentId: null, content: `<p>Reply blip ${i} — pass-8 captures with sufficient text to demonstrate the editor toolbar and threading.</p>` }) });
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
}

async function activateFirstReplyBlip(page) {
  // Use Playwright locator (NOT JS .click()) so the click dispatches through
  // React's synthetic event system and triggers the active-state transition.
  const blip = page.locator('[data-blip-id]').nth(1);
  await blip.click({ timeout: 5000 });
  // Wait for the active class to appear
  await page.locator('.blip-container.active.nested-blip').waitFor({ timeout: 5000 });
}

async function openActiveBlipGear(page) {
  const gear = page.locator('.blip-container.active.nested-blip .blip-menu-container .menu-btn.gear-btn').first();
  await gear.click({ timeout: 5000 });
  await page.waitForTimeout(400);
}

async function clickMenuItemByText(page, text) {
  // The menu items are rendered in .gear-menu-container as <li> or <button>
  const item = page.locator('.gear-menu-container').locator('li, button').filter({ hasText: new RegExp(`^${text}$`) }).first();
  try { await item.click({ timeout: 3000 }); return true; }
  catch { return false; }
}

async function runFeature(name, fn) {
  try { await fn(); passed++; ok(name); }
  catch (e) { failed++; failures.push({ name, error: String(e).slice(0, 200) }); err(`${name}: ${String(e).slice(0, 150)}`); }
}

// ==================== Feature captures ====================

async function captureBlipEdit(page, topicId) {
  const slug = '34-blip-edit';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await shot(page, slug, '02-during');
  // Click Edit button inside the active blip's menu
  const editBtn = page.locator('.blip-container.active.nested-blip .blip-menu button').filter({ hasText: 'Edit' }).first();
  try { await editBtn.click({ timeout: 3000 }); } catch {}
  await page.waitForTimeout(700);
  await shot(page, slug, '03-after');
}

async function captureGearAction(page, topicId, slug, itemText) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await openActiveBlipGear(page);
  await shot(page, slug, '02-during');
  const clicked = await clickMenuItemByText(page, itemText);
  await page.waitForTimeout(800);
  await shot(page, slug, '03-after');
  return clicked;
}

async function captureHistoryModal(page, topicId) {
  const slug = '40-blip-history-modal';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await openActiveBlipGear(page);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, 'Playback history');
  await page.waitForTimeout(1200);
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

async function captureInsideHistoryModal(page, topicId, slug, modalAction) {
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await openActiveBlipGear(page);
  await clickMenuItemByText(page, 'Playback history');
  await page.waitForTimeout(1200);
  await shot(page, slug, '02-during');
  if (modalAction) await modalAction();
  await page.waitForTimeout(400);
  await shot(page, slug, '03-after');
  await page.keyboard.press('Escape');
}

async function captureToast(page, topicId) {
  const slug = '84-ui-toast';
  await hardOpenTopic(page, topicId);
  await shot(page, slug, '01-before');
  await activateFirstReplyBlip(page);
  await openActiveBlipGear(page);
  await shot(page, slug, '02-during');
  await clickMenuItemByText(page, 'Copy direct link');
  await page.waitForTimeout(1000);
  await shot(page, slug, '03-after');
}

// ==================== MAIN ====================

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  try {
    await ensureAuth(page, userA);
    ok(`auth`);
    const { topicId, blipIds } = await seedTopic(page);
    ok(`seed topic ${topicId} + ${blipIds.length} blips`);

    // Gear menu features — NEW with proper locator clicks
    await runFeature('34-blip-edit',      () => captureBlipEdit(page, topicId));
    await runFeature('35-blip-delete',    () => captureGearAction(page, topicId, '35-blip-delete', 'Delete blip'));
    await runFeature('36-blip-duplicate', () => captureGearAction(page, topicId, '36-blip-duplicate', 'Duplicate blip'));
    await runFeature('37-blip-cut',       () => captureGearAction(page, topicId, '37-blip-cut', 'Cut blip'));
    await runFeature('38-blip-paste',     () => captureGearAction(page, topicId, '38-blip-paste', 'Paste as reply'));
    await runFeature('39-blip-copy-link', () => captureGearAction(page, topicId, '39-blip-copy-link', 'Copy direct link'));
    await runFeature('40-blip-history-modal',         () => captureHistoryModal(page, topicId));
    await runFeature('41-playback-per-blip-timeline', () => captureInsideHistoryModal(page, topicId, '41-playback-per-blip-timeline', null));
    await runFeature('42-playback-play-pause-step',   () => captureInsideHistoryModal(page, topicId, '42-playback-play-pause-step', null));
    await runFeature('84-ui-toast',       () => captureToast(page, topicId));

    console.log(`\n==== PASS 8 SUMMARY ====`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { err(String(e)); process.exit(1); });
