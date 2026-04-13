// Captures the subblip drill-down view for parity comparison against
// screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blip-view.png
// (task #9).
//
// Flow:
//   1. Seed a realistic topic + reply tree with grandchildren
//   2. Navigate to the topic, click through to a deep subblip
//   3. Capture the subblip view at 1440x900 alongside the legacy ref
//   4. Audit the chrome (Hide button, breadcrumb, parent-context panel,
//      sibling nav, focus shell) to prove the structural elements match
//
// Usage:
//   node scripts/capture_subblip_view_parity.cjs <outDir> [baseUrl]

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForSelector('.rizzoma-layout', { timeout: 15000 });
}

async function apiReq(page, method, urlPath, body) {
  return await page.evaluate(
    async ({ method, url, payload }) => {
      const readCookie = (name) => {
        const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
        return match?.[1] ? decodeURIComponent(match[1]) : undefined;
      };
      await fetch('/api/auth/csrf', { credentials: 'include' });
      const token = readCookie('XSRF-TOKEN');
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-csrf-token': token } : {}),
        },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      });
      return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
    },
    { method, url: urlPath, payload: body },
  );
}

async function createTopic(page, title, content) {
  const r = await apiReq(page, 'POST', '/api/topics', { title, content });
  if (!r?.ok || !r?.data?.id) throw new Error(`createTopic failed: ${JSON.stringify(r)}`);
  return r.data.id;
}

