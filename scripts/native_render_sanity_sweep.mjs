#!/usr/bin/env node
/**
 * Native render sanity sweep.
 *
 * Drives a Playwright browser to a topic with `?render=native`, verifies
 * the new ContentArray + renderer + BlipThread chain renders correctly,
 * and that fold/unfold preserves the subtree (CSS-class only — never
 * destroys DOM, matching the original Rizzoma invariant).
 *
 * Run via:
 *   node scripts/native_render_sanity_sweep.mjs
 *
 * Requires the dev VPS at https://dev.138-201-62-161.nip.io to be up
 * with FEAT_RIZZOMA_NATIVE_RENDER=1.
 *
 * Checks:
 *   1. `.rizzoma-native-mode` div mounts (means the early-return path fired)
 *   2. `.wave-view` from NativeWaveView is in the DOM
 *   3. Root blip-container has a data-blip-id attribute
 *   4. At least one `.blip-thread` span is present (means renderer found BLIP elements)
 *   5. Every BlipThread has `.folded` class by default
 *   6. Clicking a fold-button removes `.folded` (unfolds) — subtree still in DOM
 *   7. Clicking again restores `.folded` (folds) — subtree STILL in DOM
 *
 * Reports pass/fail per check; exits non-zero on any fail.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE || 'https://dev.138-201-62-161.nip.io';
const topicId = process.env.TOPIC_ID || '1a94345b983b3a1c78f2a2da1a02a5aa';
const ownerEmail = process.env.OWNER_EMAIL || 'try-owner+try-1777937672763@example.com';
const ownerPassword = process.env.OWNER_PASS || 'Try!Owner-try-1777937672763';
const sessionStatePath = process.env.SESSION_STATE
  || path.join('/mnt/c/Rizzoma/scripts', 'rizzoma-session-state.json');
const outDir = path.join(
  '/mnt/c/Rizzoma/screenshots',
  `native-render-sanity-${new Date().toISOString().slice(0, 10)}`
);

const log = (m) => console.log(`[native-sanity] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? '  — ' + detail : ''}`);
};

const shot = async (page, name) => {
  await fs.mkdir(outDir, { recursive: true });
  const p = path.join(outDir, name);
  await page.screenshot({ path: p, fullPage: true });
};

async function ensureAuth(page, context) {
  // Try existing session-state cookies.
  try {
    const stat = await fs.stat(sessionStatePath);
    if (stat.isFile()) {
      const state = JSON.parse(await fs.readFile(sessionStatePath, 'utf8'));
      await context.addCookies(state.cookies || []);
      log('loaded session state');
      return;
    }
  } catch {}
  log(`no session state at ${sessionStatePath} — falling back to AuthPanel sign-in`);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
  // AuthPanel email/password fields (best-effort selectors)
  await page.fill('input[type="email"]', ownerEmail).catch(() => {});
  await page.fill('input[type="password"]', ownerPassword).catch(() => {});
  await page.locator('button:has-text("Sign in")').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(2000);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();
  await ensureAuth(page, context);

  // Navigate with ?render=native flag
  const url = `${baseUrl}/?layout=rizzoma&render=native#/topic/${topicId}`;
  log(`navigating to ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 }).catch(() => {});
  await sleep(2500);
  await shot(page, '01-loaded.png');

  // Check 1: native-mode wrapper div mounted
  const nativeMounted = await page.evaluate(() =>
    document.querySelector('.rizzoma-native-mode') !== null
  );
  record('1. .rizzoma-native-mode div mounts (early-return native path fired)', nativeMounted);

  // Check 2: WaveView root container present
  const waveView = await page.evaluate(() =>
    document.querySelector('.wave-view') !== null
  );
  record('2. .wave-view container from NativeWaveView is in the DOM', waveView);

  // Check 3: root blip-container has data-blip-id
  const rootBlipId = await page.evaluate(() => {
    const c = document.querySelector('.wave-view > .blip-container');
    return c ? c.getAttribute('data-blip-id') : null;
  });
  record('3. Root blip-container has data-blip-id', !!rootBlipId, `id=${rootBlipId || 'null'}`);

  // Check 4: at least one BlipThread span (renderer found a BLIP)
  const threadCount = await page.evaluate(() =>
    document.querySelectorAll('.wave-view .blip-thread').length
  );
  record('4. At least one .blip-thread span exists', threadCount > 0,
    `count=${threadCount}`);

  if (threadCount === 0) {
    log('no BlipThreads to test fold semantics; skipping checks 5–7');
  } else {
    // Check 5: all folded by default
    const allFolded = await page.evaluate(() => {
      const ts = document.querySelectorAll('.wave-view .blip-thread');
      return Array.from(ts).every((t) => t.classList.contains('folded'));
    });
    record('5. All BlipThreads start folded by default', allFolded);

    // Check 6: click fold-button → unfolds; subtree still in DOM
    const beforeChildCount = await page.evaluate(() => {
      const t = document.querySelector('.wave-view .blip-thread');
      return t?.querySelector('.js-blips-container')?.children.length || 0;
    });
    await page.locator('.wave-view .blip-thread .js-fold-button').first()
      .click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(500);
    const afterUnfold = await page.evaluate(() => {
      const t = document.querySelector('.wave-view .blip-thread');
      return {
        folded: t?.classList.contains('folded'),
        childCount: t?.querySelector('.js-blips-container')?.children.length || 0,
      };
    });
    record('6. Click fold-button → unfolded + subtree still in DOM',
      !afterUnfold.folded && afterUnfold.childCount === beforeChildCount,
      `folded=${afterUnfold.folded} childCount=${afterUnfold.childCount} (was ${beforeChildCount})`);
    await shot(page, '02-unfolded.png');

    // Check 7: click again → re-folds; subtree STILL in DOM
    await page.locator('.wave-view .blip-thread .js-fold-button').first()
      .click({ force: true, timeout: 5000 }).catch(() => {});
    await sleep(500);
    const afterRefold = await page.evaluate(() => {
      const t = document.querySelector('.wave-view .blip-thread');
      return {
        folded: t?.classList.contains('folded'),
        childCount: t?.querySelector('.js-blips-container')?.children.length || 0,
      };
    });
    record('7. Click fold-button again → re-folded + subtree still in DOM',
      afterRefold.folded && afterRefold.childCount === beforeChildCount,
      `folded=${afterRefold.folded} childCount=${afterRefold.childCount}`);
    await shot(page, '03-refolded.png');
  }

  await browser.close();

  // Report
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n[native-sanity] ${passed}/${results.length} checks passed`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[native-sanity] FATAL', err);
  process.exit(2);
});
