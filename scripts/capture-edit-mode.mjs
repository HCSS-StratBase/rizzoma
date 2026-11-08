import { chromium } from 'playwright';

const baseUrl = 'https://138-201-62-161.nip.io';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1119, height: 817 },
    deviceScaleFactor: 1.5,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const email = `test-edit-${Date.now()}@example.com`;
  const password = 'Password123!';

  const authResult = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const register = await fetch('/api/auth/register', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password, name: 'Stephan De Spiegeleire' }),
    });
    if (register.ok) return { ok: true, method: 'register' };
    return { ok: false, status: register.status, text: await register.text() };
  }, { email, password });
  console.log('Auth result:', authResult);

  // Create a topic via API
  const topicData = await page.evaluate(async () => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch('/api/topics', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ title: 'HCSS Rizzoma Business Topic', content: 'Testing authentic blip edit parity' })
    });
    return resp.json();
  });

  const topicId = topicData.topic?.id || topicData.id;
  console.log('Created topic:', topicId);

  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(topicId)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  // Take screenshot in READ mode
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/topic_read_mode.png' });
  console.log('Saved screenshots/topic_read_mode.png');

  // Click the Edit button in the topic Wave Panel / BlipMenu
  const editBtn = page.locator('.wave-panel [data-testid="blip-menu-edit"], .wave-panel .js-change-mode').first();
  await editBtn.waitFor({ state: 'visible', timeout: 10000 });
  await editBtn.click();
  await page.waitForTimeout(1500);

  // Take screenshot in EDIT mode
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/topic_edit_mode.png' });
  console.log('Saved screenshots/topic_edit_mode.png');

  await browser.close();
}

main().catch(console.error);
