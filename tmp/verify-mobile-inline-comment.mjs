import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const outDir = process.env.RIZZOMA_OUT_DIR || path.resolve('screenshots', '260424-mobile-inline-comment-verify');
const password = process.env.RIZZOMA_E2E_PASSWORD || 'MobileComment!1';
const email = process.env.RIZZOMA_E2E_USER || `mobile-inline-comment+${Date.now()}@example.com`;
const headless = process.env.RIZZOMA_E2E_HEADED !== '1';
const device = devices['Pixel 5'];

async function capture(page, name) {
  await fs.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
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
    title: `Mobile inline comment verification ${stamp}`,
    content: `<p>Topic root for mobile inline comment verification ${stamp}.</p>`,
  });
  const waveId = topic.id;
  const main = await api(page, 'POST', '/api/blips', {
    waveId,
    parentId: null,
    content: '<p>Mobile inline comment target text in the parent blip.</p>',
  });
  const mainBlipId = main.id || main.blip?._id || main.blip?.id;
  const child = await api(page, 'POST', '/api/blips', {
    waveId,
    parentId: mainBlipId,
    content: '<p>Nested subblip selectable text for phone inline comments.</p>',
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
    await blip.locator('> .blip-collapsed-row').click();
  }
  await blip.locator('[data-testid="blip-view-content"]').first().waitFor({ timeout: 15000 });
  return blip;
}

async function selectNeedle(page, blipId, needle) {
  const blip = await expandBlip(page, blipId);
  const content = blip.locator('[data-testid="blip-view-content"]').first();
  await content.scrollIntoViewIfNeeded();
  await content.evaluate((el, needle) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let textNode = null;
    while (walker.nextNode()) {
      const current = walker.currentNode;
      if (current.textContent?.includes(needle)) {
        textNode = current;
        break;
      }
    }
    if (!textNode) throw new Error(`needle not found: ${needle}`);
    const start = textNode.textContent.indexOf(needle);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + needle.length);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, needle);
}

async function verifyCommentButton(page, blipId, needle, label) {
  await selectNeedle(page, blipId, needle);
  const button = page.locator('.inline-comment-btn').first();
  await button.waitFor({ state: 'visible', timeout: 5000 });
  const text = (await button.innerText()).trim();
  const screenshot = await capture(page, `${label}-button-visible`);
  await button.click();
  await page.locator('.inline-comment-floating-form').waitFor({ state: 'visible', timeout: 5000 });
  const formScreenshot = await capture(page, `${label}-form-visible`);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.inline-comment-floating-form').waitFor({ state: 'hidden', timeout: 10000 });
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  return { label, buttonText: text, screenshot, formScreenshot };
}

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  ...device,
  locale: 'en-US',
});
const page = await context.newPage();

try {
  await ensureAuth(page);
  const fixture = await createFixture(page);
  await openTopic(page, fixture.waveId);
  const parent = await verifyCommentButton(page, fixture.mainBlipId, 'target text', 'parent-blip');
  await openTopic(page, fixture.waveId);
  await expandBlip(page, fixture.mainBlipId);
  const child = await verifyCommentButton(page, fixture.childBlipId, 'selectable text', 'nested-subblip');
  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    device: 'Pixel 5',
    waveId: fixture.waveId,
    results: [parent, child],
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
