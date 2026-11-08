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

async function createTopic(page, title) {
  return page.evaluate(async (topicTitle) => {
    const readCookie = (name) => {
      const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
      if (!match) return undefined;
      return match[1] ? decodeURIComponent(match[1]) : undefined;
    };

    await fetch('/api/auth/csrf', { credentials: 'include' });
    const token = readCookie('XSRF-TOKEN');
    const response = await fetch('/api/topics', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: JSON.stringify({ title: topicTitle, content: '<p></p>' }),
    });
    const data = await response.json().catch(() => null);
    return data?.id || null;
  }, title);
}

async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:4193';
  const debugDir = path.join(process.cwd(), 'screenshots', '260330-app-runtime');
  fs.mkdirSync(debugDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const email = 'codex-live+1774803822194@example.com';
  const password = 'CodexLive!1';
  const logs = [];

  page.on('console', (msg) => {
    logs.push({ type: 'console', level: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (error) => {
    logs.push({ type: 'pageerror', text: String(error) });
  });

  await login(page, base, email, password);
  const topicId = await createTopic(page, `Planner probe ${Date.now()}`);
  if (!topicId) {
    throw new Error('Failed to create probe topic');
  }
  console.log('TOPIC_ID', topicId);

  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await page.waitForTimeout(1200);
  const editButton = page.locator('.topic-blip-toolbar .topic-tb-btn', { hasText: 'Edit' }).first();
  try {
    await editButton.click({ timeout: 30000 });
  } catch (error) {
    const debug = {
      url: page.url(),
      title: await page.title(),
      markers: await page.evaluate(() => ({
        hasTopicDetail: !!document.querySelector('.rizzoma-topic-detail'),
        hasTopicToolbar: !!document.querySelector('.topic-blip-toolbar'),
        toolbarText: document.querySelector('.topic-blip-toolbar')?.textContent || null,
        hasAuthEmail: !!document.querySelector('input[type="email"]'),
        bodyPreview: document.body.innerText.slice(0, 1200),
      })),
    };
    const debugPath = path.join(debugDir, 'probe-live-planner-toolbar-failure.json');
    const htmlPath = path.join(debugDir, 'probe-live-planner-toolbar-failure.html');
    fs.writeFileSync(debugPath, JSON.stringify({ ...debug, logs }, null, 2));
    fs.writeFileSync(htmlPath, await page.content());
    throw error;
  }
  await page.waitForTimeout(600);
  await page.locator('.topic-content-edit .ProseMirror').first().click();
  await page.waitForTimeout(250);
  await page.locator('.right-tools-panel .insert-btn.gadget-btn').first().click();
  await page.waitForSelector('.gadget-palette', { timeout: 8000 });
  await page.locator('.gadget-tile', { hasText: 'Planner' }).first().click();
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    const iframe = document.querySelector('.topic-content-edit .gadget-node-view iframe');
    if (!iframe) {
      return { found: false };
    }
    return {
      found: true,
      src: iframe.getAttribute('src'),
      outer: iframe.outerHTML,
      rect: iframe.getBoundingClientRect().toJSON(),
    };
  });

  console.log(JSON.stringify(info, null, 2));
  const handle = await page.locator('.topic-content-edit .gadget-node-view iframe').first().elementHandle();
  if (!handle) {
    await browser.close();
    return;
  }
  const frame = await handle.contentFrame();
  if (!frame) {
    console.log('NO_CONTENT_FRAME');
    await browser.close();
    return;
  }
  console.log('FRAME_URL', frame.url());
  console.log('FRAME_BODY', await frame.evaluate(() => document.body.innerHTML.slice(0, 2000)));

  await frame.getByRole('button', { name: 'Delay final milestone', exact: true }).click();
  await frame.waitForSelector('text=Ship preview (delayed)', { timeout: 12000 });
  await page.waitForTimeout(1200);
  await page.locator('.topic-blip-toolbar .topic-tb-btn', { hasText: 'Done' }).first().click();
  await page.waitForTimeout(2500);
  const postDoneInfo = await page.evaluate(() => {
    const topicView = document.querySelector('.topic-content-view');
    const iframe = document.querySelector('figure[data-gadget-type="app-frame"][data-app-id="calendar-planner"] iframe');
    return {
      topicViewHtml: topicView ? topicView.innerHTML.slice(0, 4000) : null,
      hasIframe: !!iframe,
      iframeOuter: iframe ? iframe.outerHTML : null,
    };
  });
  let postDoneFrameBody = null;
  const savedFrameHandle = await page.locator('figure[data-gadget-type="app-frame"][data-app-id="calendar-planner"] iframe').first().elementHandle();
  const savedFrame = await savedFrameHandle?.contentFrame();
  if (savedFrame) {
    postDoneFrameBody = await savedFrame.evaluate(() => ({
      body: document.body.innerHTML.slice(0, 3000),
      appState: window.__RIZZOMA_APP_STATE ?? null,
      frameTag: window.frameElement?.outerHTML?.slice(0, 500) ?? null,
      figureData: window.frameElement?.closest?.('figure[data-gadget-type="app-frame"]')?.getAttribute?.('data-app-data') ?? null,
      liveData: window.frameElement?.closest?.('.app-frame-live-state')?.getAttribute?.('data-app-live-data') ?? null,
    }));
  }
  const persistedTopic = await page.evaluate(async (id) => {
    const response = await fetch(`/api/topics/${encodeURIComponent(id)}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const data = await response.json().catch(() => null);
    return { ok: true, data };
  }, topicId);
  console.log('POST_DONE', JSON.stringify(postDoneInfo, null, 2));
  console.log('POST_DONE_FRAME', JSON.stringify(postDoneFrameBody, null, 2));
  console.log('PERSISTED_TOPIC', JSON.stringify(persistedTopic, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
