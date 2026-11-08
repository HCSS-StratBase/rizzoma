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
      body: JSON.stringify({
        title: topicTitle,
        content: "<h1>Workflow exploration</h1><p>Trying the basic live topic flow.</p>",
      }),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  }, title);

  if (!result?.ok || !result?.data?.id) {
    throw new Error(`Failed to create topic (${result?.status ?? "unknown"}): ${JSON.stringify(result?.data ?? null)}`);
  }
  return result.data.id;
}

async function attempt(stepName, steps, fn) {
  try {
    const detail = await fn();
    steps.push({ step: stepName, ok: true, detail: detail ?? null });
    return detail;
  } catch (error) {
    steps.push({ step: stepName, ok: false, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function main() {
  const shotPath = process.argv[2];
  const htmlPath = process.argv[3];
  const jsonPath = process.argv[4];
  const base = process.argv[5] || "http://127.0.0.1:4198";

  if (!shotPath || !htmlPath || !jsonPath) {
    throw new Error("Usage: node scripts/explore_live_blip_workflow.cjs <shotPath> <htmlPath> <jsonPath> [baseUrl]");
  }

  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";
  const steps = [];

  await login(page, base, email, password);
  const topicId = await createTopic(page, `Workflow exploration ${Date.now()}`);
  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1200);

  await attempt("create_root_reply", steps, async () => {
    const input = page.locator(".write-reply-input").first();
    await input.fill("Root reply created through the normal write-a-reply field.");
    await input.press("Enter");
    await page.waitForSelector(".topic-blip-children .blip-collapsed-row", { timeout: 10000 });
    return {
      rootReplyCount: await page.locator(".topic-blip-children .blip-collapsed-row").count(),
    };
  });

  await attempt("expand_root_reply", steps, async () => {
    const collapsed = page.locator(".topic-blip-children .blip-collapsed-row").first();
    await collapsed.click();
    await page.waitForSelector(".topic-blip-children .rizzoma-blip.expanded .reply-placeholder-input", { timeout: 10000 });
    return {
      expandedReplyCount: await page.locator(".topic-blip-children .rizzoma-blip.expanded").count(),
    };
  });

  await attempt("open_nested_reply_form", steps, async () => {
    const replyInput = page.locator(".topic-blip-children .rizzoma-blip.expanded .reply-placeholder-input").first();
    await replyInput.click();
    await page.waitForSelector(".topic-blip-children .rizzoma-blip.expanded .reply-textarea", { timeout: 10000 });
    return {
      replyTextareaVisible: await page.locator(".topic-blip-children .rizzoma-blip.expanded .reply-textarea").first().isVisible(),
    };
  });

  await attempt("create_nested_reply", steps, async () => {
    const textarea = page.locator(".topic-blip-children .rizzoma-blip.expanded .reply-textarea").first();
    await textarea.fill("Nested reply created through the inline reply form.");
    await page.locator(".topic-blip-children .rizzoma-blip.expanded .btn-send-reply").first().click();
    await page.waitForSelector(".topic-blip-children .child-blip-collapsed, .topic-blip-children .child-blip-wrapper .rizzoma-blip", { timeout: 10000 });
    return {
      nestedCollapsedCount: await page.locator(".topic-blip-children .child-blip-collapsed").count(),
    };
  });

  await attempt("enter_topic_edit_mode", steps, async () => {
    await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
    await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });
    await page.locator(".topic-content-edit .ProseMirror").first().click();
    return {
      topicEditorVisible: await page.locator(".topic-content-edit .ProseMirror").first().isVisible(),
    };
  });

  await attempt("open_gadget_palette", steps, async () => {
    const gadgetButton = page.locator(".right-tools-panel .insert-btn.gadget-btn").first();
    await gadgetButton.waitFor({ timeout: 10000 });
    await gadgetButton.click();
    await page.waitForSelector(".gadget-palette", { timeout: 10000 });
    return {
      gadgetTileCount: await page.locator(".gadget-palette .gadget-tile").count(),
    };
  });

  const summary = {
    topicId,
    base,
    timestamp: new Date().toISOString(),
    steps,
  };

  await page.locator(".wave-container").screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
