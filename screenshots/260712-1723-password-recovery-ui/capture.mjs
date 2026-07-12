import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.RIZZOMA_CAPTURE_URL || 'http://127.0.0.1:4327';
const outputDir = new URL('.', import.meta.url).pathname;
const viewports = [
  { label: '1280', width: 1280, height: 900 },
  { label: '1366', width: 1366, height: 900 },
  { label: '1440', width: 1440, height: 900 },
  { label: '1600', width: 1600, height: 900 },
  { label: 'mobile-390', width: 390, height: 844 },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const manifest = [];

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/auth/oauth-status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ google: false, facebook: false, microsoft: false, twitter: false, saml: false }),
      });
      return;
    }
    if (pathname === '/api/auth/me') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unauthenticated' }),
    });
  });

  const token = 'v'.repeat(43);
  await page.goto(`${baseUrl}/?layout=rizzoma#/?passwordReset=${token}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Choose a new password' }).waitFor();
  const resetPath = `${outputDir}${viewport.label}-complete-reset.png`;
  await page.screenshot({ path: resetPath, fullPage: false });
  manifest.push({ viewport, surface: 'complete-reset', file: resetPath.split('/').pop(), consoleErrors: [...consoleErrors] });

  await context.clearCookies();
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${baseUrl}/?layout=rizzoma&capture=request-${viewport.label}#/`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByRole('heading', { name: 'Reset your password' }).waitFor();
  const requestPath = `${outputDir}${viewport.label}-request-reset.png`;
  await page.screenshot({ path: requestPath, fullPage: false });
  manifest.push({ viewport, surface: 'request-reset', file: requestPath.split('/').pop(), consoleErrors: [...consoleErrors] });
  await context.close();
}

await browser.close();
await writeFile(`${outputDir}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const errors = manifest.flatMap((entry) => entry.consoleErrors.map((error) => ({ file: entry.file, error })));
if (errors.length) {
  throw new Error(`Unexpected browser console errors: ${JSON.stringify(errors)}`);
}
