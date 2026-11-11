import { chromium } from 'playwright';

const baseUrl = 'https://138-201-62-161.nip.io/?layout=rizzoma';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1.5,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to', baseUrl);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Check if auth overlay is present
  const authOverlay = page.locator('.rizzoma-auth-overlay');
  if (await authOverlay.isVisible()) {
    console.log('Auth overlay visible, signing up new user...');
    await page.locator('.signup-link').click();
    await page.waitForTimeout(500);

    const testEmail = `stephan-${Date.now()}@example.com`;
    await page.locator('.login-form input[type="email"]').fill(testEmail);
    await page.locator('.login-form input[type="password"]').fill('Password123!');
    await page.locator('.login-form .submit-btn').click();
    console.log('Clicked Create Account for', testEmail);

    await page.waitForSelector('.rizzoma-layout, .rizzoma-topic-detail, .search-container', { timeout: 15000 });
    console.log('Successfully logged in and reached layout!');
  }

  // Create a new topic
  console.log('Creating a topic via UI or API...');
  const createTopicBtn = page.locator('button:has-text("New Topic"), .new-topic-btn, [data-action="new-topic"]');
  if (await createTopicBtn.isVisible()) {
    console.log('Clicking New Topic button...');
    await createTopicBtn.click();
  } else {
    // API creation
    console.log('Creating via API...');
    const result = await page.evaluate(async () => {
      const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
      const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
      const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
      const resp = await fetch('/api/topics', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          title: 'Parity Test Topic',
          content: '<p>Line 1 of strategic wave</p><p>Line 2 of tactical breakdown</p>'
        })
      });
      return resp.json();
    });
    console.log('API Result:', result);
    const id = result.topic?.id || result.id;
    await page.goto(`${baseUrl}#/topic/${id}`, { waitUntil: 'domcontentloaded' });
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/test_live_topic.png' });
  console.log('Saved /mnt/c/Rizzoma/screenshots/test_live_topic.png');

  await browser.close();
}

test().catch(console.error);
