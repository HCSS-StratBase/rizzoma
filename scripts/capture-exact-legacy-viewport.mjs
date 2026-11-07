import { chromium } from 'playwright';

const APP_URL = 'https://138-201-62-161.nip.io';
const outPath = '/mnt/c/Rizzoma/screenshots/exact_legacy_viewport.png';
const email = `visual-parity+${Date.now()}@example.com`;
const password = 'Password123!';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1119, height: 817 },
    deviceScaleFactor: 1.5,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

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
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 20000 });

  // Create realistic topic to match legacy screenshot
  const topicData = await page.evaluate(async () => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const token = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': token };

    const topicRes = await fetch('/api/topics', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        title: 'HCSS Rizzoma Business Topic',
        content: '<h1 class="topic-title">HCSS Rizzoma Business Topic</h1>',
      }),
    });
    const topic = await topicRes.json();

    // Create 3 blips: Oneliner, Relevant links, Description
    for (const title of ['Oneliner', 'Relevant links', 'Description']) {
      await fetch('/api/blips', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          waveId: topic.id,
          parentId: null,
          content: `<p><b>${title}</b></p><p>Detailed content for ${title} section.</p>`,
        }),
      });
    }

    return topic;
  });

  console.log('Created topic:', topicData.id);

  // Navigate to topic
  await page.goto(`${APP_URL}/#/topic/${topicData.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topic-blip-content, .rizzoma-topic-detail', { timeout: 15000 });
  await page.waitForTimeout(2500);

  // Capture screenshot at exact DPR 1.5
  await page.screenshot({ path: outPath });
  console.log(`Saved exact legacy viewport screenshot to ${outPath}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
