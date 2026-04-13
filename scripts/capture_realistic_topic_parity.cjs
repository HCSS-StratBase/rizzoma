// Honest parity capture against rizzoma-live/feature/rizzoma-core-features/.
//
// The original reference captures (rizzoma-blips-nested, rizzoma-replies-expanded,
// rizzoma-main) showed a real business topic with dense content: multiple reply
// blips, nested bullets, numbered lists, inline links. Every verifier I ran
// before this was capturing a test-seed topic with 4 lines of placeholder text,
// so the comparison was structurally unfair even when the chrome matched.
//
// This verifier seeds a realistic business topic with:
//   - A topic body with tagged intro, nested bullets, numbered sub-sections
//   - 4 reply blips from the test user (can't simulate multi-author in a
//     single-tenant capture, but the structural density is what matters)
//   - Inline markdown-ish content mirroring what a real topic would carry
//
// Then it captures the FULL viewport (1440x900, matching the legacy reference
// dimensions) with no .wave-container crop, so we can lay it next to
// rizzoma-blips-nested.png for a proper side-by-side.
//
// Usage:
//   node scripts/capture_realistic_topic_parity.cjs <outDir> [baseUrl]

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await page.waitForSelector('.rizzoma-layout', { timeout: 15000 });
  await page.waitForSelector('.rizzoma-topics-list, .topics-container, .navigation-panel', { timeout: 15000 });
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
    throw new Error(`createTopic failed: ${JSON.stringify(result)}`);
  }
  return result.data.id;
}

async function createBlip(page, waveId, parentId, content) {
  const result = await apiPost(page, "/api/blips", { waveId, parentId, content });
  if (!result?.ok || !result?.data) {
    throw new Error(`createBlip failed: ${JSON.stringify(result)}`);
  }
  return { id: result.data.id || result.data._id };
}

