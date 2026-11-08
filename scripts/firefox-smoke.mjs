#!/usr/bin/env node
/**
 * Firefox cross-browser smoke test — top 10 features.
 * Proves Rizzoma works beyond Chromium.
 */
import { firefox } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outDir = path.resolve('screenshots/260416-firefox-smoke');
const password = 'FirefoxSmoke!1';
const email = `firefox-${Date.now()}@example.com`;

const ok = m => console.log(`✅ ${m}`);
const err = m => console.error(`❌ ${m}`);
let passed = 0, failed = 0;

async function shot(page, name) {
  await fs.mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
}

async function run(name, fn) {
  try { await fn(); passed++; ok(name); }
  catch (e) { failed++; err(`${name}: ${String(e).slice(0, 150)}`); }
}

async function main() {
  const browser = await firefox.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Auth
  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const cc = document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='));
    const csrf = cc ? decodeURIComponent(cc.split('=')[1] || '') : '';
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    await fetch('/api/auth/register', { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify({ email, password }) });
  }, { email, password });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 15000 });
  ok('Firefox auth');

  // Create a topic
  const topicId = await page.evaluate(async () => {
    const csrf = (document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN=')) || '').split('=')[1] || '';
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': decodeURIComponent(csrf) };
    const t = await fetch('/api/topics', { method: 'POST', headers: h, credentials: 'include',
      body: JSON.stringify({ title: 'Firefox Smoke Test', content: '<h1>Firefox Smoke</h1><p>Cross-browser verification paragraph for formatting.</p>' }) });
    const topic = await t.json();
    await fetch('/api/blips', { method: 'POST', headers: h, credentials: 'include',
      body: JSON.stringify({ waveId: topic.id, parentId: null, content: '<p>Reply blip for Firefox testing.</p>' }) });
    return topic.id;
  });
  ok(`topic: ${topicId}`);

  await page.goto('about:blank');
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // 1. Three-panel layout renders
  await run('1-layout', async () => {
    await page.locator('.rizzoma-layout').waitFor({ timeout: 5000 });
    await shot(page, '01-layout');
  });

  // 2. Editor toolbar visible
  await run('2-editor-toolbar', async () => {
    const btns = await page.evaluate(() => document.querySelectorAll('button').length);
    if (btns < 10) throw new Error(`only ${btns} buttons`);
    await shot(page, '02-toolbar');
  });

  // 3. Bold mark
  await run('3-bold', async () => {
    await page.evaluate(() => {
      const ed = document.querySelector('.ProseMirror');
      ed.focus();
      const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      const n = w.nextNode();
      if (n) {
        const r = document.createRange();
        r.setStart(n, 0); r.setEnd(n, 5);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(r);
      }
    });
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(200);
    await shot(page, '03-bold');
  });

  // 4. Mention dropdown
  await run('4-mention', async () => {
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(' @');
    await page.waitForTimeout(500);
    await shot(page, '04-mention');
  });

  // 5. Gadget palette
  await run('5-gadgets', async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').includes('Gadgets'));
      if (b) b.click();
    });
    await page.waitForTimeout(500);
    await shot(page, '05-gadgets');
  });

  // 6. Share modal
  await run('6-share', async () => {
    await page.goto('about:blank');
    await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Share'));
      if (b) b.click();
    });
    await page.waitForTimeout(500);
    await shot(page, '06-share');
  });

  // 7. Nav tabs
  await run('7-nav-tabs', async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.includes('Tasks'));
      if (b) b.click();
    });
    await page.waitForTimeout(400);
    await shot(page, '07-nav-tasks');
  });

  // 8. Mobile viewport
  await run('8-mobile', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await shot(page, '08-mobile');
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  // 9. Search
  await run('9-search', async () => {
    await page.goto('about:blank');
    await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const box = page.locator('input[placeholder*="Search topics"]').first();
    await box.click();
    await box.fill('Firefox');
    await page.waitForTimeout(500);
    await shot(page, '09-search');
  });

  // 10. Health check from Firefox context
  await run('10-health', async () => {
    const health = await page.evaluate(async () => {
      const r = await fetch('/api/health');
      return r.json();
    });
    if (health.status !== 'ok') throw new Error(`health: ${health.status}`);
    await shot(page, '10-health');
  });

  console.log(`\n==== FIREFOX SMOKE: ${passed}/${passed + failed} PASS ====`);
  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { err(String(e)); process.exit(1); });
