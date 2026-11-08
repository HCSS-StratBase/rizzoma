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
      body: JSON.stringify({
        title: topicTitle,
        content: '<p></p>',
      }),
    });
    return {
      ok: response.ok,
      status: response.status,
      data: await response.json().catch(() => null),
    };
  }, title);

  if (!result?.ok || !result?.data?.id) {
    throw new Error(`Failed to create topic (${result?.status ?? 'unknown'}): ${JSON.stringify(result?.data ?? null)}`);
  }

  return result.data.id;
}

async function openTopic(page, base, topicRef) {
  await page.goto(`${base}/#/topics?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".topics-container .search-result-item", { timeout: 30000 });
  await page.getByText(topicRef, { exact: true }).first().click();
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function main() {
  const gadgetLabel = process.argv[2];
  const urlValue = process.argv[3];
  const mode = process.argv[4] || "valid";
  const shotPath = process.argv[5];
  const htmlPath = process.argv[6];
  const base = process.argv[7] || "http://127.0.0.1:4179";
  const topicArg = process.argv[8] || "__create__";

  if (!gadgetLabel || !urlValue || !shotPath || !htmlPath) {
    throw new Error("Usage: node scripts/capture_live_topic_gadget_url.cjs <gadgetLabel> <url> <valid|invalid> <shotPath> <htmlPath> [baseUrl] [topicTitle]");
  }

  const expectedSelector = (() => {
    switch (gadgetLabel) {
      case 'Image':
        return '.topic-content-edit img[src], .topic-content-view img[src]';
      case 'YouTube':
      case 'iFrame':
      case 'Sheet':
        return '.topic-content-edit .gadget-embed-frame iframe, .topic-content-view .gadget-embed-frame iframe';
      default:
        return '.topic-content-edit .ProseMirror, .topic-content-view .ProseMirror';
    }
  })();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";

  await login(page, base, email, password);
  let topicTitle = topicArg;
  if (topicArg === "__create__") {
    topicTitle = `Embed adapter smoke ${Date.now()}`;
    const topicId = await createTopic(page, topicTitle);
    await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
    await page.waitForTimeout(1200);
  } else {
    await openTopic(page, base, topicTitle);
  }

  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
  await page.waitForTimeout(600);
  await page.locator(".topic-content-edit .ProseMirror").first().click();
  await page.waitForTimeout(250);
  await page.locator(".right-tools-panel .insert-btn.gadget-btn").first().click();
  await page.waitForSelector(".gadget-palette", { timeout: 8000 });
  await page.locator(".gadget-tile", { hasText: gadgetLabel }).first().click();
  await page.waitForSelector(".gadget-url-field", { timeout: 8000 });
  await page.locator(".gadget-url-field").fill(urlValue);
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.waitForTimeout(1200);

  if (mode === "valid") {
    await page.waitForSelector(expectedSelector, { timeout: 8000 });
    const doneButton = page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Done" }).first();
    if (await doneButton.count()) {
      await doneButton.click();
      await page.waitForTimeout(1800);
    }
  }

  await page.locator(mode === "valid" ? ".wave-container" : ".gadget-palette").screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
