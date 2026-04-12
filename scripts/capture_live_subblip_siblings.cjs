// Focused live verifier for the subblip parent-blip preview (#34) and the
// sibling prev/next navigation (#35). Creates a topic with 2 inline anchor
// points, Ctrl+Enters at each to create 2 sibling subblips, then exercises
// the sibling nav buttons in the subblip view.
//
// Usage:
//   node scripts/capture_live_subblip_siblings.cjs <outDir> [baseUrl]
//
// baseUrl defaults to http://127.0.0.1:3000 (the canonical Vite dev URL,
// which proxies /api to the reserved Rizzoma backend on :8788).

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

async function ctrlEnterAtParagraph(page, paragraphIndex) {
  const editor = page.locator(".topic-content-edit .ProseMirror").first();
  await editor.click();
  const paragraph = editor.locator("li p").nth(paragraphIndex);
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+Enter");
  await page.waitForSelector(".subblip-view .blip-editor-container .ProseMirror", { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function typeAndDoneSubblip(page, body) {
  const subblipEditor = page.locator(".subblip-view .blip-editor-container .ProseMirror[contenteditable=\"true\"]").first();
  await subblipEditor.click();
  await subblipEditor.pressSequentially(body);
  await page.waitForFunction((expected) => {
    const el = document.querySelector(".subblip-view .blip-editor-container .ProseMirror[contenteditable=\"true\"]");
    return !!el && (el.textContent || "").includes(expected);
  }, body, { timeout: 5000 });
  await page.waitForTimeout(300);
  const doneButton = page.locator(".subblip-view [data-testid=\"blip-menu-done\"]").first();
  await doneButton.click();
  const reachedRead = await page.locator(".subblip-view .blip-view-mode").first().waitFor({ timeout: 2500 }).then(() => true).catch(() => false);
  if (!reachedRead) {
    await doneButton.evaluate((button) => {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
  await page.waitForSelector(".subblip-view .blip-view-mode", { timeout: 15000 });
  await page.waitForTimeout(300);
}

async function readSubblipState(page) {
  return await page.evaluate(() => {
    const navBar = document.querySelector(".subblip-view .subblip-nav-bar");
    const counter = navBar?.querySelector(".subblip-sibling-counter")?.textContent?.trim() || null;
    const prevDisabled = navBar?.querySelector(".subblip-sibling-prev")?.hasAttribute("disabled") ?? null;
    const nextDisabled = navBar?.querySelector(".subblip-sibling-next")?.hasAttribute("disabled") ?? null;
    const siblingButtons = navBar?.querySelectorAll(".subblip-sibling-btn").length || 0;
    // Parent preview can be either a real RizzomaBlip render (when the parent
    // is a non-root blip in allBlipsMap) or the topic-context fallback (when
    // the parent is the topic root, which is the common case for inline
    // comments anchored to the meta-blip).
    const parentBlipNode = document.querySelector(".subblip-view .subblip-parent-context-blip .rizzoma-blip");
    const parentTopicNode = document.querySelector(".subblip-view .subblip-parent-context-topic");
    const parentPreviewKind = parentBlipNode ? "blip" : (parentTopicNode ? "topic" : null);
    const parentPreviewText = (parentBlipNode || parentTopicNode)?.textContent?.trim() || null;
    // Focused subblip body — read mode renders .blip-text via dangerouslySetInnerHTML
    // (data-testid="blip-view-content"). Edit mode swaps in a ProseMirror editor.
    const focusedReadEl = document.querySelector('.subblip-view .subblip-focus-shell [data-testid="blip-view-content"]');
    const focusedEditEl = document.querySelector('.subblip-view .subblip-focus-shell .blip-editor-container .ProseMirror');
    const focusedBodyText = (focusedReadEl || focusedEditEl)?.textContent?.trim() || null;
    const focusedMode = focusedReadEl ? "read" : (focusedEditEl ? "edit" : null);
    const breadcrumbCurrent = document.querySelector(".subblip-view .current-blip-label")?.textContent?.trim() || null;
    return {
      url: window.location.href,
      hash: window.location.hash,
      siblingButtons,
      counter,
      prevDisabled,
      nextDisabled,
      parentPreviewKind,
      parentPreviewText,
      focusedBodyText,
      focusedMode,
      breadcrumbCurrent,
    };
  });
}

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || "http://127.0.0.1:3000";
  if (!outDir) {
    throw new Error("Usage: node scripts/capture_live_subblip_siblings.cjs <outDir> [baseUrl]");
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
    `Subblip siblings audit ${Date.now()}`,
    [
      "<h1>Subblip siblings audit</h1>",
      "<p>#MetaTopic</p>",
      "<ul>",
      "<li><p>First anchor: parent inline preview should render here.</p></li>",
      "<li><p>Second anchor: prev/next sibling navigation under the same parent.</p></li>",
      "</ul>",
      "<p>This topic exercises the subblip view parent preview (#34) and sibling navigation (#35).</p>",
    ].join(""),
  );

  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1200);
  steps.push({ step: "topic_loaded", ...(await shot(page, outDir, 1, "topic-loaded")) });

  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
  await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });
  steps.push({ step: "topic_edit_mode", ...(await shot(page, outDir, 2, "topic-edit-mode")) });

  // First sibling
  await ctrlEnterAtParagraph(page, 0);
  await typeAndDoneSubblip(page, "First sibling subblip body.");
  const stateA1 = await readSubblipState(page);
  steps.push({ step: "first_sibling_done", ...(await shot(page, outDir, 3, "first-sibling-done")) });

  // Hide back to topic and re-enter edit mode
  await page.locator(".subblip-hide-btn").first().click();
  await page.waitForFunction(() => (
    document.querySelectorAll(".topic-content-view .blip-thread-marker").length > 0 ||
    document.querySelectorAll(".topic-content-edit .blip-thread-marker").length > 0
  ), { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click().catch(() => undefined);
  await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });

  // Second sibling
  await ctrlEnterAtParagraph(page, 1);
  await typeAndDoneSubblip(page, "Second sibling subblip body.");
  const stateB1 = await readSubblipState(page);
  steps.push({ step: "second_sibling_done", ...(await shot(page, outDir, 4, "second-sibling-done")) });

  // Click prev sibling — should navigate back to first sibling without going through topic
  await page.locator(".subblip-sibling-prev").first().click();
  await page.waitForFunction(
    (expectedFragment) => (window.location.hash || "").includes(expectedFragment),
    null,
    { timeout: 5000 },
  ).catch(() => undefined);
  await page.waitForTimeout(500);
  const stateA2 = await readSubblipState(page);
  steps.push({ step: "after_prev_sibling", ...(await shot(page, outDir, 5, "after-prev-sibling")) });

  // Click next sibling — should navigate forward to second sibling
  await page.locator(".subblip-sibling-next").first().click();
  await page.waitForTimeout(500);
  const stateB2 = await readSubblipState(page);
  steps.push({ step: "after_next_sibling", ...(await shot(page, outDir, 6, "after-next-sibling")) });

  // Verify the parent preview shows the same context in BOTH siblings
  const parentTextConsistent = stateA2.parentPreviewText && stateB2.parentPreviewText
    ? stateA2.parentPreviewText === stateB2.parentPreviewText
    : false;

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({
    topicId,
    base,
    timestamp: new Date().toISOString(),
    steps,
    states: {
      firstSiblingAfterDone: stateA1,
      secondSiblingAfterDone: stateB1,
      afterPrevSibling: stateA2,
      afterNextSibling: stateB2,
    },
    assertions: {
      siblingButtonsRenderedOnSecond: stateB1.siblingButtons === 2,
      counterShows1of2OnPrev: stateA2.counter === "1 / 2",
      counterShows2of2OnNext: stateB2.counter === "2 / 2",
      prevDisabledOnFirst: stateA2.prevDisabled === true,
      nextEnabledOnFirst: stateA2.nextDisabled === false,
      prevEnabledOnSecond: stateB2.prevDisabled === false,
      nextDisabledOnSecond: stateB2.nextDisabled === true,
      parentPreviewVisibleA: stateA2.parentPreviewKind !== null,
      parentPreviewVisibleB: stateB2.parentPreviewKind !== null,
      parentPreviewKindMatches: stateA2.parentPreviewKind === stateB2.parentPreviewKind,
      parentTextConsistent,
      focusedBodyChangesAcrossSiblings: stateA2.focusedBodyText !== stateB2.focusedBodyText,
    },
  }, null, 2));
  fs.writeFileSync(path.join(outDir, "final.html"), await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
