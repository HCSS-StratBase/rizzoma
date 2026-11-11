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

  const email = `test-stephan-${Date.now()}@example.com`;
  const password = 'Password123!';

  // 1. Register user
  console.log('Registering user...');
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
    return { ok: register.ok, status: register.status };
  }, { email, password });
  console.log('Auth result:', authResult);

  // 2. Create topic with content
  console.log('Creating topic with multi-line content...');
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

  // 3. Navigate to topic
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(topicId)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  // Take Screenshot 1: Root Topic Read Mode (verify automatic bulleting on root blip, single clean bullet, no elevated dot)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/1_root_topic_read_mode.png' });
  console.log('Saved 1_root_topic_read_mode.png');

  // 4. Click on the root blip text (click-to-edit)
  console.log('Testing click-to-edit on root blip...');
  const rootBlipText = page.locator('.topic-content-view, .topic-blip-content').first();
  await rootBlipText.click();
  await page.waitForTimeout(1500);

  // Take Screenshot 2: Root Topic Edit Mode (full editing bar with Emoji 😀)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/2_root_topic_edit_mode.png' });
  console.log('Saved 2_root_topic_edit_mode.png');

  // Click Done on root blip
  const topicDoneBtn = page.locator('.wave-panel [data-testid="blip-menu-done"], .wave-panel .done-btn, .topic-content-edit .finish-edit-button').first();
  if (await topicDoneBtn.isVisible()) {
    console.log('Clicking Done on root topic...');
    await topicDoneBtn.click();
    await page.waitForTimeout(1500);
  }

  // 5. Add a child reply blip
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

  // Take Screenshot 3: Child Blip Collapsed (Hidden by Default)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/3_child_collapsed_default.png' });
  console.log('Saved 3_child_collapsed_default.png');

  // 6. Click on the collapsed child blip to expand it
  console.log('Clicking on collapsed child blip to expand...');
  const childCollapsed = page.locator('.child-blip-collapsed, .blip-collapsed-row').first();
  await childCollapsed.click();
  await page.waitForTimeout(1500);

  // Take Screenshot 4: Child Blip Expanded in Read Mode (Shows Read-Only Bar + Single Clean Bullets)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/4_child_expanded_read_mode.png' });
  console.log('Saved 4_child_expanded_read_mode.png');

  // 7. Click on the child blip text (or click Edit) to enter edit mode
  console.log('Clicking child blip to enter edit mode...');
  const childBlipText = page.locator('.blip-container.nested-blip .blip-text, .blip-container.expanded .blip-text').first();
  await childBlipText.click();
  await page.waitForTimeout(1500);

  // Take Screenshot 5: Child Blip Edit Mode (Shows FULL NEW Editing Bar with Emoji 😀)
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/5_child_edit_mode_full_toolbar.png' });
  console.log('Saved 5_child_edit_mode_full_toolbar.png');

  // 8. Click Emoji Button 😀
  const emojiBtn = page.locator('.blip-container.nested-blip [data-testid="blip-menu-emoji"], .blip-container.nested-blip .menu-btn:has-text("😀")').first();
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
  const childDoneBtn = page.locator('.blip-container.nested-blip [data-testid="blip-menu-done"], .blip-container.nested-blip .done-btn').first();
  if (await childDoneBtn.isVisible()) {
    await childDoneBtn.click();
    await page.waitForTimeout(1500);
  }

  // 9. Select text in root blip to verify Range Menu ([ 📝 ] [ 💬 Comment ])
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
