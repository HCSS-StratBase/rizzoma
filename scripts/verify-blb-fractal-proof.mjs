#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RZ_BASE || 'https://dev.138-201-62-161.nip.io';
const outDir = path.resolve(process.env.RZ_OUT_DIR || path.join('screenshots', `260713-${Date.now()}-blb-fractal-proof`));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const email = process.env.RZ_EMAIL || `blb-proof-${stamp}@example.com`;
const password = process.env.RZ_PASS || `Proof-${stamp}!`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shot(page, name) {
  await fs.mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
}

async function browserApi(page, path, options = {}) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, {
      credentials: 'include',
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data };
  }, { path, options });
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const register = await browserApi(page, '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!register.ok) throw new Error(`register failed ${register.status}: ${JSON.stringify(register.data)}`);

  const csrf = await browserApi(page, '/api/auth/csrf');
  const csrfToken = csrf.data?.csrfToken;
  if (!csrfToken) throw new Error('csrf token missing after registration');

  const title = `BLB proof ${stamp}`;
  const topicContent = '<ul><li><p>Main functionality proof</p></li><li><p>Fractal bullets stay bullets</p></li></ul>';
  const topic = await browserApi(page, '/api/topics', {
    method: 'POST',
    headers: { 'x-csrf-token': csrfToken },
    body: JSON.stringify({ title, content: topicContent }),
  });
  if (!topic.ok || !topic.data?.id) throw new Error(`topic create failed ${topic.status}: ${JSON.stringify(topic.data)}`);
  const topicId = topic.data.id;

  const root = await browserApi(page, '/api/blips', {
    method: 'POST',
    body: JSON.stringify({
      waveId: topicId,
      parentId: null,
      content: '<ul><li><p>Root reply label</p></li></ul>',
    }),
  });
  if (!root.ok || !root.data?.id) throw new Error(`root blip create failed ${root.status}: ${JSON.stringify(root.data)}`);
  const rootId = root.data.id;

  const nested = await browserApi(page, '/api/blips', {
    method: 'POST',
    body: JSON.stringify({
      waveId: topicId,
      parentId: rootId,
      content: '<ul><li><p>Nested reply label</p></li></ul>',
    }),
  });
  if (!nested.ok || !nested.data?.id) throw new Error(`nested blip create failed ${nested.status}: ${JSON.stringify(nested.data)}`);
  const nestedId = nested.data.id;

  const terminal = await browserApi(page, '/api/blips', {
    method: 'POST',
    body: JSON.stringify({
      waveId: topicId,
      parentId: nestedId,
      content: '<ul><li><p>Terminal leaf label</p></li></ul>',
    }),
  });
  if (!terminal.ok || !terminal.data?.id) throw new Error(`terminal blip create failed ${terminal.status}: ${JSON.stringify(terminal.data)}`);
  const terminalId = terminal.data.id;

  const url = `${baseUrl}/?layout=rizzoma#/topic/${topicId}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await page.locator(`[data-blip-id="${rootId}"] .blip-collapsed-row`).first().waitFor({ timeout: 30000 });
  await sleep(1000);
  await shot(page, '01-topic-root-and-collapsed-root.png');

  const collapsedRoot = await page.evaluate((rootId) => {
    const row = document.querySelector(`[data-blip-id="${CSS.escape(rootId)}"] .blip-collapsed-row`);
    return {
      text: row?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasBullet: !!row?.querySelector('.blip-bullet'),
      hasPlus: !!row?.querySelector('.blip-expand-icon'),
    };
  }, rootId);
  if (!collapsedRoot.hasBullet || !collapsedRoot.hasPlus || !collapsedRoot.text.includes('Root reply label')) {
    throw new Error(`collapsed root affordance failed: ${JSON.stringify(collapsedRoot)}`);
  }

  await page.locator(`[data-blip-id="${rootId}"] .blip-collapsed-row`).first().click();
  await page.locator(`[data-blip-id="${rootId}"].expanded`).first().waitFor({ timeout: 10000 });
  await page.locator(`[data-blip-id="${nestedId}"] .blip-collapsed-row`).first().waitFor({ timeout: 10000 });
  await sleep(700);
  await shot(page, '02-root-expanded-nested-collapsed.png');

  const nestedCollapsed = await page.evaluate((nestedId) => {
    const row = document.querySelector(`[data-blip-id="${CSS.escape(nestedId)}"] .blip-collapsed-row`);
    return {
      text: row?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasBullet: !!row?.querySelector('.blip-bullet'),
      hasPlus: !!row?.querySelector('.blip-expand-icon'),
    };
  }, nestedId);
  if (!nestedCollapsed.hasBullet || !nestedCollapsed.hasPlus || !nestedCollapsed.text.includes('Nested reply label')) {
    throw new Error(`nested collapsed affordance failed: ${JSON.stringify(nestedCollapsed)}`);
  }

  await page.locator(`[data-blip-id="${nestedId}"] .blip-collapsed-row`).first().click();
  await page.locator(`[data-blip-id="${nestedId}"].expanded`).first().waitFor({ timeout: 10000 });
  await page.locator(`[data-blip-id="${terminalId}"] .blip-collapsed-row`).first().waitFor({ timeout: 10000 });
  await sleep(700);
  await shot(page, '03-nested-expanded-terminal-collapsed.png');

  const terminalCollapsed = await page.evaluate((terminalId) => {
    const row = document.querySelector(`[data-blip-id="${CSS.escape(terminalId)}"] .blip-collapsed-row`);
    return {
      text: row?.textContent?.replace(/\s+/g, ' ').trim() || '',
      hasBullet: !!row?.querySelector('.blip-bullet'),
      hasPlus: !!row?.querySelector('.blip-expand-icon'),
    };
  }, terminalId);
  if (!terminalCollapsed.hasBullet || !terminalCollapsed.hasPlus || !terminalCollapsed.text.includes('Terminal leaf label')) {
    throw new Error(`terminal collapsed affordance failed: ${JSON.stringify(terminalCollapsed)}`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator(`[data-blip-id="${rootId}"] .blip-collapsed-row`).first().waitFor({ timeout: 30000 });
  await sleep(1000);
  await shot(page, '04-reload-persisted-collapsed-blb.png');

  const result = {
    ok: true,
    baseUrl,
    url,
    email,
    topicId,
    rootId,
    nestedId,
    terminalId,
    collapsedRoot,
    nestedCollapsed,
    terminalCollapsed,
    consoleErrors,
    outDir,
  };
  await fs.writeFile(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

main().catch(async (error) => {
  await fs.mkdir(outDir, { recursive: true }).catch(() => undefined);
  await fs.writeFile(path.join(outDir, 'error.txt'), String(error?.stack || error)).catch(() => undefined);
  console.error(error);
  process.exit(1);
});
