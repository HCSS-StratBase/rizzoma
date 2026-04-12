const { chromium } = require('playwright');
const fs = require('fs');

async function login(page, base, email, password) {
  console.log(`[debug] goto login ${base}`);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  console.log('[debug] fill login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  console.log('[debug] submitted login');
  await page.waitForTimeout(5000);
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
    const data = await response.json();
    return data.id;
  }, title);
}

async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:4184';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  const email = 'codex-live+1774803822194@example.com';
  const password = 'CodexLive!1';
  const patchBodies = [];
  const patchResponses = [];
  const mutationTraffic = [];

  await page.route('**/api/topics/**', async (route) => {
    const request = route.request();
    if (request.method() === 'PATCH') {
      patchBodies.push({
        url: request.url(),
        body: request.postData() || null,
      });
    }
    await route.continue();
  });

  await page.route('**/api/blips/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      mutationTraffic.push({
        kind: 'request',
        url: request.url(),
        method: request.method(),
        body: request.postData() || null,
      });
    }
    await route.continue();
  });

  await page.route('**/api/editor/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      mutationTraffic.push({
        kind: 'request',
        url: request.url(),
        method: request.method(),
        body: request.postData() || null,
      });
    }
    await route.continue();
  });

  page.on('response', async (response) => {
    const request = response.request();
    if (request.method() !== 'PATCH' && request.method() !== 'PUT' && request.method() !== 'POST') return;
    const url = request.url();
    let body = null;
    try {
      body = await response.text();
    } catch {
      body = null;
    }
    if (url.includes('/api/topics/')) {
      patchResponses.push({
        url: response.url(),
        status: response.status(),
        ok: response.ok(),
        body,
      });
      return;
    }
    if (url.includes('/api/blips/') || url.includes('/api/editor/')) {
      mutationTraffic.push({
        kind: 'response',
        url: response.url(),
        method: request.method(),
        status: response.status(),
        ok: response.ok(),
        body,
      });
    }
  });

  console.log(`[debug] start base=${base}`);
  await login(page, base, email, password);
  console.log('[debug] creating topic');
  const topicId = await createTopic(page, `Planner persistence debug ${Date.now()}`);
  console.log(`[debug] topicId=${topicId}`);
  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  console.log('[debug] waiting for topic shell');
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await page.waitForTimeout(1200);

  console.log('[debug] open topic edit');
  await page.locator('.topic-blip-toolbar .topic-tb-btn', { hasText: 'Edit' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.topic-content-edit .ProseMirror').first().click();
  await page.waitForTimeout(250);
  console.log('[debug] open gadget palette');
  await page.locator('.right-tools-panel .insert-btn.gadget-btn').first().click();
  await page.waitForSelector('.gadget-palette', { timeout: 8000 });
  await page.locator('.gadget-tile', { hasText: 'Planner' }).first().click();
  console.log('[debug] planner inserted');

  const iframeHandle = await page.locator('.topic-content-edit .gadget-node-view iframe').first().elementHandle();
  const frame = await iframeHandle?.contentFrame();
  if (!frame) throw new Error('Planner iframe unavailable');

  console.log('[debug] waiting for planner iframe');
  await frame.waitForSelector('.app-shell', { timeout: 8000 });
  await frame.locator('#delay-milestone').click();
  await frame.waitForSelector('text=Ship preview (delayed)', { timeout: 8000 });
  console.log('[debug] planner delayed milestone applied');
  await page.waitForTimeout(1200);
  const liveDebug = await page.evaluate(() => {
    const nodeView = document.querySelector('.topic-content-edit .app-frame-live-state[data-app-instance-id]');
    const iframe = nodeView ? nodeView.querySelector('iframe') : null;
    const iframeState = iframe && iframe.contentWindow ? iframe.contentWindow.__RIZZOMA_APP_STATE ?? null : null;
    const proseMirror = document.querySelector('.topic-content-edit .ProseMirror');
    return {
      instanceId: nodeView ? nodeView.getAttribute('data-app-instance-id') : null,
      liveData: nodeView ? nodeView.getAttribute('data-app-live-data') : null,
      summary: nodeView && nodeView.querySelector('[data-app-summary]') ? nodeView.querySelector('[data-app-summary]').textContent : null,
      iframeState,
      proseMirrorHtml: proseMirror ? proseMirror.innerHTML : null,
    };
  });
  fs.writeFileSync(
    'screenshots/260330-app-runtime/live-topic-planner-debug-live-state.json',
    JSON.stringify(liveDebug, null, 2)
  );

  await page.locator('.wave-container').screenshot({
    path: 'screenshots/260330-app-runtime/live-topic-planner-debug-before-done.png',
  });

  console.log('[debug] click Done');
  await page.locator('.topic-blip-toolbar .topic-tb-btn', { hasText: 'Done' }).first().click();
  await page.waitForTimeout(2500);
  console.log('[debug] collecting final artifacts');

  await page.locator('.wave-container').screenshot({
    path: 'screenshots/260330-app-runtime/live-topic-planner-debug-after-done.png',
  });
  fs.writeFileSync(
    'screenshots/260330-app-runtime/live-topic-planner-debug-after-done.html',
    await page.content()
  );
  const finishDebug = await page.evaluate(() => {
    if (window.__RIZZOMA_LAST_FINISH_DEBUG) return window.__RIZZOMA_LAST_FINISH_DEBUG;
    try {
      const raw = window.sessionStorage.getItem('__RIZZOMA_LAST_FINISH_DEBUG');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  fs.writeFileSync(
    'screenshots/260330-app-runtime/live-topic-planner-debug-finish-debug.json',
    JSON.stringify(finishDebug, null, 2)
  );
  fs.writeFileSync(
    'screenshots/260330-app-runtime/live-topic-planner-debug-patch-body.json',
    JSON.stringify(patchBodies, null, 2)
  );
  fs.writeFileSync(
    'screenshots/260330-app-runtime/live-topic-planner-debug-patch-response.json',
    JSON.stringify(patchResponses, null, 2)
  );
  fs.writeFileSync(
    'screenshots/260330-app-runtime/live-topic-planner-debug-mutation-traffic.json',
    JSON.stringify(mutationTraffic, null, 2)
  );
  const savedTopic = await page.evaluate(async (id) => {
    const response = await fetch(`/api/topics/${encodeURIComponent(id)}`, {
      credentials: 'include',
    });
    return response.json();
  }, topicId);
  fs.writeFileSync(
    'screenshots/260330-app-runtime/live-topic-planner-debug-saved-topic.json',
    JSON.stringify(savedTopic, null, 2)
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
