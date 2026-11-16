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

  const email = `test-child-edit-${Date.now()}@example.com`;
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
      body: JSON.stringify({ title: 'HCSS Rizzoma Business Topic', content: 'Root blip content here' })
    });
    return resp.json();
  });

  const topicId = topicData.topic?.id || topicData.id;
  console.log('Created topic:', topicId);

  // Navigate to topic
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(topicId)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  // Type something into write-reply-input and press Enter
  const writeReplyInput = page.locator('.write-reply-input').first();
  console.log('Typing into reply input...');
  await writeReplyInput.fill('This is a child reply blip to test editing.');
  await writeReplyInput.press('Enter');
  await page.waitForTimeout(2000);

  // Find child blip collapsed row and click it to expand
  const collapsedRow = page.locator('.blip-container.nested-blip .blip-collapsed-row, .blip-collapsed-row').first();
  console.log('Clicking collapsed row to expand blip...');
  await collapsedRow.click();
  await page.waitForTimeout(1500);

  // Save screenshot of expanded child blip in read mode
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/child_blip_expanded_read.png' });
  console.log('Saved screenshots/child_blip_expanded_read.png');

  // Now find the Edit button on the child blip
  const childEditBtn = page.locator('.blip-container.nested-blip .js-change-mode, .blip-container.nested-blip [data-testid="blip-menu-edit"]').first();
  console.log('Clicking edit on child blip...');
  await childEditBtn.click();
  await page.waitForTimeout(1500);

  // Save screenshot of child blip in edit mode
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/child_blip_edit.png' });
  console.log('Saved screenshots/child_blip_edit.png');

  await browser.close();
}

main().catch(console.error);
