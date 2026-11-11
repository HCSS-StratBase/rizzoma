import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const APP_URL = 'https://138-201-62-161.nip.io';
const outDir = '/mnt/c/Rizzoma/screenshots/surface4-validation';
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1119, height: 817 },
    deviceScaleFactor: 1.0,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const email = `visual-parity+${Date.now()}@example.com`;
  const password = 'Password123!';
  console.log(`Authenticating ${email}...`);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  const authRes = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    const register = await fetch('/api/auth/register', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password, name: 'Stephan Parity' }),
    });
    if (register.ok) return { ok: true, method: 'register' };
    const login = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    return { ok: login.ok, status: login.status };
  }, { email, password });

  console.log('Auth result:', authRes);

  // Mark b1, b2, b3 as read for this user so b1-b3 are grey (#b3b3b3) and b4-b5 are green (#95d529) matching legacy-240.png
  await page.evaluate(async (waveId) => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    await fetch(`/api/waves/${waveId}/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      credentials: 'include',
      body: JSON.stringify({
        blipIds: [`${waveId}:b1`, `${waveId}:b2`, `${waveId}:b3`],
      }),
    });
  }, '917d750213736e02a665422fca066d53');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 20000 });
  console.log('Rizzoma layout loaded.');

  // Navigate to target topic using hash
  console.log('Navigating to topic...');
  await page.goto(`${APP_URL}/#/topic/917d750213736e02a665422fca066d53`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.topic-blip-content', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // 1. Capture full viewport (collapsed state)
  await page.screenshot({ path: path.join(outDir, 'surface4_collapsed_full.png') });
  console.log('Saved surface4_collapsed_full.png');

  // Root blip content screenshot
  const rootBlipContent = page.locator('.topic-meta-blip .topic-blip-content').first();
  if (await rootBlipContent.count() > 0) {
    await rootBlipContent.screenshot({ path: path.join(outDir, 'surface4_collapsed_crop.png') });
    console.log('Saved surface4_collapsed_crop.png');
  }

  // 2. Click the 4th marker ('Research design' or 1st marker 'Oneliner') to expand it!
  const markers = page.locator('.blip-thread-marker');
  const count = await markers.count();
  console.log(`Found ${count} blip-thread-marker elements`);

  if (count > 0) {
    console.log('Clicking first marker to expand...');
    await markers.first().click();
    await page.waitForTimeout(1500);

    const childDetails = await page.evaluate(() => {
      const card = document.querySelector('.inline-child-expanded');
      if (!card) return 'No card';
      const info = card.querySelector('.blip-contributors-info');
      return {
        cardClass: card.className,
        infoHTML: info ? info.outerHTML : null,
        infoFlex: info ? window.getComputedStyle(info).flexDirection : null,
        dateBox: card.querySelector('.blip-author-date')?.getBoundingClientRect(),
        avatarBox: card.querySelector('.blip-contributor-avatar')?.getBoundingClientRect(),
      };
    });
    console.log('Child details:', JSON.stringify(childDetails, null, 2));

    // Capture expanded state
    await page.screenshot({ path: path.join(outDir, 'surface4_expanded_full.png') });
    console.log('Saved surface4_expanded_full.png');

    if (await rootBlipContent.count() > 0) {
      await rootBlipContent.screenshot({ path: path.join(outDir, 'surface4_expanded_crop.png') });
      console.log('Saved surface4_expanded_crop.png');
    }
  }

  await browser.close();
  console.log('Done captures successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
