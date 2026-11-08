// Honest side-by-side capture. Takes a full-viewport screenshot of the
// rizzoma app (NOT cropped to .wave-container) so we can compare the
// ACTUAL rendered application chrome against original-rizzoma reference
// captures in screenshots/rizzoma-live/feature/rizzoma-core-features/.
//
// I've been cropping every verifier screenshot to .wave-container, which
// hides everything left and right of the wave content. This script takes
// the full viewport so we see:
//   - left navigation panel (topics list, navigation tabs)
//   - center wave content
//   - right tools panel (contributors, fold controls, insert shortcuts)
//   - top chrome (if any)
//
// The intent is NOT to pass any assertion — it's to give an honest read
// on how close the rendered app is to the original Rizzoma UI.

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

async function main() {
  const outDir = process.argv[2] || "screenshots/260413-full-page-parity";
  const base = process.argv[3] || "http://127.0.0.1:3000";
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  // Use the same viewport as the original reference captures (600x375
  // is what rizzoma-live/feature/ captures appear to be). But also take
  // a larger size so we can see the whole app.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page, base, "codex-live+1774803822194@example.com", "CodexLive!1");

  // Landing page after login
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, "01-landing-full.png"), fullPage: false });
  fs.writeFileSync(path.join(outDir, "01-landing-full.html"), await page.content());

  // Open a topic (pick the first one in the list if any)
  const firstTopic = page.locator(".topics-container .search-result-item").first();
  if (await firstTopic.count()) {
    await firstTopic.click();
    await page.waitForSelector(".wave-container .rizzoma-topic-detail", { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, "02-topic-full.png"), fullPage: false });
    fs.writeFileSync(path.join(outDir, "02-topic-full.html"), await page.content());
  }

  // Also take a fullPage screenshot of the topic
  if (await firstTopic.count()) {
    await page.screenshot({ path: path.join(outDir, "03-topic-fullpage.png"), fullPage: true });
  }

  // DOM introspection: what application-shell elements exist?
  const shell = await page.evaluate(() => ({
    navPanel: !!document.querySelector(".navigation-panel"),
    topicsList: !!document.querySelector(".rizzoma-topics-list"),
    topicsContainer: !!document.querySelector(".topics-container"),
    topicsCount: document.querySelectorAll(".topics-container .search-result-item").length,
    waveContainer: !!document.querySelector(".wave-container"),
    rightToolsPanel: !!document.querySelector(".right-tools-panel"),
    rizzomaLayout: !!document.querySelector(".rizzoma-layout"),
    topicCollabToolbar: !!document.querySelector(".topic-collab-toolbar"),
    collabParticipants: document.querySelectorAll(".collab-participants .participant-avatar").length,
    blipAuthorDates: document.querySelectorAll(".blip-author-date").length,
    blipContributorsStack: document.querySelectorAll(".blip-contributors-info").length,
    rizzomaBrandingLogo: !!document.querySelector(".rizzoma-logo, [class*='rizzoma-brand']"),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    bodyScrollWidth: document.body.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
  }));

  fs.writeFileSync(path.join(outDir, "shell-audit.json"), JSON.stringify(shell, null, 2));
  console.log(JSON.stringify(shell, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
