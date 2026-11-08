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

async function openTopic(page, base, topicId) {
  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForSelector(".topic-blip-toolbar .topic-tb-btn", { timeout: 30000 });
}

async function activatePrimaryBlip(page) {
  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
  await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });
  await page.locator(".topic-content-edit .ProseMirror").first().click();
  await page.waitForSelector(".right-tools-panel .insert-shortcuts", { timeout: 10000 });
  await page.waitForSelector('[data-testid="right-tools-insert-gadget"]', { timeout: 10000 });
}

async function main() {
  const topicId = process.argv[2];
  const entryShotPath = process.argv[3];
  const paletteShotPath = process.argv[4];
  const htmlPath = process.argv[5];
  const base = process.argv[6] || "http://127.0.0.1:4198";

  if (!topicId || !entryShotPath || !paletteShotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_live_topic_gadget_entry.cjs <topicId> <entryShotPath> <paletteShotPath> <htmlPath> [baseUrl]");
  }

  fs.mkdirSync(path.dirname(entryShotPath), { recursive: true });
  fs.mkdirSync(path.dirname(paletteShotPath), { recursive: true });
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";

  await login(page, base, email, password);
  await openTopic(page, base, topicId);
  await activatePrimaryBlip(page);

  await page.locator(".right-tools-panel").screenshot({ path: entryShotPath });

  await page.locator('[data-testid="right-tools-insert-gadget"]').click();
  await page.waitForSelector(".gadget-palette", { timeout: 10000 });
  await page.locator(".right-tools-panel").screenshot({ path: paletteShotPath });
  fs.writeFileSync(htmlPath, await page.content());

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
