#!/usr/bin/env node
/**
 * Exhaustive visual sweep of the "Try" topic on our Rizzoma. Captures:
 *   - 00 collapsed ToC (3 labels with [+] on First only)
 *   - 01-10 spine expanded incrementally to depth N (one screenshot per depth)
 *   - 11 fully expanded (depth-10) view-mode
 *   - 12-13 edit mode of root + first inline child
 *   - 14 marker hover state
 *   - 15 collapse spine back to ToC (verify state-preservation visually)
 *   - 16 re-expand spine (all open again from preserved subtree)
 *
 * Usage:
 *   RIZZOMA_TRY_TOPIC_ID=<id> RIZZOMA_TRY_OWNER=<email> RIZZOMA_TRY_PASSWORD=<pwd> \
 *     node scripts/sweep_try_topic.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'https://dev.138-201-62-161.nip.io';
const topicId = process.env.RIZZOMA_TRY_TOPIC_ID;
const ownerEmail = process.env.RIZZOMA_TRY_OWNER;
const ownerPassword = process.env.RIZZOMA_TRY_PASSWORD;
const stamp = process.env.RIZZOMA_TRY_SWEEP_STAMP || `260505-try-sweep-${Date.now()}`;
const outDir = path.join('screenshots', `${stamp}`);

if (!topicId || !ownerEmail || !ownerPassword) {
  console.error('Missing one of RIZZOMA_TRY_TOPIC_ID / RIZZOMA_TRY_OWNER / RIZZOMA_TRY_PASSWORD');
  process.exit(1);
}

const log = (msg) => console.log(`[try-sweep] ${msg}`);

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

async function ensureAuth(page, email, password) {
  await gotoApp(page);
  const r = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    const login = await fetch('/api/auth/login', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    return { ok: login.ok, status: login.status, text: login.ok ? '' : await login.text() };
  }, { email, password });
  if (!r.ok) throw new Error(`auth failed: ${r.status} ${r.text}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 20000 });
  log(`auth ok: ${email}`);
}

async function openTopic(page) {
  // Force a full re-mount: navigate to a blank page first so React tree unmounts,
  // then go to the topic. Same-hash re-navigation does NOT trigger React re-mount
  // (the layout is preserved), so previous expand state from a prior iteration
  // would leak across.
  await page.goto(`${baseUrl}/?reset=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(150);
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(topicId)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  // Wait until the topic root's body shows at least one [+] marker — the
  // markers are injected during the post-render useLayoutEffect pass, so
  // they appear ~1 frame after .rizzoma-topic-detail mounts.
  await page.waitForFunction(() => {
    return document.querySelectorAll('.blip-text .blip-thread-marker[data-blip-thread]').length > 0;
  }, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
}

async function shot(page, file, opts = {}) {
  const fp = path.join(outDir, file);
  await page.screenshot({ path: fp, fullPage: !!opts.fullPage });
  log(`captured ${fp}`);
}

async function clickFirstMarker(page, label) {
  // Find the [+] marker on a bullet whose text starts with the given label.
  // Use a real Playwright .click() (synthetic event with PointerEvent dispatch),
  // not JS .click(), because the React click handler is attached via React's
  // synthetic event system at the .blip-text root.
  const found = await page.evaluate((label) => {
    const lis = Array.from(document.querySelectorAll('.blip-text li'));
    for (const li of lis) {
      const text = (li.textContent || '').trim();
      if (text.startsWith(label)) {
        const marker = li.querySelector('.blip-thread-marker[data-blip-thread]');
        if (marker && !marker.classList.contains('expanded')) {
          marker.setAttribute('data-mcp-click', '1');
          return marker.getAttribute('data-blip-thread');
        }
      }
    }
    return null;
  }, label);
  if (!found) {
    log(`  marker for "${label}" not found or already expanded`);
    return false;
  }
  await page.locator('.blip-thread-marker[data-mcp-click="1"]').first().click({ force: true, timeout: 5000 });
  // Clear the data-mcp-click marker so next iteration finds a fresh one
  await page.evaluate(() => {
    document.querySelectorAll('[data-mcp-click="1"]').forEach(el => el.removeAttribute('data-mcp-click'));
  });
  // Wait for the inline child to mount (a new blip-container appears under the LI)
  await page.waitForFunction((threadId) => {
    return !!document.querySelector(`[data-inline-child="${threadId}"], [data-portal-child="${threadId}"]`);
  }, found, { timeout: 7000 }).catch(() => {});
  await page.waitForTimeout(350);
  return true;
}

async function expandSpineToDepth(page, depth) {
  // Click the [+] for First label first
  await clickFirstMarker(page, 'First label by Claude');
  // Then drill down through spine A labels
  for (let d = 1; d <= depth - 1; d += 1) {
    let label;
    if (d === 1) label = 'Subblip 1.A';
    else if (d === 2) label = 'Depth-2 child A';
    else label = `Depth-${d} leaf A`;
    await clickFirstMarker(page, label);
  }
}

async function collapseAll(page) {
  // Click any marker that is currently expanded ([-])
  const before = await page.locator('.blip-thread-marker.expanded').count();
  for (let i = 0; i < before; i += 1) {
    const m = page.locator('.blip-thread-marker.expanded').first();
    if (await m.count() === 0) break;
    await m.click().catch(() => {});
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();

  await ensureAuth(page, ownerEmail, ownerPassword);
  await openTopic(page);

  // 00 — collapsed ToC
  await shot(page, '00-collapsed-toc.png');

  // 01-10: incrementally expand spine
  for (let d = 1; d <= 10; d += 1) {
    await openTopic(page); // fresh state per shot
    await expandSpineToDepth(page, d);
    await shot(page, `${String(d).padStart(2, '0')}-spine-depth-${String(d).padStart(2, '0')}-expanded.png`);
  }

  // 11 — full depth 10 expanded, full-page screenshot
  await openTopic(page);
  await expandSpineToDepth(page, 10);
  await shot(page, '11-spine-depth-10-fullpage.png', { fullPage: true });

  // 12 — root edit mode
  await openTopic(page);
  await page.evaluate(() => {
    const editBtn = document.querySelector('button[title="Edit"], .blip-edit-btn');
    if (editBtn) editBtn.click();
  });
  await page.waitForTimeout(800);
  await shot(page, '12-root-edit-mode.png');

  // 13 — view mode after expanding First then clicking Edit on the inline child (depth 1)
  await openTopic(page);
  await clickFirstMarker(page, 'First label by Claude');
  await page.waitForTimeout(400);
  await shot(page, '13-first-label-expanded-with-toolbar.png');

  // 14 — hover state on a [+] marker
  await openTopic(page);
  const firstMarker = await page.locator('.blip-thread-marker[data-blip-thread]').first();
  if (await firstMarker.count()) {
    await firstMarker.hover();
    await page.waitForTimeout(200);
  }
  await shot(page, '14-marker-hover-state.png');

  // 15 — expand-then-collapse: prove preserve-on-fold by collapsing a previously-expanded spine
  await openTopic(page);
  await expandSpineToDepth(page, 5);
  await shot(page, '15a-spine-expanded-depth-5.png');
  await collapseAll(page);
  await shot(page, '15b-spine-collapsed-after-depth-5-expand.png');

  // 16 — re-expand: should visually return to expanded state, with inner React state preserved
  await clickFirstMarker(page, 'First label by Claude');
  await page.waitForTimeout(300);
  await shot(page, '16-spine-re-expanded-after-collapse.png');

  // 17 — visit Second / Third labels (no [+], pure leaves)
  await openTopic(page);
  await shot(page, '17-second-and-third-labels-bare.png');

  await browser.close();
  log(`DONE — ${outDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
