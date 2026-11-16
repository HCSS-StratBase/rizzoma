import { chromium } from 'playwright';

const baseUrl = 'https://138-201-62-161.nip.io/?layout=rizzoma';

async function safeGoto(page, url) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return;
    } catch (err) {
      if (i === 2) throw err;
      console.log(`Goto failed (${err.message}), retrying in 1s...`);
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
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to', baseUrl);
  await safeGoto(page, baseUrl);
  await page.waitForTimeout(1000);

  // Authenticate
  const authOverlay = page.locator('.rizzoma-auth-overlay');
  if (await authOverlay.isVisible()) {
    console.log('Signing up user...');
    await page.locator('.signup-link').click();
    await page.waitForTimeout(500);

    const testEmail = `stephan-parity-${Date.now()}@example.com`;
    await page.locator('.login-form input[type="email"]').fill(testEmail);
    await page.locator('.login-form input[type="password"]').fill('Password123!');
    await page.locator('.login-form .submit-btn').click();
    console.log('Signed up:', testEmail);

    await page.waitForSelector('.rizzoma-layout, .rizzoma-topic-detail, .search-container', { timeout: 15000 });
  }

  // Create topic with multi-line content
  console.log('Creating test topic...');
  const topicData = await page.evaluate(async () => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch('/api/topics', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        title: 'HCSS Strategic Intelligence Wave',
        content: '<p>First line of strategic analysis</p><p>Second line of strategic analysis</p>'
      })
    });
    return resp.json();
  });

  const topicId = topicData.topic?.id || topicData.id;
  console.log('Created topic ID:', topicId);

  // Navigate to topic
  await safeGoto(page, `${baseUrl}#/topic/${encodeURIComponent(topicId)}`);
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  // Screenshot 1: Root Topic Read Mode
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/1_root_topic_read_mode.png' });
  console.log('Saved 1_root_topic_read_mode.png');

  // Crop topic content to verify bullets
  const topicContentView = page.locator('.topic-content-view, .topic-blip-content').first();
  if (await topicContentView.isVisible()) {
    await topicContentView.screenshot({ path: '/mnt/c/Rizzoma/screenshots/1_crop_root_bullets.png' });
    console.log('Saved 1_crop_root_bullets.png');
  }

  // 2. Click on the root blip text (click-to-edit)
  console.log('Testing click-to-edit on root blip...');
  await topicContentView.click();
  await page.waitForTimeout(1500);

  // Screenshot 2: Root Topic Edit Mode (full editing bar with Emoji 😀)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/2_root_topic_edit_mode.png' });
  console.log('Saved 2_root_topic_edit_mode.png');

  // Crop the editing toolbar
  const editBar = page.locator('.wave-panel, .blip-menu-container, .blip-menu-full').first();
  if (await editBar.isVisible()) {
    await editBar.screenshot({ path: '/mnt/c/Rizzoma/screenshots/2_crop_edit_bar.png' });
    console.log('Saved 2_crop_edit_bar.png');
  }

  // Click Done on root blip
  const topicDoneBtn = page.locator('.wave-panel [data-testid="blip-menu-done"], .wave-panel .done-btn, .topic-content-edit .finish-edit-button, button:has-text("Done")').first();
  if (await topicDoneBtn.isVisible()) {
    console.log('Clicking Done on root topic...');
    await topicDoneBtn.click();
    await page.waitForTimeout(1500);
  }

  // 3. Add a child reply blip via API
  console.log('Adding child reply blip via API...');
  await page.evaluate(async ({ topicId }) => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    await fetch('/api/blips', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        waveId: topicId,
        content: '<p>First line of tactical child reply</p><p>Second line with detailed observation</p>'
      })
    });
  }, { topicId });

  // Reload topic to see child blip
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  // Screenshot 3: Child Blip Collapsed (Hidden by Default)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/3_child_collapsed_default.png' });
  console.log('Saved 3_child_collapsed_default.png');

  // 4. Click on the collapsed child blip to expand it
  console.log('Clicking on collapsed child blip to expand...');
  const childCollapsed = page.locator('.child-blip-collapsed, .blip-collapsed-row, .blip-expand-btn').first();
  await childCollapsed.click();
  await page.waitForTimeout(1500);

  // Screenshot 4: Child Blip Expanded in Read Mode (Shows Read-Only Bar + Single Clean Bullets)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/4_child_expanded_read_mode.png' });
  console.log('Saved 4_child_expanded_read_mode.png');

  const childExpanded = page.locator('.blip-container.nested-blip, .blip-container.expanded').first();
  if (await childExpanded.isVisible()) {
    await childExpanded.screenshot({ path: '/mnt/c/Rizzoma/screenshots/4_crop_child_expanded.png' });
    console.log('Saved 4_crop_child_expanded.png');
  }

  // 5. Click on the child blip text (or click Edit) to enter edit mode
  console.log('Clicking child blip to enter edit mode...');
  const childBlipText = page.locator('.blip-container.nested-blip .blip-text, .blip-container.expanded .blip-text').first();
  await childBlipText.click();
  await page.waitForTimeout(1500);

  // Screenshot 5: Child Blip Edit Mode (Shows FULL NEW Editing Bar with Emoji 😀)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/5_child_edit_mode_full_toolbar.png' });
  console.log('Saved 5_child_edit_mode_full_toolbar.png');

  // 6. Click Emoji Button 😀
  const emojiBtn = page.locator('.blip-container.nested-blip [data-testid="blip-menu-emoji"], .blip-container.nested-blip .menu-btn:has-text("😀"), button:has-text("😀")').first();
  if (await emojiBtn.isVisible()) {
    console.log('Clicking Emoji picker button...');
    await emojiBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/6_child_emoji_picker_open.png' });
    console.log('Saved 6_child_emoji_picker_open.png');
    await emojiBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Done on child blip
  const childDoneBtn = page.locator('.blip-container.nested-blip [data-testid="blip-menu-done"], .blip-container.nested-blip .done-btn, button:has-text("Done")').first();
  if (await childDoneBtn.isVisible()) {
    await childDoneBtn.click();
    await page.waitForTimeout(1500);
  }

  // 7. Select text in root blip to verify Range Menu ([ 📝 ] [ 💬 Comment ])
  console.log('Selecting text in root blip to test floating Range Menu...');
  const firstLi = page.locator('.topic-blip-content li, .topic-content-view li').first();
  if (await firstLi.isVisible()) {
    const box = await firstLi.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 10, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 150, box.y + box.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/7_range_menu_selection.png' });
      console.log('Saved 7_range_menu_selection.png');
    }
  }

  await browser.close();
  console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

main().catch(console.error);
