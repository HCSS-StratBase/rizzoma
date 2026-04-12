const { chromium } = require("playwright");
const fs = require("fs");

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForTimeout(1500);
}

async function main() {
  const shotPath = process.argv[2];
  const htmlPath = process.argv[3];
  const base = process.argv[4] || "http://127.0.0.1:4180";

  if (!shotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_live_store_panel.cjs <shotPath> <htmlPath> [baseUrl]");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";

  await login(page, base, email, password);
  await page.goto(`${base}/#/topics?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".nav-tab", { timeout: 30000 });
  await page.locator(".nav-tab", { hasText: "Store" }).click();
  await page.waitForSelector(".store-panel", { timeout: 15000 });
  await page.waitForTimeout(1200);

  await page.locator(".tabs-container").screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
