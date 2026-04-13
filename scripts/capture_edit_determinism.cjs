// Focused live verifier for Hard Gap #12 (deterministic Edit semantics).
//
// The hard gap doc is explicit: "Edit never unexpectedly opens a poll" —
// clicking Edit must put the target blip into edit mode and surface NOTHING
// else (no gadget palette, no inserted poll node, no random gadget state).
//
// This verifier exercises three Edit cycles on a freshly-loaded topic:
//   1. Click Edit on the topic-meta-blip toolbar
//   2. Click Done to exit
//   3. Click Edit again
//   4. Click Done again
//   5. Click Edit a third time
// After each Edit click, it asserts that:
//   - editing IS active (.topic-content-edit visible OR blip in edit mode)
//   - no .gadget-palette is in the DOM
//   - no .poll-gadget node was injected into the editor body
//   - no other unexpected gadget node appears
//
// Usage:
//   node scripts/capture_edit_determinism.cjs <outDir> [baseUrl]

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

async function apiPost(page, urlPath, body) {
  return await page.evaluate(async ({ url, payload }) => {
    const readCookie = (name) => {
      const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
      return match?.[1] ? decodeURIComponent(match[1]) : undefined;
    };
    await fetch("/api/auth/csrf", { credentials: "include" });
    const token = readCookie("XSRF-TOKEN");
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  }, { url: urlPath, payload: body });
}

async function createTopic(page, title, content) {
  const result = await apiPost(page, "/api/topics", { title, content });
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

async function readEditState(page) {
  return await page.evaluate(() => ({
    topicEditMode: !!document.querySelector(".wave-container .topic-content-edit .ProseMirror"),
    topicReadMode: !!document.querySelector(".wave-container .topic-content-view"),
    topicToolbarEditing: !!document.querySelector(".wave-container .topic-blip-toolbar.editing"),
    gadgetPaletteVisible: !!document.querySelector(".wave-container .gadget-palette"),
    pollGadgetCount: document.querySelectorAll(".wave-container .poll-gadget").length,
    embedFrameCount: document.querySelectorAll(".wave-container .embed-frame-gadget").length,
    appFrameCount: document.querySelectorAll(".wave-container .app-frame-gadget").length,
    codeBlockCount: document.querySelectorAll(".wave-container .code-block-view").length,
    sandboxAppCount: document.querySelectorAll(".wave-container .sandbox-app-gadget-view").length,
  }));
}

async function clickTopicEdit(page) {
  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Edit" }).first().click();
  await page.waitForSelector(".topic-content-edit .ProseMirror", { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function clickTopicDone(page) {
  await page.locator(".topic-blip-toolbar .topic-tb-btn", { hasText: "Done" }).first().click();
  await page.waitForSelector(".topic-content-view", { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || "http://127.0.0.1:3000";
  if (!outDir) {
    throw new Error("Usage: node scripts/capture_edit_determinism.cjs <outDir> [baseUrl]");
  }
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  page.on("console", (msg) => {
    console.log("[browser]", msg.type(), msg.text());
  });
  const email = "codex-live+1774803822194@example.com";
  const password = "CodexLive!1";

  await login(page, base, email, password);

  const topicTitle = `Edit determinism audit ${Date.now()}`;
  const topicContent = [
    `<h1>${topicTitle}</h1>`,
    "<p>#MetaTopic</p>",
    "<p>Topic body. Edit click should open editing for this blip and nothing else.</p>",
  ].join("");
  const topicId = await createTopic(page, topicTitle, topicContent);

  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1000);
  const initialState = await readEditState(page);
  await shot(page, outDir, 1, "topic-loaded");

  // Cycle 1: Edit → state → Done
  await clickTopicEdit(page);
  const state1Edit = await readEditState(page);
  await shot(page, outDir, 2, "cycle1-edit");
  await clickTopicDone(page);
  const state1Done = await readEditState(page);
  await shot(page, outDir, 3, "cycle1-done");

  // Cycle 2: Edit → state → Done
  await clickTopicEdit(page);
  const state2Edit = await readEditState(page);
  await shot(page, outDir, 4, "cycle2-edit");
  await clickTopicDone(page);
  const state2Done = await readEditState(page);
  await shot(page, outDir, 5, "cycle2-done");

  // Cycle 3: Edit → state (leave in edit mode for the final capture)
  await clickTopicEdit(page);
  const state3Edit = await readEditState(page);
  await shot(page, outDir, 6, "cycle3-edit");

  const cycles = [state1Edit, state2Edit, state3Edit];

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({
    topicId,
    base,
    timestamp: new Date().toISOString(),
    initialState,
    cycles: {
      cycle1Edit: state1Edit,
      cycle1Done: state1Done,
      cycle2Edit: state2Edit,
      cycle2Done: state2Done,
      cycle3Edit: state3Edit,
    },
    assertions: {
      // Each Edit click puts the topic in edit mode
      editEntered_cycle1: state1Edit.topicEditMode === true && state1Edit.topicToolbarEditing === true,
      editEntered_cycle2: state2Edit.topicEditMode === true && state2Edit.topicToolbarEditing === true,
      editEntered_cycle3: state3Edit.topicEditMode === true && state3Edit.topicToolbarEditing === true,
      // Each Done click returns to read mode
      doneExited_cycle1: state1Done.topicReadMode === true && state1Done.topicToolbarEditing === false,
      doneExited_cycle2: state2Done.topicReadMode === true && state2Done.topicToolbarEditing === false,
      // No phantom gadget palette or gadget node ever surfaces during ANY Edit cycle
      noGadgetPaletteEverShown: cycles.every((s) => s.gadgetPaletteVisible === false),
      noPollEverInjected: cycles.every((s) => s.pollGadgetCount === 0),
      noEmbedEverInjected: cycles.every((s) => s.embedFrameCount === 0),
      noAppFrameEverInjected: cycles.every((s) => s.appFrameCount === 0),
      noCodeBlockEverInjected: cycles.every((s) => s.codeBlockCount === 0),
      noSandboxAppEverInjected: cycles.every((s) => s.sandboxAppCount === 0),
    },
  }, null, 2));
  fs.writeFileSync(path.join(outDir, "final.html"), await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
