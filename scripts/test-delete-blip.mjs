import { chromium } from 'playwright';

const baseUrl = 'https://138-201-62-161.nip.io/?layout=rizzoma';

async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return;
    } catch (err) {
      if (i === 2) throw err;
      console.log(`Goto failed (${err.message}), retrying...`);
      await page.waitForTimeout(1000);
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor: 1.5,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  page.on('requestfailed', req => console.log('REQ FAILED:', req.url(), req.failure()?.errorText));
  page.on('response', resp => {
    if (resp.status() >= 400) {
      console.log('HTTP ERROR:', resp.status(), resp.url());
    }
  });
  // Auto-accept window.confirm
  page.on('dialog', async dialog => {
    console.log('DIALOG DETECTED:', dialog.type(), dialog.message());
    await dialog.accept();
    console.log('DIALOG ACCEPTED');
  });

  await safeGoto(page, baseUrl);
  await page.waitForTimeout(2000);

  const authOverlay = page.locator('.rizzoma-auth-overlay');
  if (await authOverlay.isVisible()) {
    console.log('Signing up user...');
    await page.locator('.signup-link').click();
    await page.waitForTimeout(500);

    const testEmail = `stephan-del-${Date.now()}@example.com`;
    await page.locator('.login-form input[type="email"]').fill(testEmail);
    await page.locator('.login-form input[type="password"]').fill('Password123!');
    await page.locator('.login-form .submit-btn').click();
    console.log('Signed up:', testEmail);
    await page.waitForTimeout(2000);
  }

  // Create topic
  console.log('Creating topic via API...');
  const topicData = await page.evaluate(async () => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch('/api/topics', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        title: 'Delete Blip Test Wave',
        content: '<p>Topic root content for delete testing</p>'
      })
    });
    return resp.json();
  });

  const topicId = topicData.topic?.id || topicData.id;
  console.log('Created topic ID:', topicId);

  // Add child reply blip via API
  console.log('Adding child reply blip via API...');
  const childBlipData = await page.evaluate(async ({ topicId }) => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch('/api/blips', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        waveId: topicId,
        content: '<p>Child blip to be deleted</p>',
        isFoldedByDefault: true
      })
    });
    return resp.json();
  }, { topicId });

  console.log('Child blip created:', JSON.stringify(childBlipData));
  const childBlipId = childBlipData.blip?.id || childBlipData.id;

  // Navigate to topic
  await safeGoto(page, `${baseUrl}#/topic/${encodeURIComponent(topicId)}`);
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/del_step1_initial.png' });

  // Find collapsed row and click to expand
  console.log('Clicking to expand child blip...');
  const collapsedRow = page.locator('.child-blip-collapsed, .blip-collapsed-row, [data-testid="blip-label-child"]').first();
  await collapsedRow.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/del_step2_expanded.png' });

  // Check if delete button exists in toolbar
  const delBtn = page.locator('.delete-blip, [data-testid="blip-menu-delete"], button[title="Delete comment"]').first();
  const delVisible = await delBtn.isVisible();
  console.log('Delete button visible:', delVisible);

  if (!delVisible) {
    // Check overflow menu
    console.log('Checking overflow gear menu...');
    const gearBtn = page.locator('.gearwheel, .gear-button, [data-testid="blip-menu-overflow"]').first();
    if (await gearBtn.isVisible()) {
      await gearBtn.click();
      await page.waitForTimeout(500);
      const overflowDel = page.locator('[data-testid="blip-menu-delete"], button:has-text("Delete")').first();
      console.log('Overflow delete button visible:', await overflowDel.isVisible());
    }
  }

  // Click delete button
  console.log('Clicking delete button...');
  await delBtn.click();
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/del_step3_after_click.png' });

  // Now test DELETE API directly as current authenticated session
  console.log('Testing direct DELETE API call for child blip...');
  const delResult = await page.evaluate(async ({ childBlipId }) => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch(`/api/blips/${encodeURIComponent(childBlipId)}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });
    return { status: resp.status, body: await resp.text() };
  }, { childBlipId });
  console.log('Direct DELETE API result:', JSON.stringify(delResult));

  await browser.close();
  console.log('Test finished.');
}

main().catch(console.error);
