const { chromium } = require("playwright");
const fs = require("fs");

async function login(_context, page, base, email, password) {
  console.log("login:start");
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForTimeout(1500);
  console.log("login:done");
}

async function expandVisibleBlips(page) {
  for (let pass = 0; pass < 12; pass += 1) {
    const icons = page.locator(".wave-container .blip-expand-icon");
    const count = await icons.count();
    let clicked = false;

    for (let idx = 0; idx < count; idx += 1) {
      const icon = icons.nth(idx);
      const text = ((await icon.textContent()) || "").trim();
      if (text !== "+") continue;
      await icon.click();
      await page.waitForTimeout(400);
      clicked = true;
      break;
    }

    if (!clicked) break;
  }
}

async function main() {
  const topicRef = process.argv[2];
  const shotPath = process.argv[3];
  const htmlPath = process.argv[4];
  const targetSelector = process.argv[5] || ".wave-container";
  const base = process.argv[6] || "http://127.0.0.1:3000";

  if (!topicRef || !shotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_live_topic.cjs <topicId|title:Topic Name> <shotPath> <htmlPath> [targetSelector] [baseUrl]");
  }

  const browser = await chromium.launch({ headless: true });
  console.log("browser:launched");
  const context = await browser.newContext({ viewport: { width: 1680, height: 1200 } });
  const page = await context.newPage();
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";

  await login(context, page, base, email, password);
  console.log("topic:open");
  if (topicRef.startsWith("title:")) {
    const topicTitle = topicRef.slice("title:".length);
    await page.goto(`${base}/#/topics?layout=rizzoma`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".topics-container .search-result-item", { timeout: 30000 });
    await page.getByText(topicTitle, { exact: true }).first().click();
  } else {
    await page.goto(`${base}/#/topic/${topicRef}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  }
  try {
    await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  } catch (error) {
    console.error("topic:wait-failed");
    console.error(await page.locator("body").innerText().catch(() => ""));
    throw error;
  }
  await page.waitForTimeout(2000);
  console.log("topic:loaded");

  await expandVisibleBlips(page);
  await page.waitForTimeout(800);
  console.log("topic:expanded");

  const target = page.locator(targetSelector);
  await target.screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());
  console.log("artifacts:written");

  const meta = {
    topicRef,
    title: await page.locator(".topic-content-view").first().innerText().catch(() => ""),
    blipCount: await page.locator(".wave-container .rizzoma-blip").count(),
    expandIcons: await page.locator(".wave-container .blip-expand-icon").count(),
    targetSelector,
    shotPath,
    htmlPath,
  };
  console.log(JSON.stringify(meta, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
