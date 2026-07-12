import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const outputDir = process.env.AUTH_UI_SNAPSHOT_DIR || 'screenshots/260712-1348-offline-auth-isolation';
const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:4312';
const viewports = [
  { width: 1280, height: 900 },
  { width: 1366, height: 900 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
];
const consoleMessages = [];
const expectedConsoleMessages = [];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function captureState({ width, height, authenticated, state }) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const entry = { width, state, text: message.text() };
      if (!authenticated && message.text().includes('401 (Unauthorized)')) {
        expectedConsoleMessages.push(entry);
      } else {
        consoleMessages.push(entry);
      }
    }
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/auth/me') {
      if (authenticated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'alice-ui', name: 'Alice Example', email: 'alice@example.com' }),
        });
      } else {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthenticated' }) });
      }
      return;
    }
    if (path === '/api/auth/oauth-status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ google: true, facebook: false, microsoft: false, twitter: false, saml: false }),
      });
      return;
    }
    if (path === '/api/topics') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ topics: [], hasMore: false }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'networkidle' });
  await page.locator('.rizzoma-layout').waitFor({ state: 'visible' });

  if (state === 'offline') {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await page.locator('.offline-readonly-banner').waitFor({ state: 'visible' });
  }

  if (state === 'signin') {
    const signInSelector = width <= 768
      ? '.mobile-shell-auth-dock .shell-auth-sign-in'
      : '.right-tools-panel .shell-auth-sign-in';
    await page.locator(signInSelector).click();
    await page.locator('[role="dialog"]').waitFor({ state: 'visible' });
  }

  await page.screenshot({
    path: `${outputDir}/${state}-${width}x${height}.png`,
    fullPage: false,
  });
  await context.close();
}

for (const viewport of viewports) {
  await captureState({ ...viewport, authenticated: false, state: 'guest' });
  await captureState({ ...viewport, authenticated: false, state: 'signin' });
  await captureState({ ...viewport, authenticated: true, state: 'signed' });
  await captureState({ ...viewport, authenticated: true, state: 'offline' });
}

await browser.close();
await writeFile(
  `${outputDir}/browser-console-errors.json`,
  `${JSON.stringify(consoleMessages, null, 2)}\n`,
  'utf8',
);
await writeFile(
  `${outputDir}/browser-console-expected.json`,
  `${JSON.stringify(expectedConsoleMessages, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify({
  outputDir,
  screenshots: viewports.length * 4,
  consoleErrors: consoleMessages.length,
  expectedGuest401Messages: expectedConsoleMessages.length,
}));
