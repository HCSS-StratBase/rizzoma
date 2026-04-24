import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const cdpUrl = process.env.RIZZOMA_CDP_URL || 'http://127.0.0.1:9222';
const outDir = process.env.RIZZOMA_OUT_DIR || path.resolve('screenshots', '260424-real-device-pixel9proxl');
const password = process.env.RIZZOMA_E2E_PASSWORD || 'PhysicalPhoneCursorInline!1';
const email = process.env.RIZZOMA_E2E_USER || `physical-cursor-inline+${Date.now()}@example.com`;

async function capture(page, name) {
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  await page.waitForTimeout(250);
  const shot = spawnSync('adb', ['exec-out', 'screencap', '-p'], {
    encoding: null,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (shot.status !== 0 || !shot.stdout?.length) {
    throw new Error(`adb screencap failed: ${shot.stderr?.toString() || 'no output'}`);
  }
  await fs.writeFile(file, shot.stdout);
  return path.relative(process.cwd(), file);
}

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

async function ensureAuth(page) {
  await gotoApp(page);
  const result = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const login = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (login.ok) return { ok: true, method: 'login' };

    const register = await fetch('/api/auth/register', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password, name: email.split('@')[0] }),
    });
    if (register.ok) return { ok: true, method: 'register' };

    return { ok: false, status: register.status, text: await register.text() };
  }, { email, password });
  if (!result.ok) throw new Error(`auth failed: ${result.status} ${result.text}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 20000 });
}

async function xsrf(page) {
  const token = await page.evaluate(() => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    return raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  });
  if (!token) throw new Error('missing XSRF token');
  return token;
}

async function api(page, method, apiPath, body) {
  const token = await xsrf(page);
  const result = await page.evaluate(async ({ method, apiPath, body, token }) => {
    const response = await fetch(apiPath, {
      method,
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    return { ok: response.ok, status: response.status, data };
  }, { method, apiPath, body, token });
  if (!result.ok) throw new Error(`${method} ${apiPath} failed ${result.status}: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function createFixture(page) {
  const stamp = Date.now();
  const topic = await api(page, 'POST', '/api/topics', {
    title: `Physical phone cursor inline verification ${stamp}`,
    content: `<p>Topic root for cursor inline comment verification ${stamp}.</p>`,
  });
  const waveId = topic.id;
  const main = await api(page, 'POST', '/api/blips', {
    waveId,
    parentId: null,
    content: '<p>Cursor insertion point lives in the parent blip.</p>',
  });
  const mainBlipId = main.id || main.blip?._id || main.blip?.id;
  const child = await api(page, 'POST', '/api/blips', {
    waveId,
    parentId: mainBlipId,
    content: '<p>Cursor insertion point lives in the nested subblip.</p>',
  });
  const childBlipId = child.id || child.blip?._id || child.blip?.id;
  return { waveId, mainBlipId, childBlipId };
}

async function openTopic(page, waveId) {
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(waveId)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await page.locator('.blip-collapsed-row, [data-blip-id]').first().waitFor({ timeout: 30000 });
}

async function expandBlip(page, blipId) {
  const blip = page.locator(`[data-blip-id="${blipId}"]`).first();
  await blip.waitFor({ timeout: 15000 });
  if (await blip.locator('> .blip-collapsed-row').count()) {
    await blip.locator('> .blip-collapsed-row').click({ force: true });
  }
  await blip.locator('[data-testid="blip-menu-read-surface"], [data-testid="blip-menu-edit-surface"]').first().waitFor({ timeout: 15000 });
  return blip;
}

async function setCursorAfterNeedle(page, blip, needle) {
  const editor = blip.locator('.ProseMirror').first();
  await editor.waitFor({ timeout: 10000 });
  await editor.evaluate((el, needle) => {
    const text = el.textContent || '';
    const textIndex = text.indexOf(needle);
    if (textIndex < 0) throw new Error(`needle not found: ${needle}`);
    const targetOffset = textIndex + needle.length;
    let remaining = targetOffset;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let targetNode = null;
    let nodeOffset = 0;
    while (walker.nextNode()) {
      const current = walker.currentNode;
      const length = current.textContent?.length || 0;
      if (remaining <= length) {
        targetNode = current;
        nodeOffset = remaining;
        break;
      }
      remaining -= length;
    }
    if (!targetNode) throw new Error('text node for cursor not found');
    const range = document.createRange();
    range.setStart(targetNode, nodeOffset);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    el.focus();
  }, needle);
}

async function createInlineAtCursorFromMobileSheet(page, blipId, needle, label) {
  const blip = await expandBlip(page, blipId);
  const edit = blip.locator('[data-testid="blip-menu-edit"]').first();
  if (await edit.count()) {
    await edit.click();
  }
  await blip.locator('[data-testid="blip-menu-edit-surface"]').waitFor({ timeout: 10000 });
  await setCursorAfterNeedle(page, blip, needle);
  const before = await capture(page, `${label}-cursor-before-inline-insert`);

  await blip.locator('[data-testid="blip-menu-mobile-trigger"]').first().click();
  const insert = page.locator('[data-testid="menu-item-insert-inline-comment"]').first();
  await insert.waitFor({ state: 'visible', timeout: 10000 });
  const sheet = await capture(page, `${label}-mobile-sheet-inline-action`);
  await insert.click();

  await blip.locator('.blip-thread-marker').first().waitFor({ state: 'visible', timeout: 15000 });
  const after = await capture(page, `${label}-cursor-inline-marker-created`);
  const markerText = await blip.locator('.blip-thread-marker').first().innerText();
  spawnSync('adb', ['shell', 'input', 'keyevent', '4']);
  await page.waitForTimeout(300);
  await blip.locator('[data-testid="blip-menu-done"]').first().click({ force: true }).catch(() => {});
  await blip.locator('[data-testid="blip-menu-read-surface"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  return { label, before, sheet, after, markerText };
}

const browser = await chromium.connectOverCDP(cdpUrl);
const context = browser.contexts()[0] || await browser.newContext();
const page = context.pages()[0] || await context.newPage();

try {
  const version = await (await fetch(`${cdpUrl}/json/version`)).json().catch(() => ({}));
  await ensureAuth(page);
  const fixture = await createFixture(page);
  await openTopic(page, fixture.waveId);
  const parent = await createInlineAtCursorFromMobileSheet(page, fixture.mainBlipId, 'insertion point', 'parent-blip');
  await openTopic(page, fixture.waveId);
  await expandBlip(page, fixture.mainBlipId);
  const child = await createInlineAtCursorFromMobileSheet(page, fixture.childBlipId, 'insertion point', 'nested-subblip');
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    cdpUrl,
    browser: version.Browser,
    androidPackage: version['Android-Package'],
    waveId: fixture.waveId,
    results: [parent, child],
  }, null, 2));
} finally {
  await browser.close();
}
