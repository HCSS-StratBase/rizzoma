// Shared helpers for the hand-built "Fractal Showcase" topic. Content is entered ONLY with real
// keyboard / mouse / clipboard / file-chooser input through the UI. The server API is used for
// READ-ONLY verification of persisted state and (local stack only) for seeding verified accounts,
// because production registration requires a mailbox-verified invitation.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { seedVerifiedE2EAccount } from '../lib/e2e-sharing-fixtures.mjs';

export const BASE = (process.env.FS_BASE || 'http://127.0.0.1:3105').replace(/\/$/, '');
export const OUT = process.env.FS_OUT || '/mnt/c/Apps/rizzoma/session-2026-11-16/screenshots/fractal-showcase';
export const PASS = process.env.FS_PASS || 'FractalShowcase-2026!';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

export async function seedUser(email) { await seedVerifiedE2EAccount(email, PASS); }

// SDS 18 Nov: everything by hand in a VISIBLE window at human pace (WSLg headed browser, own profile).
export const HEADLESS = process.env.FS_HEADLESS === '1';
export const TYPE_DELAY = Number(process.env.FS_TYPE_DELAY || 80);
export async function launch() {
  return chromium.launch({
    headless: HEADLESS,
    slowMo: HEADLESS ? 0 : Number(process.env.FS_SLOWMO || 120),
    // safety: a headed run must be on a private virtual display, never on the operator's screen
    ...(HEADLESS ? {} : (() => { if (!/^:(9\d)$/.test(process.env.DISPLAY || '') || process.env.WAYLAND_DISPLAY) throw new Error('headed runs only on the private Xvfb display (use run-private.sh)'); return {}; })()),
    args: ['--window-size=1366,800', '--window-position=0,0'],
  });
}

export async function newClient(browser, email, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1366, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
    ...(HEADLESS ? {} : { recordVideo: { dir: path.join(OUT, 'videos'), size: { width: 1366, height: 800 } } }),
    ...(opts.storageState ? { storageState: opts.storageState } : {}),
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|\[vite\]/.test(m.text())) problems.push(`console.error: ${m.text().slice(0, 200)}`); });
  const c = { ctx, page, email, problems, dialogs: [] };
  page.on('dialog', (d) => { c.dialogs.push(d.message()); d.accept().catch(() => {}); });
  return c;
}

/** Sign in through the real sign-in form (typing into the inputs and pressing Enter). */
export async function signInUi(c) {
  const p = c.page;
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  if (!(await p.locator('input.login-input[type="email"]').count())) {
    await p.evaluate(() => window.dispatchEvent(new CustomEvent('rizzoma:request-sign-in')));
    await sleep(800);
  }
  // the dev build pre-fills the form: select the field content first, as a user would
  await p.locator('input.login-input[type="email"]').first().click();
  await p.keyboard.press('Control+A');
  await p.keyboard.type(c.email, { delay: TYPE_DELAY });
  await p.locator('input.login-input[type="password"]').first().click();
  await p.keyboard.press('Control+A');
  await p.keyboard.type(PASS, { delay: TYPE_DELAY });
  await p.keyboard.press('Enter');
  await sleep(3500);
}

/** READ-ONLY API access with the browser's session cookies. */
export async function apiGet(c, url) {
  return c.page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include' });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, json: j };
  }, url);
}

export async function shot(c, name, extra = {}) {
  const f = path.join(OUT, `${name}.png`);
  await c.page.screenshot({ path: f, ...extra });
  return f;
}
