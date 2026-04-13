// Focused live verifier for Hard Gap #13 (BLB hierarchy legibility).
//
// Creates a topic with multiple nested list-thread replies and captures the
// rendered hierarchy. The point of the capture is visual: a user should be
// able to glance at the thread and immediately understand what is root,
// what is child, what is sibling, without effort. Nested replies should
// feel structurally subordinate via the indent rail, not floating padded
// cards with their own borders/shadows.
//
// Hierarchy:
//   - Topic meta-blip (root)
//     - List reply A (parent)
//       - List reply A1 (child)
//         - List reply A11 (grandchild)
//       - List reply A2 (child sibling of A1)
//     - List reply B (sibling of A at root level)
//     - List reply C (sibling of A at root level)
//
// Usage:
//   node scripts/capture_blb_hierarchy.cjs <outDir> [baseUrl]

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

async function createBlip(page, waveId, parentId, content) {
  const result = await apiPost(page, "/api/blips", { waveId, parentId, content });
  if (!result?.ok || !result?.data) {
    throw new Error(`Failed to create blip (${result?.status ?? "unknown"}): ${JSON.stringify(result?.data ?? null)}`);
  }
  const blip = result.data;
  return { id: blip.id || blip._id, content: blip.content };
}

async function shot(page, outDir, index, slug) {
  // Hard Gap #38 (2026-04-13): capture the whole viewport so the nav panel
  // and right tools panel are visible, not just the cropped wave column.
  const filename = `${String(index).padStart(2, "0")}-${slug}.png`;
  const filePath = path.join(outDir, filename);
  await page.screenshot({ path: filePath, fullPage: false });
  const htmlPath = path.join(outDir, `${String(index).padStart(2, "0")}-${slug}.html`);
  fs.writeFileSync(htmlPath, await page.content());
  return { screenshot: filePath, html: htmlPath };
}

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || "http://127.0.0.1:3000";
  if (!outDir) {
    throw new Error("Usage: node scripts/capture_blb_hierarchy.cjs <outDir> [baseUrl]");
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

  const topicTitle = `BLB hierarchy audit ${Date.now()}`;
  const topicContent = [
    `<h1>${topicTitle}</h1>`,
    "<p>#MetaTopic</p>",
    "<p>Topic meta-blip body. The replies below should read as a clear parent-child-grandchild thread under the indent rail, not as floating padded cards.</p>",
    "<ul>",
    "<li><p>Section context one</p></li>",
    "<li><p>Section context two</p></li>",
    "</ul>",
  ].join("");
  const topicId = await createTopic(page, topicTitle, topicContent);

  // Create three siblings at the root level (children of the topic).
  const replyA = await createBlip(page, topicId, null, "<p>Root reply A — first sibling under the topic meta-blip.</p>");
  const replyB = await createBlip(page, topicId, null, "<p>Root reply B — second sibling. Should sit at the same indent as reply A.</p>");
  const replyC = await createBlip(page, topicId, null, "<p>Root reply C — third sibling. Three siblings at root level proves horizontal sibling alignment.</p>");

  // Nest two children under reply A (parent → A1 and A2).
  const replyA1 = await createBlip(page, topicId, replyA.id, "<p>Reply A1 — child of A. Should sit one indent level deeper than A.</p>");
  const replyA2 = await createBlip(page, topicId, replyA.id, "<p>Reply A2 — second child of A, sibling of A1 at the same indent depth.</p>");

  // Grandchild under A1.
  const replyA11 = await createBlip(page, topicId, replyA1.id, "<p>Reply A11 — grandchild of A, child of A1. Should sit two indent levels deeper than A.</p>");

  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const initialState = await page.evaluate(() => ({
    rootReplies: document.querySelectorAll(".wave-container .topic-blip-children > .child-blips > .child-blip-wrapper").length,
    nestedRails: document.querySelectorAll(".wave-container .child-blips").length,
    collapsedRows: document.querySelectorAll(".wave-container .topic-blip-children .blip-collapsed-row").length,
  }));
  await shot(page, outDir, 1, "topic-collapsed");

  // Expand reply A by clicking its collapsed row.
  const collapsedRows = page.locator(".wave-container .topic-blip-children .blip-collapsed-row");
  const rowCount = await collapsedRows.count();
  if (rowCount > 0) {
    await collapsedRows.first().click();
    await page.waitForTimeout(800);
  }
  await shot(page, outDir, 2, "reply-A-expanded");

  // Expand reply A1 (the first child of A) so the grandchild row becomes visible.
  const collapsedRowsAfter = page.locator(".wave-container .topic-blip-children .blip-collapsed-row");
  const rowCountAfter = await collapsedRowsAfter.count();
  if (rowCountAfter > 0) {
    // Click the first collapsed row that's nested under reply A's expanded view.
    await collapsedRowsAfter.first().click();
    await page.waitForTimeout(800);
  }
  await shot(page, outDir, 3, "reply-A1-expanded");

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({
    topicId,
    base,
    timestamp: new Date().toISOString(),
    replies: {
      A: replyA.id,
      A1: replyA1.id,
      A11: replyA11.id,
      A2: replyA2.id,
      B: replyB.id,
      C: replyC.id,
    },
    initialState,
  }, null, 2));
  fs.writeFileSync(path.join(outDir, "final.html"), await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
