const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function login(page, base, email, password) {
  console.log("login:start");
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForTimeout(1500);
  console.log("login:done");
}

async function openSession(base, email, password) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  await login(page, base, email, password);
  return { browser, page };
}

async function openStore(page, base) {
  console.log("store:open");
  await page.goto(`${base}/#/topics?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".nav-tab", { timeout: 30000 });
  await page.locator(".nav-tab", { hasText: "Store" }).click();
  await page.waitForSelector(".store-panel", { timeout: 15000 });
  await page.waitForTimeout(600);
  console.log("store:ready");
}

async function openTopic(page, base, topicRef) {
  console.log(`topic:open:${topicRef}`);
  if (topicRef.startsWith('title:')) {
    const topicTitle = topicRef.slice('title:'.length);
    await page.goto(`${base}/#/topics?layout=rizzoma`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".topics-container .search-result-item", { timeout: 30000 });
    await page.getByText(topicTitle, { exact: true }).first().click();
  } else {
    await page.goto(`${base}/#/topic/${topicRef}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  }
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1200);
  console.log("topic:ready");
}

async function openPalette(page) {
  console.log("palette:open");
  const editButton = page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first();
  await editButton.click();
  await page.waitForTimeout(500);
  await page.locator(".topic-content-edit .ProseMirror").first().click();
  await page.waitForTimeout(250);
  await page.locator(".right-tools-panel .insert-btn.gadget-btn").first().click();
  await page.waitForSelector(".gadget-palette", { timeout: 10000 });
  await page.waitForTimeout(500);
  console.log("palette:ready");
}

async function screenshot(locator, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await locator.screenshot({ path: outPath });
}

async function html(page, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, await page.content());
}

async function setDefaultAppState(page) {
  console.log("store:reset-defaults");
  await page.evaluate(async () => {
    const getCookie = (name) => {
      const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
      return match ? decodeURIComponent(match[1]) : '';
    };
    await fetch('/api/gadgets/preferences', {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': getCookie('XSRF-TOKEN'),
      },
      body: JSON.stringify({
        installedAppIds: ['kanban-board', 'calendar-planner', 'focus-timer'],
      }),
    });
  });
  await page.waitForTimeout(300);
  console.log("store:defaults-ready");
}

async function toggleApp(page, label, action) {
  console.log(`store:toggle:${label}:${action}`);
  await page.locator(".store-search input").fill(label);
  await page.waitForTimeout(250);
  const card = page.locator(".gadget-card", { hasText: label }).first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  const button = card.locator(".install-action").first();
  console.log(`store:toggle-current-label:${await button.textContent()}`);
  const savePromise = page.waitForResponse((response) => {
    return response.url().includes('/api/gadgets/preferences') && response.request().method() === 'PATCH';
  }, { timeout: 15000 });
  await button.click();
  await savePromise;
  await page.waitForTimeout(500);
  console.log(`store:toggle-next-label:${await button.textContent()}`);
  console.log(`store:toggle-done:${label}:${action}`);
}

async function captureStoreCard(page, label, outPng, outHtml) {
  await page.locator(".store-search input").fill(label);
  await page.waitForTimeout(250);
  const card = page.locator(".gadget-card", { hasText: label }).first();
  await card.waitFor({ state: 'visible', timeout: 15000 });
  await screenshot(card, outPng);
  await html(page, outHtml);
}

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:4193";
  const outDir = process.argv[3] || "screenshots/260331-store-lifecycle";
  const topicRef = process.argv[4] || "title:BLB Study - Local Parity Test";

  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";
  let session = await openSession(base, email, password);
  let { browser, page } = session;
  await openStore(page, base);
  await setDefaultAppState(page);
  await openStore(page, base);

  await toggleApp(page, "Focus Timer", "Remove");
  await browser.close();

  session = await openSession(base, email, password);
  ({ browser, page } = session);
  await openStore(page, base);
  await captureStoreCard(page, "Focus Timer", path.join(outDir, "store-focus-removed.png"), path.join(outDir, "store-focus-removed.html"));
  await openTopic(page, base, topicRef);
  await openPalette(page);
  await screenshot(page.locator(".gadget-palette"), path.join(outDir, "palette-focus-removed.png"));
  await html(page, path.join(outDir, "palette-focus-removed.html"));
  await browser.close();

  session = await openSession(base, email, password);
  ({ browser, page } = session);
  await openStore(page, base);
  await toggleApp(page, "Focus Timer", "Install");
  await browser.close();

  session = await openSession(base, email, password);
  ({ browser, page } = session);
  await openStore(page, base);
  await captureStoreCard(page, "Focus Timer", path.join(outDir, "store-focus-installed.png"), path.join(outDir, "store-focus-installed.html"));
  await openTopic(page, base, topicRef);
  await openPalette(page);
  await screenshot(page.locator(".gadget-palette"), path.join(outDir, "palette-focus-installed.png"));
  await html(page, path.join(outDir, "palette-focus-installed.html"));

  console.log("artifacts:written");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
