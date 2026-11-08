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
  const base = process.argv[3] || "http://127.0.0.1:4198";
  if (!outDir) {
    throw new Error("Usage: node scripts/capture_complex_live_workflow.cjs <outDir> [baseUrl]");
  }

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";

  const steps = [];
  const topicId = await (async () => {
    await login(page, base, email, password);
    return createTopic(
      page,
      `Complex workflow audit ${Date.now()}`,
      [
        "<h1>Complex workflow audit</h1>",
        "<p>#MetaTopic</p>",
        "<ul>",
        "<li><p>One-liner for the workflow audit</p></li>",
        "<li><p>Reference links for parity review</p></li>",
        "<li><p>Open questions to resolve after capture</p></li>",
        "</ul>",
        "<p>This topic is intentionally structured to stress the ordinary reply/edit/gadget path instead of only synthetic parity fixtures.</p>",
      ].join(""),
    );
  })();

  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1200);

  steps.push({ step: "topic_loaded", ...(await shot(page, outDir, 1, "topic-loaded")) });

  const rootReplyInput = page.locator(".write-reply-input").first();
  await rootReplyInput.fill("Root reply A: use this thread to track the audit findings.");
  await rootReplyInput.press("Enter");
  await page.waitForSelector(".topic-blip-children .blip-collapsed-row", { timeout: 10000 });
  steps.push({ step: "root_reply_a_created", ...(await shot(page, outDir, 2, "root-reply-a-created")) });

  await rootReplyInput.fill("Root reply B: separate sibling to keep the root-vs-child distinction visible.");
  await rootReplyInput.press("Enter");
  await page.waitForTimeout(700);
  steps.push({ step: "root_reply_b_created", ...(await shot(page, outDir, 3, "root-reply-b-created")) });

  const rootRows = page.locator(".topic-blip-children .blip-collapsed-row");
  await rootRows.first().click();
  await page.waitForSelector(".topic-blip-children .rizzoma-blip.expanded .reply-placeholder-input", { timeout: 10000 });
  steps.push({ step: "root_reply_a_expanded", ...(await shot(page, outDir, 4, "root-reply-a-expanded")) });

  await page.locator(".topic-blip-children .rizzoma-blip.expanded .reply-placeholder-input").first().click();
  await page.waitForSelector(".topic-blip-children .rizzoma-blip.expanded .reply-textarea", { timeout: 10000 });
  steps.push({ step: "nested_reply_form_open", ...(await shot(page, outDir, 5, "nested-reply-form-open")) });

  await page.locator(".topic-blip-children .rizzoma-blip.expanded .reply-textarea").first().fill(
    "Nested reply A1: this should sit visibly under Root reply A and not flatten into the root.",
  );
  await page.locator(".topic-blip-children .rizzoma-blip.expanded .btn-send-reply").first().click();
  await page.waitForSelector(".topic-blip-children .child-blip-collapsed, .topic-blip-children .child-blip-wrapper .rizzoma-blip", { timeout: 10000 });
  steps.push({ step: "nested_reply_created", ...(await shot(page, outDir, 6, "nested-reply-created")) });

  const childCollapsed = page.locator(".topic-blip-children .child-blip-collapsed").first();
  if (await childCollapsed.count()) {
    await childCollapsed.click();
    await page.waitForTimeout(700);
  }
  steps.push({ step: "nested_reply_expanded", ...(await shot(page, outDir, 7, "nested-reply-expanded")) });

  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
  await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });
  await page.locator(".topic-content-edit .ProseMirror").first().click();
  steps.push({ step: "topic_edit_mode", ...(await shot(page, outDir, 8, "topic-edit-mode")) });

  await page.locator(".right-tools-panel .insert-btn.gadget-btn").first().click();
  await page.waitForSelector(".gadget-palette", { timeout: 10000 });
  steps.push({ step: "gadget_palette_open", ...(await shot(page, outDir, 9, "gadget-palette-open")) });

  await page.locator(".gadget-tile", { hasText: "Poll" }).first().click();
  await page.waitForTimeout(1200);
  steps.push({ step: "poll_inserted", ...(await shot(page, outDir, 10, "poll-inserted")) });

  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Done" }).first().click();
  await page.waitForTimeout(1800);
  steps.push({ step: "done_mode_after_poll", ...(await shot(page, outDir, 11, "done-mode-after-poll")) });

  const summary = {
    topicId,
    base,
    timestamp: new Date().toISOString(),
    steps,
    finalHtmlPath: path.join(outDir, "final.html"),
  };

  fs.writeFileSync(path.join(outDir, "final.html"), await page.content());
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