async function createBlip(page, waveId, parentId, content) {
  const r = await apiReq(page, 'POST', '/api/blips', { waveId, parentId, content });
  if (!r?.ok || !r?.data) throw new Error(`createBlip failed: ${JSON.stringify(r)}`);
  return { id: r.data.id || r.data._id || r.data.blip?._id };
}

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || 'http://127.0.0.1:3000';
  if (!outDir) throw new Error('Usage: node scripts/capture_subblip_view_parity.cjs <outDir> [baseUrl]');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page, base, 'codex-live+1774803822194@example.com', 'CodexLive!1');

  // Seed a topic with rich content + a 3-level reply tree so the
  // subblip drill-down has a meaningful breadcrumb and parent-thread
  // preview. The topic content matches rizzoma-blip-view.png's nested
  // "First steps in Rizzoma" structure for a fair comparison.
  const topicTitle = 'HCSS Rizzoma Business Topic';
  const topicContent = [
    `<h1>${topicTitle}</h1>`,
    `<p>#MetaTopic</p>`,
    `<ul>`,
    `<li><p><strong>Oneliner</strong></p></li>`,
    `<li><p><strong>Relevant links</strong></p><ul><li><p>New to Rizzoma</p></li></ul></li>`,
    `<li><p><strong>What is Rizzoma</strong></p></li>`,
    `<li><p><strong>First steps in Rizzoma</strong></p>`,
    `<ol>`,
    `<li><p>Click the 'plus' sign at the end of this line and watch the <a href="#">1:17' introductory video</a></p></li>`,
    `<li><p>Make sure you read the one-liner, the research assignment of the project you have been assigned to and skim at least the main structure of the 'research design' section (and you may want to drill down into the sections that you will be working on)</p></li>`,
    `<li><p>The most useful button on Rizzoma is the green button on the top right of your pane here that says 'next'. That will light up in green whenever somebody posts sthg new in whatever topic your cursor is in.</p></li>`,
    `</ol></li>`,
    `</ul>`,
  ].join('');
  const topicId = await createTopic(page, topicTitle, topicContent);

  // Reply tree: root reply → mid reply → deep reply (3 levels)
  const rootReply = await createBlip(
    page,
    topicId,
    null,
    `<p>First steps discussion — the tutorial flow works well for new users but the 'next' button behavior on mobile needs a closer look before we ship.</p>`,
  );
  const midReply = await createBlip(
    page,
    topicId,
    rootReply.id,
    `<p>Agreed — the mobile 'next' button currently relies on a scroll listener that doesn't fire consistently on iOS Safari 17. Should we file this as a P1?</p>`,
  );
  const deepReply = await createBlip(
    page,
    topicId,
    midReply.id,
    `<p>P1 seems right. The regression only surfaces on iOS Safari 17 when pull-to-refresh is active. I can reproduce on iPhone 15 Pro running 17.2 — happy to drive the fix.</p>`,
  );
  // Add a couple of siblings under midReply so the sibling nav has
  // something to exercise.
  await createBlip(
    page,
    topicId,
    midReply.id,
    `<p>Seconded. I hit the same thing on my iPad Pro — the scroll listener never fires after a refresh gesture.</p>`,
  );
  await createBlip(
    page,
    topicId,
    midReply.id,
    `<p>Third voice — also reproducible on Chrome Android 122 but much less frequently. Ios Safari is the acute case.</p>`,
  );

  // Navigate to the subblip drill-down directly via the URL hash
  // pattern the router uses. RizzomaTopicDetail parses the blipPath
  // segment and populates currentSubblip.
  const blipPath = deepReply.id.split(':')[1] || deepReply.id;
  await page.goto(`${base}/#/topic/${topicId}/${blipPath}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const audit = await page.evaluate(() => ({
    navPanel: !!document.querySelector('.navigation-panel'),
    topicsList: !!document.querySelector('.rizzoma-topics-list'),
    rightToolsPanel: !!document.querySelector('.right-tools-panel'),
    subblipView: !!document.querySelector('.subblip-view'),
    subblipNavBar: !!document.querySelector('.subblip-nav-bar'),
    subblipHideBtn: !!document.querySelector('.subblip-hide-btn'),
    subblipBreadcrumb: !!document.querySelector('.subblip-breadcrumb'),
    subblipSiblingNav: !!document.querySelector('.subblip-sibling-nav'),
    subblipSiblingCounter: document.querySelector('.subblip-sibling-counter')?.textContent || null,
    subblipStage: !!document.querySelector('.subblip-stage'),
    subblipParentContext: !!document.querySelector('.subblip-parent-context'),
    subblipParentContextLabel: document.querySelector('.subblip-parent-context-label')?.textContent?.trim() || null,
    subblipFocusShell: !!document.querySelector('.subblip-focus-shell'),
    subblipFocusBlipCount: document.querySelectorAll('.subblip-focus-shell .rizzoma-blip').length,
    parentContextBlipRendered: !!document.querySelector('.subblip-parent-context .rizzoma-blip'),
    breadcrumbText: document.querySelector('.subblip-breadcrumb')?.textContent?.trim() || null,
  }));

  await page.screenshot({ path: path.join(outDir, 'current-subblip-view.png'), fullPage: false });
  fs.writeFileSync(path.join(outDir, 'current-subblip-view.html'), await page.content());

  // Copy the legacy reference so the pair lives in one folder
  const legacyPath = path.resolve(__dirname, '..', 'screenshots', 'rizzoma-live', 'feature', 'rizzoma-core-features', 'rizzoma-blip-view.png');
  if (fs.existsSync(legacyPath)) {
    fs.copyFileSync(legacyPath, path.join(outDir, 'legacy-rizzoma-blip-view.png'));
  }

  // Structural gates — the subblip view should carry the baseline
  // chrome: app shell, nav bar with Hide + breadcrumb, parent context
  // panel, focus shell. Sibling nav is task #35 territory and is only
  // surfaced when the current subblip has inline-anchored siblings
  // (not plain reply threads), so it's not a baseline gate here.
  const gates = {
    appShellOk: audit.navPanel && audit.topicsList && audit.rightToolsPanel,
    subblipViewMounted: audit.subblipView,
    breadcrumbPresent: audit.subblipNavBar && audit.subblipHideBtn && audit.subblipBreadcrumb,
    parentContextPresent: audit.subblipParentContext && audit.parentContextBlipRendered,
    focusShellPopulated: audit.subblipFocusShell && audit.subblipFocusBlipCount >= 1,
  };
  const allPass = Object.values(gates).every(Boolean);

  fs.writeFileSync(
    path.join(outDir, 'audit.json'),
    JSON.stringify({ topicId, rootReply: rootReply.id, midReply: midReply.id, deepReply: deepReply.id, audit, gates, result: allPass ? 'PASS' : 'FAIL' }, null, 2),
  );
  console.log(JSON.stringify({ audit, gates, result: allPass ? 'PASS' : 'FAIL' }, null, 2));
  if (!allPass) {
    console.error('GATE FAIL');
    process.exitCode = 2;
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
