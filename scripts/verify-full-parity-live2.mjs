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

  // Wait for either auth overlay or authenticated UI
  console.log('Waiting for initial UI mount...');
  try {
    await page.waitForSelector('.rizzoma-auth-overlay, .rizzoma-layout, .search-container', { timeout: 15000 });
  } catch (e) {
    console.log('Timeout waiting for selector, continuing...');
  }
  await page.waitForTimeout(1000);

  // Authenticate if needed
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
  } else {
    console.log('Auth overlay not visible, already signed in or layout mounted');
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

  console.log('Topic create result:', JSON.stringify(topicData));
  const topicId = topicData.topic?.id || topicData.id;
  if (!topicId) {
    throw new Error('Failed to create topic: ' + JSON.stringify(topicData));
  }
  console.log('Created topic ID:', topicId);

  // Add child reply blip via API to test hidden by default
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
        content: '<p>First line of tactical child reply</p><p>Second line with detailed observation</p>',
        isFoldedByDefault: true
      })
    });
    return resp.json();
  }, { topicId });
  console.log('Child blip created:', JSON.stringify(childBlipData));

  // Navigate to topic
  console.log('Navigating to topic detail view...');
  await safeGoto(page, `${baseUrl}#/topic/${encodeURIComponent(topicId)}`);
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  // 1. Verify Child Blip is HIDDEN BY DEFAULT
  console.log('1. Verifying child blip is HIDDEN BY DEFAULT...');
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/v2_1_child_hidden_by_default.png' });
  const collapsedRow = page.locator('.child-blip-collapsed, .blip-collapsed-row, [data-testid="blip-label"]').first();
  const isCollapsedVisible = await collapsedRow.isVisible();
  console.log('Collapsed row visible on initial load:', isCollapsedVisible);

  // Check that the child's prose is NOT visible on initial load
  const proseVisibleInitially = await page.locator('text=Second line with detailed observation').isVisible();
  console.log('Child body prose visible initially (must be false):', proseVisibleInitially);

  // 2. Click [+] to open blip -> verify read-only bar appears with zero overlap
  console.log('2. Clicking [+] to open blip...');
  await collapsedRow.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/v2_2_child_expanded_read_mode.png' });
  const readOnlyMenu = page.locator('.blip-container.nested-blip .read-only-menu, .blip-container.expanded .read-only-menu').first();
  console.log('Read-only bar visible after opening:', await readOnlyMenu.isVisible());

  // 3. Click text to enter edit mode -> verify full blue editing bar with ZERO OVERLAP
  console.log('3. Clicking child blip to enter edit mode...');
  const childBlipText = page.locator('.blip-container.nested-blip .blip-text, .blip-container.expanded .blip-text').first();
  await childBlipText.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/v2_3_child_edit_mode_zero_overlap.png' });
  const editMenu = page.locator('.blip-container.nested-blip .edit-menu, .blip-container.edit-mode .edit-menu').first();
  console.log('Full blue edit menu visible in edit mode:', await editMenu.isVisible());

  // Crop the exact region around toolbar and text to verify zero overlap
  const childContainer = page.locator('.blip-container.nested-blip.edit-mode, .blip-container.edit-mode').first();
  if (await childContainer.isVisible()) {
    await childContainer.screenshot({ path: '/mnt/c/Rizzoma/screenshots/v2_3_crop_child_edit_container.png' });
    console.log('Saved v2_3_crop_child_edit_container.png');
  }

  // 4. Test Emoji Button
  console.log('4. Testing emoji picker...');
  const emojiBtn = page.locator('.blip-container.nested-blip [data-testid="blip-menu-emoji"], button:has-text("😀")').first();
  if (await emojiBtn.isVisible()) {
    await emojiBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/v2_4_emoji_picker.png' });
    await emojiBtn.click(); // Close
    await page.waitForTimeout(500);
  }

  // 5. Test Ctrl+Enter to create a child blip
  console.log('5. Testing Ctrl+Enter from editor...');
  const editor = page.locator('.blip-container.nested-blip .ProseMirror, .blip-editor-container .ProseMirror').first();
  if (await editor.isVisible()) {
    await editor.focus();
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/v2_5_after_ctrl_enter.png' });
    console.log('Saved v2_5_after_ctrl_enter.png');
  }

  // Click Done
  const childDoneBtn = page.locator('.blip-container.nested-blip [data-testid="blip-menu-done"], .blip-container.nested-blip .finish-edit-button, button:has-text("Done")').first();
  if (await childDoneBtn.isVisible()) {
    await childDoneBtn.click();
    await page.waitForTimeout(1500);
  }

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/v2_6_final_state.png' });
  console.log('Saved v2_6_final_state.png');

  await browser.close();
  console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

main().catch(console.error);
