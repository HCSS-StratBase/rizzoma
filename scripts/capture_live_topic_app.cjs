const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function login(page, base, email, password) {
  // Hard Gap #21 (2026-04-13): replaced waitForTimeout(1500) with a
  // state-driven wait on the rizzoma-layout shell + topics container,
  // matching the same fix applied to capture_blb_live_scenario.cjs in #14.
  // This eliminates 1.5s of fixed padding from every run regardless of
  // whether the topics list had finished hydrating.
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForSelector('.rizzoma-layout', { timeout: 15000 });
  await page.waitForSelector('.rizzoma-topics-list, .topics-container, .navigation-panel', { timeout: 15000 });
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
  // Hard Gap #21 (2026-04-13): default to the canonical Vite port :3000
  // that proxies /api to the reserved Rizzoma backend on :8788. The prior
  // default (:4182) was a stale zombie port from older test runs.
  const base = process.argv[4] || "http://127.0.0.1:3000";
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
    // Hard Gap #21 (2026-04-13): replaced waitForTimeout(1200) with a
    // state-driven wait on the topic toolbar Edit button being mounted
    // and the topic-content-view actually rendered.
    await page.waitForSelector(".topic-blip-toolbar .topic-tb-btn", { timeout: 10000 });
    await page.waitForSelector(".topic-content-view, .topic-content-edit", { timeout: 10000 });
    console.log('[capture] topic ready');

    await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
    // Wait for the ProseMirror editor surface to actually mount before
    // trying to click into it (instead of guessing 600ms).
    await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });
    await page.locator(".topic-content-edit .ProseMirror").first().click();
    // Wait for focus to settle by polling document.activeElement instead
    // of guessing 250ms — the focus event fires synchronously but the
    // selection update is queued.
    await page.waitForFunction(() => {
      const el = document.querySelector('.topic-content-edit .ProseMirror');
      return !!el && el === document.activeElement;
    }, undefined, { timeout: 5000 }).catch(() => undefined);
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
    // Hard Gap #21 (2026-04-13): replaced two waitForTimeout calls with
    // state-driven waits. The 1200ms before clicking Done was guarding
    // against an in-flight auto-save flush; we now wait explicitly for
    // the gadget figure node to be serialized into the topic editor.
    // The 1800ms after Done was guarding for the read-mode transition;
    // replaced with waitForSelector on .topic-content-view, the same
    // pattern used in the inline-comment verifier.
    await page.waitForFunction((appId) => {
      const node = document.querySelector(`.topic-content-edit figure[data-gadget-type="app-frame"][data-app-id="${appId}"]`);
      return !!node;
    }, target.appId, { timeout: 8000 }).catch(() => undefined);
    await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Done" }).first().click();
    await page.waitForSelector(".topic-content-view", { timeout: 10000 });
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
