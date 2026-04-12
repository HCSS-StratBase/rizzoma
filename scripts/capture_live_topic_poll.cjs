const { chromium } = require("playwright");
const fs = require("fs");
const POLL_SELECTOR = ".node-pollGadget, .poll-gadget-node-view, [data-gadget-type='poll']";

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

async function openTopic(page, base, topicRef) {
  console.log("topic:open");
  if (topicRef.startsWith("title:")) {
    const topicTitle = topicRef.slice("title:".length);
    await page.goto(`${base}/#/topics?layout=rizzoma`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".topics-container .search-result-item", { timeout: 30000 });
    await page.getByText(topicTitle, { exact: true }).first().click();
  } else {
    await page.goto(`${base}/#/topic/${topicRef}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  }

  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1200);
  console.log("topic:loaded");
}

async function insertPollIntoTopic(page) {
  console.log("poll:edit-start");
  const editButton = page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first();
  await editButton.click();
  await page.waitForTimeout(600);

  const editor = page.locator(".topic-content-edit .ProseMirror").first();
  await editor.click();
  await page.waitForTimeout(250);

  const gadgetButton = page.locator(".right-tools-panel .insert-btn.gadget-btn").first();
  await gadgetButton.click();
  await page.waitForSelector(".gadget-palette", { timeout: 8000 });
  console.log("poll:palette-open");
  
  return {
    selectPoll: async () => {
      await page.locator(".gadget-tile", { hasText: "Poll" }).first().click();
      await page.waitForTimeout(1200);
      const pollCountBeforeDone = await page.locator(POLL_SELECTOR).count();
      console.log(`poll:count-before-done=${pollCountBeforeDone}`);
      console.log("poll:inserted");

      const doneButton = page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Done" }).first();
      if (await doneButton.count()) {
        await doneButton.click();
        await page.waitForTimeout(1800);
        const pollCountAfterDone = await page.locator(POLL_SELECTOR).count();
        console.log(`poll:count-after-done=${pollCountAfterDone}`);
        console.log("poll:done");
      }
    },
  };
}

async function main() {
  const topicRef = process.argv[2];
  const shotPath = process.argv[3];
  const htmlPath = process.argv[4];
  const targetSelector = process.argv[5] || ".rizzoma-layout";
  const base = process.argv[6] || "http://127.0.0.1:4175";
  const paletteShotPath = process.argv[7];
  const paletteHtmlPath = process.argv[8];

  if (!topicRef || !shotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_live_topic_poll.cjs <topicId|title:Topic Name> <shotPath> <htmlPath> [targetSelector] [baseUrl] [paletteShotPath] [paletteHtmlPath]");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1200 } });
  const page = await context.newPage();
  page.on("console", (msg) => console.log(`browser:${msg.type()}:${msg.text()}`));
  page.on("pageerror", (error) => console.log(`browser:pageerror:${error.message}`));
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";

  await login(page, base, email, password);
  await openTopic(page, base, topicRef);
  const { selectPoll } = await insertPollIntoTopic(page);

  if (paletteShotPath) {
    await page.locator(".gadget-palette").screenshot({ path: paletteShotPath });
  }
  if (paletteHtmlPath) {
    fs.writeFileSync(paletteHtmlPath, await page.content());
  }

  await selectPoll();

  const target = page.locator(targetSelector);
  await target.screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());
  console.log("artifacts:written");

  const meta = {
    topicRef,
    title: await page.locator(".topic-content-view").first().innerText().catch(() => ""),
    pollCount: await page.locator(POLL_SELECTOR).count(),
    shotPath,
    htmlPath,
  };
  console.log(JSON.stringify(meta, null, 2));

  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
