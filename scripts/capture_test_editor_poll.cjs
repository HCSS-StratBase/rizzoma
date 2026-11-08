const { chromium } = require("playwright");
const fs = require("fs");

async function main() {
  const shotPath = process.argv[2];
  const htmlPath = process.argv[3];
  const targetUrl = process.argv[4] || "http://127.0.0.1:3000/test-editor.html";

  if (!shotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_test_editor_poll.cjs <shotPath> <htmlPath> [targetUrl]");
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button:has-text("Insert Poll Into Blip")', { timeout: 15000 });
  await page.click('button:has-text("Insert Poll Into Blip")');
  await page.waitForSelector('.gadget-node-view', { timeout: 15000 });
  await page.waitForTimeout(800);

  await page.screenshot({ path: shotPath, fullPage: true });
  fs.writeFileSync(htmlPath, await page.content());

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
