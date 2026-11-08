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
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('dialog', async dialog => {
    console.log('DIALOG DETECTED:', dialog.type(), dialog.message());
    await dialog.accept();
    console.log('DIALOG ACCEPTED');
  });

  console.log('Navigating to', baseUrl);
  await safeGoto(page, baseUrl);

  // Authenticate
  await page.waitForTimeout(1500);
  const authOverlay = page.locator('.rizzoma-auth-overlay');
  if (await authOverlay.isVisible()) {
    console.log('Signing up user...');
    await page.locator('.signup-link').click();
    await page.waitForTimeout(500);

    const testEmail = `sds-test-${Date.now()}@example.com`;
    await page.locator('.login-form input[type="email"]').fill(testEmail);
    await page.locator('.login-form input[type="password"]').fill('Password123!');
    await page.locator('.login-form .submit-btn').click();
    console.log('Signed up:', testEmail);
    await page.waitForTimeout(2000);
  }

  // 1. Create a fresh topic
  console.log('1. Creating test topic...');
  const topicData = await page.evaluate(async () => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch('/api/topics', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        title: 'Verifying Deletion and Ctrl+Enter Live',
        content: '<ul><li><p>Bullet root item one</p></li></ul>'
      })
    });
    return resp.json();
  });

  const topicId = topicData.topic?.id || topicData.id;
  console.log('Topic ID:', topicId);

  // 2. Add a child reply blip to test delete
  console.log('2. Adding child reply blip...');
  const childData = await page.evaluate(async ({ topicId }) => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch('/api/blips', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        waveId: topicId,
        parentId: topicId,
        content: '<ul><li><p>Child observation to be deleted</p></li></ul>',
        isFoldedByDefault: true
      })
    });
    return resp.json();
  }, { topicId });
  const childBlipId = childData.blip?.id || childData.id;
  console.log('Child Blip ID:', childBlipId);

  // Navigate to topic
  await safeGoto(page, `${baseUrl}#/topic/${encodeURIComponent(topicId)}`);
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 25000 });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/verify_step1_initial.png' });

  // 3. Expand child blip
  console.log('3. Expanding child blip...');
  const collapsedRow = page.locator('.child-blip-collapsed, [data-testid="blip-label-child"]').first();
  await collapsedRow.click();
  await page.waitForTimeout(1500);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/verify_step2_expanded_child.png' });

  // 4. Click Delete on child blip
  console.log('4. Clicking delete button on child blip...');
  const deleteBtn = page.locator('.delete-blip, [data-testid="blip-menu-delete"]').first();
  await deleteBtn.click();
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/verify_step3_after_delete.png' });

  // Verify child blip is gone
  const childCount = await page.locator(`[data-blip-id="${childBlipId}"], text=Child observation to be deleted`).count();
  console.log('Child blip elements remaining in DOM (must be 0):', childCount);

  // 5. Test Ctrl+Enter on root topic
  console.log('5. Testing Ctrl+Enter on root blip...');
  // Click text to edit root blip
  const rootText = page.locator('.topic-content-preview, .root-blip-content .blip-text, .topic-content-section').first();
  if (await rootText.isVisible()) {
    await rootText.click();
    await page.waitForTimeout(1000);
  }

  const editor = page.locator('.ProseMirror[contenteditable="true"]').first();
  console.log('Editor is visible for Ctrl+Enter:', await editor.isVisible());
  if (await editor.isVisible()) {
    await editor.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' With inline note');
    await page.waitForTimeout(500);

    console.log('Triggering Control+Enter...');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/verify_step4_after_ctrl_enter.png' });

    // Check count of ProseMirror editors or blip containers
    const editorCount = await page.locator('.ProseMirror').count();
    console.log('ProseMirror count after Ctrl+Enter:', editorCount);
    const markerCount = await page.locator('.blip-thread-marker, .blip-thread-host').count();
    console.log('Marker [+] count after Ctrl+Enter:', markerCount);
  }

  await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/verify_step5_final.png' });
  await browser.close();
  console.log('VERIFICATION SCRIPT FINISHED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
