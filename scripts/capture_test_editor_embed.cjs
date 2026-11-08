const { chromium } = require("playwright");
const fs = require("fs");

async function main() {
  const gadgetLabel = process.argv[2];
  const urlValue = process.argv[3];
  const shotPath = process.argv[4];
  const htmlPath = process.argv[5];
  const base = process.argv[6] || "http://127.0.0.1:4179/test-editor.html";

  if (!gadgetLabel || !urlValue || !shotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_test_editor_embed.cjs <gadgetLabel> <url> <shotPath> <htmlPath> [baseUrl]");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Open Gadget Palette", exact: true }).click();
  await page.waitForSelector(".gadget-palette", { timeout: 8000 });
  await page.locator(".gadget-tile", { hasText: gadgetLabel }).first().click();
  await page.locator(".gadget-url-field").fill(urlValue);
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.locator("body").screenshot({ path: shotPath, fullPage: true });
  fs.writeFileSync(htmlPath, await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
