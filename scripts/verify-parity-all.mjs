import { chromium } from 'playwright';

const baseUrl = 'https://138-201-62-161.nip.io';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    deviceScaleFactor: 1.5,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  const email = `test-verify-${Date.now()}@example.com`;
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

  // Create a topic with multi-line content
  const topicData = await page.evaluate(async () => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch('/api/topics', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        title: 'HCSS Strategic Deep Research Wave',
        content: '<p>First line of strategic analysis</p><p>Second line of strategic analysis</p>'
      })
    });
    return resp.json();
  });

  const topicId = topicData.topic?.id || topicData.id;
  console.log('Created topic:', topicId);

  // Navigate to topic
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(topicId)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  // Capture State 1: Initial View - root blip bulleted, child collapsed
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/1_topic_initial_read.png' });
  console.log('Saved 1_topic_initial_read.png');

  // Add child reply
  const writeReplyInput = page.locator('.write-reply-input').first();
  await writeReplyInput.fill('Detailed tactical reply blip with nested observations.');
  await writeReplyInput.press('Enter');
  await page.waitForTimeout(2000);

  // Capture State 2: Child blip starts hidden/collapsed by default
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/2_child_collapsed_default.png' });
  console.log('Saved 2_child_collapsed_default.png');

  // Click collapsed child to expand it
  const collapsedRow = page.locator('.child-blip-collapsed, .blip-collapsed-row').first();
  await collapsedRow.click();
  await page.waitForTimeout(1500);

  // Capture State 3: Child blip expanded in read mode - shows read-only bar, single bullet, no double dots!
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/3_child_expanded_read_mode.png' });
  console.log('Saved 3_child_expanded_read_mode.png');

  // Click Edit button or blip text to enter edit mode
  const editBtn = page.locator('[data-testid="blip-menu-edit"], .edit-btn').first();
  if (await editBtn.isVisible()) {
    console.log('Clicking Edit button to enter edit mode...');
    await editBtn.click();
    await page.waitForTimeout(1500);
  } else {
    console.log('Clicking on blip text to trigger click-to-edit...');
    const childBlipText = page.locator('.blip-container.nested-blip .blip-text, .blip-container.expanded .blip-text, .topic-blip-content').first();
    await childBlipText.click();
    await page.waitForTimeout(1500);
  }

  // Capture State 4: Child blip in edit mode - reveals full NEW editing bar with emoji!
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/4_child_edit_mode_full_toolbar.png' });
  console.log('Saved 4_child_edit_mode_full_toolbar.png');

  // Now click the Emoji button on the edit toolbar to verify emoji picker
  const emojiBtn = page.locator('[data-testid="blip-menu-emoji"], .menu-btn:has-text("😀")').first();
  if (await emojiBtn.isVisible()) {
    console.log('Clicking emoji picker button...');
    await emojiBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/5_emoji_picker_open.png' });
    console.log('Saved 5_emoji_picker_open.png');
    // Close emoji picker
    await emojiBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Done on child blip
  const doneBtn = page.locator('.blip-container.nested-blip [data-testid="blip-menu-done"], .blip-container.nested-blip .done-btn').first();
  if (await doneBtn.isVisible()) {
    await doneBtn.click();
    await page.waitForTimeout(1000);
  }

  // Now test text selection Range Menu: select text in the root topic
  console.log('Selecting text in root blip to verify Range Menu...');
  const firstP = page.locator('.topic-blip-content li, .topic-content-view li').first();
  if (await firstP.isVisible()) {
    const box = await firstP.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 120, box.y + box.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/6_range_menu_selection.png' });
      console.log('Saved 6_range_menu_selection.png');
    }
  }

  await browser.close();
  console.log('Verification finished successfully!');
}

main().catch(console.error);
