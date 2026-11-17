/**
 * Real insert-and-render smoke for the four sandboxed gadget apps
 * (Kanban, Planner, Focus, Notes).
 *
 * Why it exists: on 2026-11-17 an inserted Kanban gadget rendered as an EMPTY
 * WHITE BOX on the live site. The palette opened fine and the iframe element was
 * in the DOM, so the older "gadget palette opens" checks all passed. The frame
 * was blank because the production server's CSP/CORS/CORP blocked the page that
 * runs inside the opaque-origin sandbox. This test therefore goes through the
 * real UI (root edit -> Gadgets palette -> tile), then reads the frame itself:
 * it FAILS when the iframe document is empty, has no rendered app, has zero
 * size, or when the host shows its "did not start" error state.
 *
 * Run it against the build that matters:
 *   dev server:          RIZZOMA_BASE_URL=http://localhost:3000       npm run test:gadgets
 *   production-mode app: RIZZOMA_BASE_URL=https://<host or nginx>     npm run test:gadgets
 * (A development Vite server serves /gadgets without helmet/CORS, so only a
 * production-mode server reproduces the original defect.)
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const email = process.env.RIZZOMA_E2E_USER || `gadgets+${Date.now()}@example.com`;
const password = process.env.RIZZOMA_E2E_PASSWORD || 'GadgetSmoke!1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// label = palette tile text; expect = what the app must show once running.
const APPS = [
  { label: 'Kanban', appId: 'kanban-board', title: 'Kanban Board', selectors: { '.column': 3, '.card': 4 } },
  { label: 'Planner', appId: 'calendar-planner', title: 'Calendar Planner' },
  { label: 'Focus', appId: 'focus-timer', title: 'Focus Timer' },
  { label: 'Notes', appId: 'notes-scratchpad', title: 'Notes Scratchpad' },
];

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

await seedVerifiedE2EAccount(email, password);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const frameProblems = [];
page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' && /Content Security Policy|CORS|ERR_BLOCKED_BY_RESPONSE|gadgets\/apps/.test(text)) {
    frameProblems.push(text.slice(0, 200));
  }
});
page.on('requestfailed', (request) => {
  if (/\/gadgets\/apps\//.test(request.url())) frameProblems.push(`requestfailed ${request.url()} ${request.failure()?.errorText}`);
});
page.on('response', (response) => {
  if (/\/gadgets\/apps\//.test(response.url()) && response.status() >= 400) {
    frameProblems.push(`HTTP ${response.status()} ${response.url()}`);
  }
});

async function postJson(url, body) {
  return page.evaluate(async ({ url, body }) => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    return response.json();
  }, { url, body });
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    return response.status;
  }, { email, password });
  check('login', login === 200, `HTTP ${login}`);

  for (const app of APPS) {
    frameProblems.length = 0;
    const topic = await postJson('/api/topics', {
      title: `GADGET SMOKE ${app.appId} ${Date.now()}`,
      content: '<h1>GADGET SMOKE</h1><ul><li><p>host line</p></li></ul>',
    });
    const topicId = topic.id || topic._id;
    await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10_000 });
    await sleep(1500);
    await page.locator('.topic-content-edit .ProseMirror').first().click();
    await page.keyboard.press('End');
    await page.locator('[data-testid="right-tools-insert-gadget"]').first().click();
    await sleep(500);
    await page.locator('.gadget-tile', { hasText: app.label }).first().click({ timeout: 5000 });

    // The frame must run its script and populate #app within a few seconds.
    const frameLocator = page.locator(`iframe[src="/gadgets/apps/${app.appId}/index.html"]`);
    await frameLocator.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
    check(`${app.appId}: iframe inserted through the palette`, (await frameLocator.count()) === 1);
    const box = await frameLocator.boundingBox().catch(() => null);
    check(`${app.appId}: iframe has non-zero size`, !!box && box.width > 200 && box.height > 200, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no box');

    const frame = page.frames().find((candidate) => candidate.url().includes(`/gadgets/apps/${app.appId}/`));
    let rendered = null;
    for (let attempt = 0; attempt < 20 && frame; attempt += 1) {
      rendered = await frame.evaluate(() => ({
        text: document.body.innerText.trim(),
        appChildren: document.getElementById('app')?.children.length ?? 0,
        scrollHeight: document.documentElement.scrollHeight,
      })).catch(() => null);
      if (rendered && rendered.appChildren > 0 && rendered.text.includes('SANDBOX PREVIEW')) break;
      await sleep(500);
    }
    check(`${app.appId}: frame document is not blank`, !!rendered && rendered.text.length > 40, rendered ? `${rendered.text.length} chars` : 'no frame');
    check(`${app.appId}: app mounted into #app`, !!rendered && rendered.appChildren > 0);
    check(`${app.appId}: app shows its own title`, !!rendered && rendered.text.includes(app.title), rendered ? rendered.text.slice(0, 60).replace(/\s+/g, ' ') : '');
    check(`${app.appId}: frame content has height`, !!rendered && rendered.scrollHeight > 200, rendered ? `${rendered.scrollHeight}px` : '');
    check(`${app.appId}: host did not show the "did not start" error`, (await page.locator('[data-testid="gadget-app-error"]').count()) === 0);
    check(`${app.appId}: no CSP/CORS/CORP/404 problems for the frame`, frameProblems.length === 0, frameProblems.join(' | '));

    if (frame && app.selectors) {
      for (const [selector, expected] of Object.entries(app.selectors)) {
        const count = await frame.locator(selector).count();
        check(`${app.appId}: ${selector} count is ${expected}`, count === expected, `got ${count}`);
      }
    }
    if (frame && app.appId === 'kanban-board') {
      // A card can be added: this crosses the host bridge (postMessage) and back.
      await frame.getByRole('button', { name: 'Add sample card' }).click({ timeout: 5000 });
      await sleep(1200);
      const cards = await frame.locator('.card').count();
      check('kanban-board: "Add sample card" adds a card (4 -> 5)', cards === 5, `got ${cards}`);
      const hostSummary = await page.locator('[data-app-summary]').first().getAttribute('data-app-summary');
      check('kanban-board: host node data followed the frame (3 columns - 5 cards)', /3 columns.*5 cards/.test(hostSummary || ''), hostSummary || 'none');
    }
    await page.screenshot({ path: `snapshots/gadget-apps-smoke-${app.appId}.png` }).catch(() => {});
  }
} catch (error) {
  check('smoke ran to completion', false, String(error).slice(0, 300));
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nall gadget-app checks passed');
process.exit(failures.length ? 1 : 0);
