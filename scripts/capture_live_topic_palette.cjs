const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForTimeout(1500);
}

async function openTopic(page, base, topicRef) {
  if (topicRef.startsWith('title:')) {
    const topicTitle = topicRef.slice('title:'.length);
    await page.goto(`${base}/#/topics?layout=rizzoma`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".topics-container .search-result-item", { timeout: 30000 });
    await page.getByText(topicTitle, { exact: true }).first().click();
  } else {
    await page.goto(`${base}/#/topic/${topicRef}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForSelector(".topic-blip-toolbar .topic-tb-btn", { timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function openPalette(page) {
  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
  await page.waitForTimeout(600);
  await page.locator(".topic-content-edit .ProseMirror").first().click();
  await page.waitForTimeout(250);
  await page.locator(".right-tools-panel .insert-btn.gadget-btn").first().click();
  await page.waitForSelector(".gadget-palette", { timeout: 10000 });
  await page.waitForTimeout(500);
}

async function main() {
  const topicRef = process.argv[2];
  const shotPath = process.argv[3];
  const htmlPath = process.argv[4];
  const base = process.argv[5] || "http://127.0.0.1:4196";

  if (!topicRef || !shotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_live_topic_palette.cjs <topicId|title:Topic Name> <shotPath> <htmlPath> [baseUrl]");
  }

  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";

  await login(page, base, email, password);
  await openTopic(page, base, topicRef);
  await openPalette(page);

  await page.locator(".gadget-palette").screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
