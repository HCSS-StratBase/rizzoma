// Focused live verifier for the subblip parent inline preview (#34) and the
// sibling prev/next navigation (#35).
//
// Strategy: create both anchored sibling subblips via the /api/blips POST
// endpoint directly, with their bodies pre-baked. Then PATCH the topic to
// inject the [+] markers. This bypasses the Ctrl+Enter / typeAndDoneSubblip
// flow that was producing flaky empty bodies — both siblings already have
// their content persisted before the verifier loads the topic, so the
// rendering contracts can be exercised on real, settled state.
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

async function apiPatch(page, urlPath, body) {
  return await page.evaluate(async ({ url, payload }) => {
    const readCookie = (name) => {
      const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
      return match?.[1] ? decodeURIComponent(match[1]) : undefined;
    };
    await fetch("/api/auth/csrf", { credentials: "include" });
    const token = readCookie("XSRF-TOKEN");
    const response = await fetch(url, {
      method: "PATCH",
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

async function createInlineChildBlip(page, waveId, content, anchorPosition) {
  const result = await apiPost(page, "/api/blips", {
    waveId,
    content,
    parentId: null,
    anchorPosition,
  });
  if (!result?.ok || !result?.data) {
    throw new Error(`Failed to create inline child blip (${result?.status ?? "unknown"}): ${JSON.stringify(result?.data ?? null)}`);
  }
  const newBlip = result.data;
  const id = newBlip.id || newBlip._id;
  const blipPath = id && id.includes(":") ? id.split(":")[1] : id;
  return { id, blipPath, content: newBlip.content };
}

async function patchTopicContent(page, topicId, title, content) {
  const result = await apiPatch(page, `/api/topics/${encodeURIComponent(topicId)}`, { title, content });
  if (!result?.ok) {
    throw new Error(`Failed to patch topic (${result?.status ?? "unknown"}): ${JSON.stringify(result?.data ?? null)}`);
  }
}

async function shot(page, outDir, index, slug) {
  const filename = `${String(index).padStart(2, "0")}-${slug}.png`;
  const filePath = path.join(outDir, filename);
  await page.locator(".wave-container").screenshot({ path: filePath });
  const htmlPath = path.join(outDir, `${String(index).padStart(2, "0")}-${slug}.html`);
  fs.writeFileSync(htmlPath, await page.content());
  return { screenshot: filePath, html: htmlPath };
}

async function readSubblipState(page) {
  return await page.evaluate(() => {
    const navBar = document.querySelector(".subblip-view .subblip-nav-bar");
    const counter = navBar?.querySelector(".subblip-sibling-counter")?.textContent?.trim() || null;
    const prevDisabled = navBar?.querySelector(".subblip-sibling-prev")?.hasAttribute("disabled") ?? null;
    const nextDisabled = navBar?.querySelector(".subblip-sibling-next")?.hasAttribute("disabled") ?? null;
    const siblingButtons = navBar?.querySelectorAll(".subblip-sibling-btn").length || 0;
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
    const focusedBlipId = document.querySelector(".subblip-view .subblip-focus-shell .rizzoma-blip")?.getAttribute("data-blip-id") || null;
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
      focusedBlipId,
      breadcrumbCurrent,
    };
  });
}

async function clickSiblingButton(page, direction) {
  const selector = direction === "prev"
    ? ".subblip-view .subblip-sibling-prev"
    : ".subblip-view .subblip-sibling-next";
  const previousHash = await page.evaluate(() => window.location.hash);
  await page.locator(selector).first().click();
  await page.waitForFunction(
    (prev) => window.location.hash !== prev,
    previousHash,
    { timeout: 5000 },
  );
  await page.waitForTimeout(400);
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

  const topicTitle = `Subblip siblings audit ${Date.now()}`;
  const baseTopicContent = [
    `<h1>${topicTitle}</h1>`,
    "<p>#MetaTopic</p>",
    "<ul>",
    "<li><p>First anchor: parent inline preview should render here.</p></li>",
    "<li><p>Second anchor: prev/next sibling navigation under the same parent.</p></li>",
    "</ul>",
    "<p>This topic exercises the subblip view parent preview (#34) and sibling navigation (#35).</p>",
  ].join("");
  const topicId = await createTopic(page, topicTitle, baseTopicContent);

  // Create both anchored sibling subblips via the API with pre-baked bodies.
  // anchorPosition values are display-order keys (smaller = earlier sibling);
  // they match the cursor offsets the UI would have produced for the two
  // bullet paragraphs. Both blips are children of the topic root (parentId=null).
  const siblingA = await createInlineChildBlip(
    page,
    topicId,
    "<p>First sibling subblip body.</p>",
    10,
  );
  const siblingB = await createInlineChildBlip(
    page,
    topicId,
    "<p>Second sibling subblip body.</p>",
    100,
  );

  // Note: we deliberately do NOT PATCH the topic content with [+] markers.
  // The markers are decorative — the parent-context preview renders the
  // topic body via dangerouslySetInnerHTML and the sibling navigation reads
  // from topicInlineRootBlips (inline children with anchorPosition), not
  // from the markers in topic.content. Skipping the PATCH avoids a CouchDB
  // 409 Document update conflict (the topic _rev gets bumped server-side
  // when blips are created against it, so a follow-up PATCH from the
  // initial _rev fails). The sibling-nav contracts hold without the markers.

  // Navigate directly to sibling A's subblip URL.
  await page.goto(`${base}/#/topic/${topicId}/${siblingA.blipPath}/?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  await page.waitForSelector(".subblip-view", { timeout: 15000 });
  await page.waitForTimeout(800);
  const stateA1 = await readSubblipState(page);
  steps.push({ step: "loaded_at_sibling_A", ...(await shot(page, outDir, 1, "loaded-at-sibling-A")) });

  // Navigate to sibling B via the next sibling button.
  await clickSiblingButton(page, "next");
  const stateB1 = await readSubblipState(page);
  steps.push({ step: "navigated_to_sibling_B", ...(await shot(page, outDir, 2, "navigated-to-sibling-B")) });

  // Navigate back to sibling A via the prev sibling button.
  await clickSiblingButton(page, "prev");
  const stateA2 = await readSubblipState(page);
  steps.push({ step: "back_to_sibling_A", ...(await shot(page, outDir, 3, "back-to-sibling-A")) });

  // Navigate forward to sibling B again to confirm round trip.
  await clickSiblingButton(page, "next");
  const stateB2 = await readSubblipState(page);
  steps.push({ step: "forward_to_sibling_B", ...(await shot(page, outDir, 4, "forward-to-sibling-B")) });

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({
    topicId,
    siblingA,
    siblingB,
    base,
    timestamp: new Date().toISOString(),
    steps,
    states: {
      loadedAtA: stateA1,
      navigatedToB: stateB1,
      backToA: stateA2,
      forwardToB: stateB2,
    },
    assertions: {
      loadedOnSiblingA: stateA1.focusedBlipId === siblingA.id,
      siblingButtonsRenderedOnA: stateA1.siblingButtons === 2,
      counterShows1of2OnA: stateA1.counter === "1 / 2",
      prevDisabledOnA: stateA1.prevDisabled === true,
      nextEnabledOnA: stateA1.nextDisabled === false,
      focusedBodyA1: stateA1.focusedBodyText === "First sibling subblip body.",
      focusedReadModeA1: stateA1.focusedMode === "read",
      navigatedToB_url: stateB1.focusedBlipId === siblingB.id,
      counterShows2of2OnB: stateB1.counter === "2 / 2",
      prevEnabledOnB: stateB1.prevDisabled === false,
      nextDisabledOnB: stateB1.nextDisabled === true,
      focusedBodyB1: stateB1.focusedBodyText === "Second sibling subblip body.",
      focusedReadModeB1: stateB1.focusedMode === "read",
      backOnSiblingA: stateA2.focusedBlipId === siblingA.id,
      counterShows1of2OnA2: stateA2.counter === "1 / 2",
      focusedBodyA2: stateA2.focusedBodyText === "First sibling subblip body.",
      forwardOnSiblingB: stateB2.focusedBlipId === siblingB.id,
      counterShows2of2OnB2: stateB2.counter === "2 / 2",
      focusedBodyB2: stateB2.focusedBodyText === "Second sibling subblip body.",
      parentPreviewVisibleA: stateA1.parentPreviewKind !== null,
      parentPreviewVisibleB: stateB1.parentPreviewKind !== null,
      parentPreviewKindMatches: stateA1.parentPreviewKind === stateB1.parentPreviewKind,
      parentTextConsistent: stateA1.parentPreviewText === stateB1.parentPreviewText,
      focusedBodyChangesAcrossSiblings: stateA1.focusedBodyText !== stateB1.focusedBodyText,
    },
  }, null, 2));
  fs.writeFileSync(path.join(outDir, "final.html"), await page.content());
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
