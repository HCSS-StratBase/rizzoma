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
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  console.log('Navigating to', baseUrl);
  await safeGoto(page, baseUrl);

  try {
    await page.waitForSelector('.rizzoma-auth-overlay, .rizzoma-layout, .search-container', { timeout: 15000 });
  } catch (e) {
    console.log('Timeout waiting for selector, continuing...');
  }
  await page.waitForTimeout(1000);

  const authOverlay = page.locator('.rizzoma-auth-overlay');
  if (await authOverlay.isVisible()) {
    console.log('Signing up user...');
    await page.locator('.signup-link').click();
    await page.waitForTimeout(500);

    const testEmail = `stephan-ce-${Date.now()}@example.com`;
    await page.locator('.login-form input[type="email"]').fill(testEmail);
    await page.locator('.login-form input[type="password"]').fill('Password123!');
    await page.locator('.login-form .submit-btn').click();
    console.log('Signed up:', testEmail);

    await page.waitForSelector('.rizzoma-layout, .rizzoma-topic-detail, .search-container', { timeout: 15000 });
  }

  // Create topic
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
        title: 'Testing Ctrl-Enter Pipeline',
        content: '<p>Parent root observation topic</p>'
      })
    });
    return resp.json();
  });

  const topicId = topicData.topic?.id || topicData.id;
  console.log('Created topic ID:', topicId);

  await safeGoto(page, `${baseUrl}#/topic/${encodeURIComponent(topicId)}`);
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  // Take screenshot of fresh topic
  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/ce_step1_fresh_topic.png' });

  // Enter edit mode on root topic
  console.log('Entering edit mode on root topic...');
  const rootEditorArea = page.locator('.topic-content-section, .topic-content-preview, .root-blip-content').first();
  await rootEditorArea.click();
  await page.waitForTimeout(1500);

  // Check if topic is editing
  const rootEditor = page.locator('.topic-content-editor .ProseMirror, .rizzoma-topic-detail .ProseMirror').first();
  console.log('Root editor visible:', await rootEditor.isVisible());

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/ce_step2_root_editing.png' });

  // Type some text and press Ctrl+Enter
  console.log('Typing in editor and triggering Ctrl+Enter...');
  await rootEditor.focus();
  await page.keyboard.type(' Testing inline thought:');
  await page.waitForTimeout(500);

  console.log('Pressing Control+Enter...');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/ce_step3_after_ctrl_enter.png' });

  // Check DOM state
  const childBlipsCount = await page.locator('.blip-container, [data-testid="blip-thread"], .blip-thread').count();
  console.log('Count of blip containers or blip threads:', childBlipsCount);

  // Find all editors currently on page
  const editors = await page.locator('.ProseMirror').all();
  console.log('Total ProseMirror editors on page:', editors.length);
  for (let i = 0; i < editors.length; i++) {
    const isEd = await editors[i].isEditable();
    const vis = await editors[i].isVisible();
    const text = await editors[i].innerText();
    console.log(`Editor ${i}: editable=${isEd}, visible=${vis}, text=${JSON.stringify(text)}`);
  }

  // Type inside the newly opened child blip if available
  if (editors.length > 1) {
    const childEd = editors[editors.length - 1];
    await childEd.focus();
    await page.keyboard.type('Child blip content from Ctrl+Enter');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/ce_step4_typed_in_child.png' });
  }

  // Check Done button
  const doneBtns = page.locator('.done-btn, [data-testid="blip-menu-done"], .finish-edit-button');
  const doneCount = await doneBtns.count();
  console.log('Done buttons found:', doneCount);
  if (doneCount > 0) {
    await doneBtns.first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/ce_step5_after_done.png' });
  }

  await browser.close();
  console.log('Test completed.');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
