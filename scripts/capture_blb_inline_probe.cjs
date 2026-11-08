const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForTimeout(1500);
}

async function readCookie(page, name) {
  return page.evaluate((cookieName) => {
    const escaped = cookieName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match && match[1] ? decodeURIComponent(match[1]) : undefined;
  }, name);
}

async function ensureCsrf(page) {
  await page.evaluate(async () => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
  });
  return readCookie(page, 'XSRF-TOKEN');
}

async function createTopic(page, title, content, csrfToken) {
  return page.evaluate(async ({ topicTitle, topicContent, token }) => {
    const response = await fetch('/api/topics', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: JSON.stringify({ title: topicTitle, content: topicContent }),
    });
    return response.json();
  }, { topicTitle: title, topicContent: content, token: csrfToken });
}

async function createBlip(page, payload, csrfToken) {
  return page.evaluate(async ({ body, token }) => {
    const response = await fetch('/api/blips', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: JSON.stringify(body),
    });
    return response.json();
  }, { body: payload, token: csrfToken });
}

async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:4196';
  const outDir = process.argv[3] || 'screenshots/260331-blb-inline';

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });

  await login(page, base, 'codex-live+1774803822194@example.com', 'CodexLive!1');
  const csrfToken = await ensureCsrf(page);

  const topicTitle = `BLB Inline Probe ${Date.now()}`;
  const topicContent = [
    '<p>Alpha root topic copy for the first inline thread expansion and follow-up content.</p>',
    '<p>Second paragraph keeps the root surface dense and should remain readable after expansion.</p>',
  ].join('');

  const topic = await createTopic(page, topicTitle, topicContent, csrfToken);
  if (!topic?.id) {
    throw new Error(`topic create failed: ${JSON.stringify(topic)}`);
  }

  const rootInline = await createBlip(page, {
    waveId: topic.id,
    parentId: null,
    anchorPosition: 6,
    content: '<p>Inline child thread content with its own nested thread marker target in the middle.</p>',
  }, csrfToken);
  const rootInlineId = rootInline?.id || rootInline?.blip?.id || rootInline?.blip?._id;
  if (!rootInlineId) {
    throw new Error(`root inline blip create failed: ${JSON.stringify(rootInline)}`);
  }

  const nestedInline = await createBlip(page, {
    waveId: topic.id,
    parentId: rootInlineId,
    anchorPosition: 18,
    content: '<p>Nested inline child for BLB parity verification.</p>',
  }, csrfToken);
  const nestedInlineId = nestedInline?.id || nestedInline?.blip?.id || nestedInline?.blip?._id;
  if (!nestedInlineId) {
    throw new Error(`nested inline blip create failed: ${JSON.stringify(nestedInline)}`);
  }

  await page.goto(`${base}/#/topic/${topic.id}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await page.waitForTimeout(1800);

  const markers = page.locator('.wave-container .blip-thread-marker');
  await markers.first().click();
  await page.waitForTimeout(800);

  const nestedMarkers = page.locator('.wave-container .inline-child-expanded .blip-thread-marker');
  await nestedMarkers.first().click();
  await page.waitForTimeout(800);

  const shotPath = path.join(outDir, 'blb-inline-probe-v1.png');
  const htmlPath = path.join(outDir, 'blb-inline-probe-v1.html');
  await page.locator('.wave-container').screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());

  console.log(JSON.stringify({ id: topic.id, rootInlineId, nestedInlineId, shotPath, htmlPath }));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
