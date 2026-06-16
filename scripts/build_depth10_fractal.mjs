#!/usr/bin/env node
/**
 * Build a depth-10 fractal in the Try topic via Playwright.
 *
 * Drives the React/TipTap edit path (which has Ctrl+Enter wiring) to
 * create 10 nested child blips, each with its own label. After the
 * fractal is built, screenshots are taken in both render paths so we
 * can compare structure visually:
 *   - REACT/TipTap (default `?layout=rizzoma`)
 *   - NATIVE port (`?render=native`)
 *
 * Saves results to screenshots/depth10-fractal-260506/.
 *
 * Run: node scripts/build_depth10_fractal.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = 'https://dev.138-201-62-161.nip.io';
const topicId = '1a94345b983b3a1c78f2a2da1a02a5aa';
const sessionStatePath = '/mnt/c/Rizzoma/scripts/rizzoma-session-state.json';
const outDir = '/mnt/c/Rizzoma/screenshots/depth10-fractal-260506';

const log = (m) => console.log(`[depth10] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await fs.mkdir(outDir, { recursive: true });
  const p = path.join(outDir, name);
  await page.screenshot({ path: p, fullPage: true });
  log(`shot → ${name}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 1000 },
    storageState: sessionStatePath,
  });
  const page = await context.newPage();

  // ─── React/TipTap path: build the fractal ─────────────────────────
  log('navigating to topic in React/TipTap mode');
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await sleep(2000);
  await shot(page, '01-react-before-build.png');

  // Click Edit on the topic-level toolbar.
  log('clicking topic Edit button');
  await page.locator('button:has-text("Edit")').first().click({ timeout: 5000 });
  await sleep(1500);
  await shot(page, '02-react-edit-mode.png');

  // For depth-10: insert a Ctrl+Enter at end of "First" label, then descend.
  // Each Ctrl+Enter creates a new child blip; we type a label, then Ctrl+Enter
  // again from inside that child to go one more level deep. This produces the
  // straight-line "spine" that matches the rizzoma.com depth-10 reference.
  for (let depth = 1; depth <= 10; depth++) {
    log(`building depth ${depth}/10`);
    // Position cursor at end of last label (best-effort).
    await page.evaluate(() => {
      const editors = Array.from(document.querySelectorAll('.ProseMirror'));
      const editor = editors[editors.length - 1];
      if (!editor) return;
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      editor.focus();
    });
    await sleep(400);
    await page.keyboard.press('Control+Enter');
    await sleep(1500);
    // Type the depth label.
    await page.keyboard.type(`Spine - depth ${depth}`, { delay: 18 });
    await sleep(800);
    await shot(page, `03-react-after-depth-${String(depth).padStart(2, '0')}.png`);
  }

  // Done editing — click Done to save.
  log('clicking Done to save the fractal');
  await page.locator('button:has-text("Done")').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(3500); // autosave
  await shot(page, '04-react-after-done.png');

  // ─── Capture React render of the built fractal ─────────────────────
  log('reloading React-mode view');
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await shot(page, '05-react-final-view.png');

  // ─── Native render path: same data, different render ──────────────
  log('navigating to topic in NATIVE render mode');
  await page.goto(`${baseUrl}/?layout=rizzoma&render=native#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await shot(page, '06-native-folded-default.png');

  // Click each [+] fold-button in turn to expand the spine.
  log('expanding spine via fold-buttons');
  for (let i = 0; i < 11; i++) {
    const clicked = await page.evaluate(() => {
      const ts = Array.from(document.querySelectorAll('.blip-thread.folded'));
      const last = ts[ts.length - 1]; // walk down the spine
      if (!last) return false;
      const btn = last.querySelector('.js-fold-button');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!clicked) break;
    await sleep(500);
    await shot(page, `07-native-spine-depth-${String(i + 1).padStart(2, '0')}.png`);
  }

  // Final fully-expanded native render.
  await shot(page, '08-native-fully-expanded.png');

  await browser.close();
  log('DONE — screenshots in ' + outDir);
}

main().catch((err) => {
  console.error('[depth10] FATAL', err);
  process.exit(1);
});