async function patchTopic(page, topicId, body) {
  return await page.evaluate(async ({ topicId, payload }) => {
    const readCookie = (name) => {
      const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
      return match?.[1] ? decodeURIComponent(match[1]) : undefined;
    };
    await fetch("/api/auth/csrf", { credentials: "include" });
    const token = readCookie("XSRF-TOKEN");
    const response = await fetch(`/api/topics/${encodeURIComponent(topicId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(token ? { "x-csrf-token": token } : {}),
      },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  }, { topicId, payload: body });
}

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || "http://127.0.0.1:3000";
  if (!outDir) {
    throw new Error("Usage: node scripts/capture_realistic_topic_parity.cjs <outDir> [baseUrl]");
  }
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  // Match the legacy reference capture dimensions exactly — 1440x900.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await login(page, base, "codex-live+1774803822194@example.com", "CodexLive!1");

  // Seed a handful of varied workspace topics BEFORE the main parity
  // topic, so the topics-list column in the capture shows realistic
  // variety (not just rows of "HCSS Rizzoma Business Topic (parity
  // test)"). These make the side-by-side comparison honest against the
  // legacy rizzoma-blips-nested.png which shows a varied workspace.
  const workspaceTopics = [
    { title: "Проста згадка / Space notification", body: "<p>Space / notification placeholder for workspace context.</p>" },
    { title: "'WACKO!' — The Influence of Russian Historical", body: "<p>Historical narrative research strand.</p>" },
    { title: "Cossackdom", body: "<p>Cossack identity and historical framing.</p>" },
    { title: "LLMs", body: "<p>Language model research notes and prompt experiments.</p>" },
    { title: "LLM Benchmarks", body: "<p>Benchmarks across GPT-4, Claude, Gemini, Mistral.</p>" },
    { title: "Integrum", body: "<p>Integrum database research extraction notes.</p>" },
    { title: "Russian-Ukrainian War corpus", body: "<p>Corpus collection for war-related discourse analysis.</p>" },
    { title: "Коллективный Разум. Развитие.", body: "<p>Коллективный разум — сбор тем и обсуждений.</p>" },
    { title: "ШКМ. Коллективный разум. сессия 2, 3", body: "<p>ШКМ session 2 and 3 collective-intelligence notes.</p>" },
  ];
  for (const t of workspaceTopics) {
    try { await createTopic(page, t.title, t.body); } catch {}
  }

  const topicTitle = `HCSS Rizzoma Business Topic`;
  const topicContent = [
    `<h1>${topicTitle}</h1>`,
    `<p>#MetaTopic</p>`,
    `<ul>`,
    `<li><p><strong>Oneliner</strong></p>`,
    `<ul><li><p>This is the 'landing page' that opens up when you get into Rizzoma if you're a paying Rizzoma business account member. We want to keep 'bare bones' for just a small group of people — to minimize the costs. It will not be updated.</p></li>`,
    `<li><p>Unless we see a reason for it.</p></li>`,
    `<li><p>— the 'real' Metatopic is <a href="#">here</a>.</p></li></ul></li>`,
    `<li><p><strong>Relevant links</strong></p>`,
    `<ul><li><p>New to Rizzoma</p></li></ul></li>`,
    `<li><p><strong>What is Rizzoma</strong></p>`,
    `<ul><li><p>Rizzoma is fully 'democratic' (Russia-based) real-time online collaboration tool that we feel is great for the type of knowledge work we do: feel free to jump in anywhere and either modify/augment/critique/… what is there.</p></li></ul></li>`,
    `<li><p><strong>First steps in Rizzoma</strong></p>`,
    `<ol>`,
    `<li><p>Click the 'plus' sign at the end of this line and watch the <a href="#">1:17' introductory video</a></p></li>`,
    `<li><p>Make sure you read the one-liner, the research assignment of the project you have been assigned to and skim at least the main structure of the 'research design' section (and you may want to drill down into the sections that you will be working on)</p></li>`,
    `<li><p>The most useful button on Rizzoma is the green button on the top right of your pane here that says 'next'. That will light up in green whenever somebody posts sthg new in whatever topic your cursor is in. If you click on the button, you'll jump to the first blip you haven't read yet</p></li>`,
    `<li><p>If you got invited to a big topic in which all blips are 'green', you may want to mark the entire topic as 'read', and then, from the top, start using the green button to just see the 'new' things that are added</p></li>`,
    `</ol></li></ul>`,
    `<p><strong>Managing the green</strong>: How to stay up to date on a big Rizzoma topic</p>`,
    `<ul>`,
    `<li><p><strong>Golden rules</strong> - these are critically important to a productive use of this tool, so please do read them</p></li>`,
    `<li><p>Abbreviations</p></li>`,
    `<li><p>Navigation/Search hints in Rizzoma</p></li>`,
    `<li><p>Confidential information</p></li>`,
    `<li><p>Rizzoma and HCSS</p></li>`,
    `</ul>`,
    `<p><strong>Description</strong></p>`,
    `<p><strong>HCSS-Topics</strong>:</p>`,
    `<p><em>Note: because of the special (paying) nature of this topic, we cannot invite everybody to this. For everybody else, we will use the <a href="#">HCSS Landing Page</a>.</em></p>`,
  ].join("");
  const topicId = await createTopic(page, topicTitle, topicContent);

  // Phase 2: simulate a second-authored edit so sectionAttribution
  // shows at least two distinct timestamps. We can't switch users in
  // a single-tenant verifier, but a follow-up PATCH ~2s after POST
  // still proves the diff-and-stamp path works: the server runs
  // diffAndStampAttribution against the previous content and
  // re-stamps only the changed blocks with the new timestamp while
  // unchanged blocks keep their original stamp.
  await new Promise((r) => setTimeout(r, 2100));
  const modifiedContent = topicContent.replace(
    '<strong>Oneliner</strong>',
    '<strong>Oneliner (updated)</strong>'
  ).replace(
    '<strong>What is Rizzoma</strong>',
    '<strong>What is Rizzoma (revised)</strong>'
  );
  try {
    await patchTopic(page, topicId, { title: topicTitle, content: modifiedContent });
  } catch (e) {
    console.error('phase-2 PATCH failed:', e);
  }

  // Seed a few reply blips so the topic reads like a real thread
  await createBlip(page, topicId, null, "<p>First reply from the main thread — establishes the conversation baseline and gives the topic a lived-in density.</p>");
  const reply2 = await createBlip(page, topicId, null, "<p>Second reply — branches into a nested discussion about research design and evaluation criteria.</p>");
  await createBlip(page, topicId, reply2.id, "<p>Nested child under reply 2 — proves the indent rail renders for a second-level reply with real content, not just a test seed.</p>");
  await createBlip(page, topicId, null, "<p>Third reply — closes the loop on the research assignment and flags the next step for the team.</p>");

  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
  // Dispatch refresh-topics so the topics list picks up the freshly
  // seeded workspace topics (otherwise it shows cached rows from before
  // this run's seeding step).
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
  });
  await page.waitForTimeout(2500);

  // Full-viewport capture (NOT .wave-container cropped). Matches the
  // 1440x900 dimensions of the legacy rizzoma-blips-nested.png reference
  // so a side-by-side is fair.
  await page.screenshot({
    path: path.join(outDir, "current-realistic-topic.png"),
    fullPage: false,
  });
  fs.writeFileSync(path.join(outDir, "current-realistic-topic.html"), await page.content());

  // Also take a fullPage capture that scrolls to show the reply blips
  // below the topic body (the legacy reference fit everything in 900px
  // because it used denser typography + wider columns; our build needs
  // a scroll to see the whole thread at 900px).
  await page.screenshot({
    path: path.join(outDir, "current-realistic-topic-fullpage.png"),
    fullPage: true,
  });

  // Scroll down inside the wave container to bring reply blips into view,
  // then capture that state so we can judge the per-blip author column
  // alongside the topic body in a single 1440x900 frame.
  await page.evaluate(() => {
    const body = document.querySelector('.wave-container .topic-blip-body') ||
                 document.querySelector('.wave-container .rizzoma-topic-detail');
    if (body && body.scrollBy) {
      body.scrollBy(0, 400);
    } else {
      window.scrollBy(0, 400);
    }
  });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(outDir, "current-realistic-topic-scrolled.png"),
    fullPage: false,
  });

  // Copy the legacy reference next to it so the pair lives in one folder
  const legacyPath = path.resolve(__dirname, "..", "screenshots", "rizzoma-live", "feature", "rizzoma-core-features", "rizzoma-blips-nested.png");
  if (fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, path.join(outDir, "legacy-rizzoma-blips-nested.png"));
  }

  // Fetch the raw topic so we can include a sectionAttribution
  // breakdown in the audit — counts entries and distinct timestamps
  // to prove the Y.js-awareness-like per-block stamping path works.
  const topicRaw = await page.evaluate(async (topicId) => {
    const r = await fetch(`/api/topics/${encodeURIComponent(topicId)}`, { credentials: 'include' });
    return r.ok ? await r.json() : null;
  }, topicId);
  const attrEntries = topicRaw?.sectionAttribution ? Object.values(topicRaw.sectionAttribution) : [];
  const distinctTimestamps = new Set(attrEntries.map((e) => e.updatedAt)).size;
  const distinctAuthors = new Set(attrEntries.map((e) => e.authorId)).size;

  // DOM audit for the honest report
  const audit = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    navPanel: !!document.querySelector(".navigation-panel"),
    topicsList: !!document.querySelector(".rizzoma-topics-list"),
    topicsInList: document.querySelectorAll(".topics-container .search-result-item").length,
    waveContainer: !!document.querySelector(".wave-container"),
    rightToolsPanel: !!document.querySelector(".right-tools-panel"),
    topicCollabToolbar: !!document.querySelector(".topic-collab-toolbar"),
    totalBlipsRendered: document.querySelectorAll(".rizzoma-blip").length,
    blipAuthorDates: document.querySelectorAll(".blip-author-date").length,
    blipContributorsInfo: document.querySelectorAll(".blip-contributors-info").length,
    topicSectionWraps: document.querySelectorAll(".topic-section-wrapped").length,
    topicSectionAuthors: document.querySelectorAll(".topic-section-author").length,
    topicSectionAuthorAvatars: document.querySelectorAll(".topic-section-author-avatar").length,
    h1Count: document.querySelectorAll(".topic-content-view h1").length,
    ulCount: document.querySelectorAll(".topic-content-view ul").length,
    olCount: document.querySelectorAll(".topic-content-view ol").length,
    liCount: document.querySelectorAll(".topic-content-view li").length,
    linkCount: document.querySelectorAll(".topic-content-view a").length,
    strongCount: document.querySelectorAll(".topic-content-view strong").length,
  }));

  fs.writeFileSync(path.join(outDir, "audit.json"), JSON.stringify({
    topicId,
    base,
    capturedAt: new Date().toISOString(),
    audit,
    sectionAttribution: {
      entries: attrEntries.length,
      distinctTimestamps,
      distinctAuthors,
    },
  }, null, 2));
  console.log(JSON.stringify(audit, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
