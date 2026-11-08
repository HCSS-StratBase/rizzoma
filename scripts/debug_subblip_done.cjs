const { chromium } = require("playwright");

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForTimeout(1500);
}

async function createTopic(page, title, content) {
  const result = await page.evaluate(async ({ topicTitle, topicContent }) => {
    const readCookie = (name) => {
      const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
      return match?.[1] ? decodeURIComponent(match[1]) : undefined;
    };

    await fetch("/api/auth/csrf", { credentials: "include" });
    const token = readCookie("XSRF-TOKEN");
    const response = await fetch("/api/topics", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-csrf-token": token } : {}),
      },
      body: JSON.stringify({ title: topicTitle, content: topicContent }),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  }, { topicTitle: title, topicContent: content });

  if (!result?.ok || !result?.data?.id) {
    throw new Error(`Failed to create topic (${result?.status ?? "unknown"}): ${JSON.stringify(result?.data ?? null)}`);
  }
  return result.data.id;
}

async function main() {
  const base = process.argv[2] || "http://127.0.0.1:4201";
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });

  await login(page, base, "codex-live+1774803822194@example.com", "CodexLive!1");
  const topicId = await createTopic(
    page,
    `Inline done debug ${Date.now()}`,
    [
      "<h1>Inline done debug</h1>",
      "<p>#MetaTopic</p>",
      "<ul>",
      "<li><p>First anchor point.</p></li>",
      "</ul>",
    ].join("")
  );

  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".topic-blip-toolbar .topic-tb-btn", { timeout: 15000 });
  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
  await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });
  const editor = page.locator(".topic-content-edit .ProseMirror").first();
  await editor.locator("li p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+Enter");
  await page.waitForSelector(".subblip-view .blip-editor-container .ProseMirror", { timeout: 15000 });

  const subblipEditor = page.locator(".subblip-view .blip-editor-container .ProseMirror").first();
  await subblipEditor.fill("Body from debug script");

  const doneButton = page.locator('.subblip-view [data-testid="blip-menu-done"]').first();
  console.log("before", {
    viewModeCount: await page.locator(".subblip-view .blip-view-mode").count(),
    editorCount: await page.locator(".subblip-view .blip-editor-container .ProseMirror").count(),
    doneCount: await doneButton.count(),
  });

  await doneButton.click({ force: true });
  await page.waitForTimeout(1500);
  console.log("after force click", {
    viewModeCount: await page.locator(".subblip-view .blip-view-mode").count(),
    editorCount: await page.locator(".subblip-view .blip-editor-container .ProseMirror").count(),
  });

  await doneButton.evaluate((el) => el.click());
  await page.waitForTimeout(1500);
  console.log("after eval click", {
    viewModeCount: await page.locator(".subblip-view .blip-view-mode").count(),
    editorCount: await page.locator(".subblip-view .blip-editor-container .ProseMirror").count(),
  });

  await page.locator(".wave-container").screenshot({ path: "screenshots/260331-inline-comment-audit-pass9/done-debug.png" });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
