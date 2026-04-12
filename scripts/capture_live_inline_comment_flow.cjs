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

async function shot(page, outDir, index, slug) {
  const filename = `${String(index).padStart(2, "0")}-${slug}.png`;
  const filePath = path.join(outDir, filename);
  await page.locator(".wave-container").screenshot({ path: filePath });
  const htmlPath = path.join(outDir, `${String(index).padStart(2, "0")}-${slug}.html`);
  fs.writeFileSync(htmlPath, await page.content());
  return { screenshot: filePath, html: htmlPath };
}

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || "http://127.0.0.1:4199";
  if (!outDir) {
    throw new Error("Usage: node scripts/capture_live_inline_comment_flow.cjs <outDir> [baseUrl]");
  }

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  page.on("console", (msg) => {
    console.log("[browser]", msg.type(), msg.text());
  });
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";
  const steps = [];

  await login(page, base, email, password);
  const topicId = await createTopic(
    page,
    `Inline comment audit ${Date.now()}`,
    [
      "<h1>Inline comment audit</h1>",
      "<p>#MetaTopic</p>",
      "<ul>",
      "<li><p>First anchor point for Ctrl+Enter.</p></li>",
      "<li><p>Second anchor point for Ctrl+Enter.</p></li>",
      "</ul>",
      "<p>This topic exists only to test the live anchored inline-comment path.</p>",
    ].join(""),
  );

  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1200);
  steps.push({ step: "topic_loaded", ...(await shot(page, outDir, 1, "topic-loaded")) });

  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
  await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });
  const editor = page.locator(".topic-content-edit .ProseMirror").first();
  await editor.click();
  steps.push({ step: "topic_edit_mode", ...(await shot(page, outDir, 2, "topic-edit-mode")) });

  const paragraph = editor.locator("li p").first();
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+Enter");
  await page.waitForSelector(".subblip-view .blip-editor-container .ProseMirror", { timeout: 15000 });
  await page.waitForTimeout(600);
  const afterCtrlEnterState = await page.evaluate(() => ({
    url: window.location.href,
    hash: window.location.hash,
    hasTopicContentView: !!document.querySelector(".topic-content-view"),
    hasTopicContentEdit: !!document.querySelector(".topic-content-edit"),
    hasSubblipView: !!document.querySelector(".subblip-view"),
    topicEditorDebug: (window).__RIZZOMA_TOPIC_EDITOR_DEBUG || null,
  }));
  steps.push({ step: "after_ctrl_enter", ...(await shot(page, outDir, 3, "after-ctrl-enter")) });

  const subblipEditor = page.locator(".subblip-view .blip-editor-container .ProseMirror[contenteditable=\"true\"]").first();
  const subblipText = "Inline subblip body created from Ctrl+Enter.";
  await subblipEditor.click();
  await subblipEditor.pressSequentially(subblipText);
  await page.waitForFunction((expected) => {
    const el = document.querySelector(".subblip-view .blip-editor-container .ProseMirror[contenteditable=\"true\"]");
    return !!el && (el.textContent || "").includes(expected);
  }, subblipText, { timeout: 5000 });
  await page.waitForTimeout(400);
  const doneButton = page.locator(".subblip-view [data-testid=\"blip-menu-done\"]").first();
  await doneButton.click();
  const readModeAppeared = await page.locator(".subblip-view .blip-view-mode").first().waitFor({ timeout: 2500 }).then(() => true).catch(() => false);
  if (!readModeAppeared) {
    console.log("[audit] normal click did not reach subblip read mode, retrying with DOM-dispatched click");
    await doneButton.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
  await page.waitForSelector(".subblip-view .blip-view-mode", { timeout: 15000 });
  await page.waitForTimeout(400);
  const subblipDoneState = await page.evaluate(() => ({
    url: window.location.href,
    hash: window.location.hash,
    hasTopicContentView: !!document.querySelector(".topic-content-view"),
    hasTopicContentEdit: !!document.querySelector(".topic-content-edit"),
    hasSubblipView: !!document.querySelector(".subblip-view"),
    topicEditorDebug: (window).__RIZZOMA_TOPIC_EDITOR_DEBUG || null,
  }));
  steps.push({ step: "subblip_done_mode", ...(await shot(page, outDir, 4, "subblip-done-mode")) });

  await page.locator(".subblip-hide-btn").first().click();
  await page.waitForTimeout(1200);
  steps.push({ step: "after_hide_click", ...(await shot(page, outDir, 5, "after-hide-click")) });
  const afterHideState = await page.evaluate(() => ({
    url: window.location.href,
    hash: window.location.hash,
    hasTopicContentView: !!document.querySelector(".topic-content-view"),
    hasTopicContentEdit: !!document.querySelector(".topic-content-edit"),
    hasSubblipView: !!document.querySelector(".subblip-view"),
    topicToolbarEditing: !!document.querySelector(".topic-blip-toolbar.editing"),
    topicToolbarButtons: Array.from(document.querySelectorAll(".topic-blip-toolbar .topic-tb-btn")).map((el) => el.textContent?.trim() || ""),
    markerCount: document.querySelectorAll(".topic-content-view .blip-thread-marker").length,
    editMarkerCount: document.querySelectorAll(".topic-content-edit .blip-thread-marker").length,
    topicContentHtml: document.querySelector(".topic-content-view")?.innerHTML || "",
    topicEditHtml: document.querySelector(".topic-content-edit")?.innerHTML || "",
    topicEditorDebug: (window).__RIZZOMA_TOPIC_EDITOR_DEBUG || null,
  }));
  await page.waitForFunction(() => (
    document.querySelectorAll(".topic-content-view .blip-thread-marker").length > 0 ||
    document.querySelectorAll(".topic-content-edit .blip-thread-marker").length > 0
  ), { timeout: 10000 });
  await page.waitForTimeout(600);
  steps.push({ step: "returned_to_topic", ...(await shot(page, outDir, 6, "returned-to-topic")) });

  const urlBeforeMarkerClick = page.url();
  const markerSelector = await page.evaluate(() => (
    document.querySelector(".topic-content-view .blip-thread-marker")
      ? ".topic-content-view .blip-thread-marker"
      : ".topic-content-edit .blip-thread-marker"
  ));
  await page.locator(markerSelector).first().click();
  await page.waitForSelector(".subblip-view", { timeout: 10000 });
  await page.waitForTimeout(600);
  const urlAfterMarkerClick = page.url();
  steps.push({ step: "after_marker_click", ...(await shot(page, outDir, 7, "after-marker-click")) });

  const summary = await page.evaluate(() => {
    const markerCount = document.querySelectorAll(".topic-content-view .blip-thread-marker, .topic-content-edit .blip-thread-marker").length;
    const subblipEditorVisible = !!document.querySelector(".subblip-view .blip-editor-container .ProseMirror");
    const subblipReadVisible = !!document.querySelector(".subblip-view .blip-view-mode");
    const subblipBodyHtml = document.querySelector(".subblip-view .blip-content .ProseMirror, .subblip-view .blip-view-mode .blip-text")?.innerHTML || "";
    const parentReturnedInEditMode = !!document.querySelector(".topic-content-edit");
    return { markerCount, subblipEditorVisible, subblipReadVisible, subblipBodyHtml, parentReturnedInEditMode };
  });

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({
    topicId,
    base,
    timestamp: new Date().toISOString(),
    steps,
    summary,
    afterCtrlEnterState,
    subblipDoneState,
    afterHideState,
    urlBeforeMarkerClick,
    urlAfterMarkerClick,
  }, null, 2));
  fs.writeFileSync(path.join(outDir, "final.html"), await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
