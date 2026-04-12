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

async function createTopic(page, title) {
  const result = await page.evaluate(async (topicTitle) => {
    const readCookie = (name) => {
      const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
      if (!match) return undefined;
      return match[1] ? decodeURIComponent(match[1]) : undefined;
    };

    await fetch('/api/auth/csrf', { credentials: 'include' });
    const token = readCookie('XSRF-TOKEN');
    const response = await fetch('/api/topics', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: JSON.stringify({ title: topicTitle, content: '<p></p>' }),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  }, title);

  if (!result?.ok || !result?.data?.id) {
    throw new Error(`Failed to create topic (${result?.status ?? 'unknown'}): ${JSON.stringify(result?.data ?? null)}`);
  }
  return result.data.id;
}

async function main() {
  const shotPath = process.argv[2];
  const htmlPath = process.argv[3];
  const base = process.argv[4] || "http://127.0.0.1:4182";
  const gadgetLabel = process.argv[5] || 'Kanban';

  if (!shotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_live_topic_app.cjs <shotPath> <htmlPath> [baseUrl] [gadgetLabel]");
  }

  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const isHarness = base.endsWith('.html');
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";
  const targetMap = {
    Kanban: {
      appId: 'kanban-board',
      actionName: 'Add sample card',
      expectedText: 'Sample card 3',
      summarySnippet: 'cards',
    },
    Planner: {
      appId: 'calendar-planner',
      actionName: 'Delay final milestone',
      expectedText: 'Ship preview (delayed)',
      summarySnippet: 'Ship preview (delayed)',
    },
    Focus: {
      appId: 'focus-timer',
      actionName: 'Start next focus block',
      expectedText: 'deep work',
      summarySnippet: 'deep work',
    },
  };
  const target = targetMap[gadgetLabel];
  if (!target) {
    throw new Error(`Unknown gadget label: ${gadgetLabel}`);
  }

  let frame;
  let frameSelector;
  if (isHarness) {
    console.log(`[capture] harness base=${base} app=${target.appId}`);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    frameSelector = `iframe[data-app-id="${target.appId}"]`;
    await page.waitForSelector(frameSelector, { timeout: 30000 });
    const appFrame = await page.locator(frameSelector).elementHandle();
    frame = await appFrame?.contentFrame();
    if (!frame) {
      throw new Error(`${gadgetLabel} harness iframe did not expose a content frame`);
    }
  } else {
    console.log(`[capture] topic flow base=${base} gadget=${gadgetLabel}`);
    await login(page, base, email, password);
    console.log('[capture] logged in');
    const topicId = await createTopic(page, `App gadget smoke ${Date.now()}`);
    console.log(`[capture] topic=${topicId}`);
    await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
    await page.waitForTimeout(1200);
    console.log('[capture] topic ready');

    await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
    await page.waitForTimeout(600);
    await page.locator(".topic-content-edit .ProseMirror").first().click();
    await page.waitForTimeout(250);
    console.log('[capture] editor ready');
    await page.locator(".right-tools-panel .insert-btn.gadget-btn").first().click();
    await page.waitForSelector(".gadget-palette", { timeout: 8000 });
    await page.locator(".gadget-tile", { hasText: gadgetLabel }).first().click();
    console.log('[capture] gadget selected');
    frameSelector = `.topic-content-edit .gadget-node-view iframe[src*="${target.appId}"]`;
    const iframeLocator = page.locator(frameSelector).first();
    await iframeLocator.waitFor({ timeout: 20000 });
    const appFrame = await iframeLocator.elementHandle();
    frame = await appFrame?.contentFrame();
    if (!frame) {
      throw new Error(`${gadgetLabel} app iframe did not expose a content frame`);
    }
  }
  await page.frameLocator(frameSelector).locator('.app-shell').first().waitFor({ timeout: 20000 });
  console.log('[capture] iframe shell ready');
  await page.frameLocator(frameSelector).getByRole('button', { name: target.actionName, exact: true }).click();
  await page.frameLocator(frameSelector).locator(`text=${target.expectedText}`).first().waitFor({ timeout: 12000 });
  console.log('[capture] app action verified');
  if (!isHarness) {
    await page.waitForTimeout(1200);
    await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Done" }).first().click();
    await page.waitForTimeout(1800);
    console.log('[capture] topic done clicked');
    const debugHtmlPath = path.join(
      path.dirname(htmlPath),
      `${path.basename(htmlPath, path.extname(htmlPath))}-after-done-debug.html`
    );
    fs.writeFileSync(debugHtmlPath, await page.content());
    const savedSelector = `figure[data-gadget-type="app-frame"][data-app-id="${target.appId}"] iframe[src*="${target.appId}"]`;
    const savedFrameHandle = await page.locator(savedSelector).first().elementHandle();
    const savedFrame = await savedFrameHandle?.contentFrame();
    if (!savedFrame) {
      throw new Error(`${gadgetLabel} app iframe was not available after leaving edit mode`);
    }
    await page.locator(`[data-app-summary*="${target.summarySnippet}"]`).first().waitFor({ timeout: 12000 });
    await page.frameLocator(savedSelector).locator(`text=${target.expectedText}`).first().waitFor({ timeout: 12000 });
    console.log('[capture] post-save verification complete');
  }

  const screenshotTarget = isHarness ? page.locator('.page') : page.locator(".wave-container");
  await screenshotTarget.screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
