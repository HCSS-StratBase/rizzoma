import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const baseUrl = 'https://138-201-62-161.nip.io/?layout=rizzoma';
const outDir = '/mnt/c/Rizzoma/screenshots/261108-parity-fixes';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

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
  await page.waitForTimeout(1500);

  // Authenticate if needed
  const authOverlay = page.locator('.rizzoma-auth-overlay');
  if (await authOverlay.isVisible()) {
    console.log('Authenticating...');
    const signupLink = page.locator('.signup-link');
    if (await signupLink.isVisible()) {
      await signupLink.click();
      await page.waitForTimeout(500);
      const testEmail = `parity-${Date.now()}@example.com`;
      await page.locator('.login-form input[type="email"]').fill(testEmail);
      await page.locator('.login-form input[type="password"]').fill('Password123!');
      await page.locator('.login-form .submit-btn').click();
    } else {
      await page.locator('.login-form input[type="email"]').fill('admin@example.com');
      await page.locator('.login-form input[type="password"]').fill('admin123');
      await page.locator('.login-form .submit-btn').click();
    }
    await page.waitForSelector('.rizzoma-layout, .rizzoma-topic-detail, .search-container', { timeout: 15000 });
  }

  // Create a topic with tags line (matching legacy Russian Red Lines topic)
  console.log('Creating test topic matching legacy Russian Red Lines structure...');
  const topicData = await page.evaluate(async () => {
    const raw = document.cookie.split('; ').find(entry => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };

    const resp = await fetch('/api/topics', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        title: 'Russian Red Lines - 2026',
        content: '<p>#RuBase #StratBase</p><p>First key assessment of escalation dynamics.</p><p>Second paragraph on tactical deterrence.</p>'
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

  // 1. Check for "Untitled blip" anywhere on the page
  const pageContent = await page.content();
  const untitledMatches = (pageContent.match(/Untitled blip/gi) || []).length;
  console.log(`[CHECK 1] "Untitled blip" occurrences in page HTML: ${untitledMatches}`);

  // 2. Check for tag chips rendered
  const tagChips = page.locator('.blip-tag, .blip-tag-chip, .blip-tag-text');
  const tagCount = await tagChips.count();
  console.log(`[CHECK 2] Rendered tag chip count: ${tagCount}`);

  // Screenshot 1: Topic with tag chips
  await page.screenshot({ path: path.join(outDir, '01_topic_tags_view.png') });
  console.log('Saved 01_topic_tags_view.png');

  // Crop header area to inspect title and tags
  const headerElem = page.locator('.topic-header, .topic-content-header, .rizzoma-topic-detail h1').first();
  if (await headerElem.isVisible()) {
    await headerElem.screenshot({ path: path.join(outDir, '01_crop_header_tags.png') });
  }

  // 3. Inspect bullets in root blip - check bullet items
  const bulletLis = page.locator('.topic-blip-content li, .topic-content-view li');
  const bulletCount = await bulletLis.count();
  console.log(`[CHECK 3] Root blip list items count: ${bulletCount}`);
  for (let i = 0; i < bulletCount; i++) {
    const liText = (await bulletLis.nth(i).textContent())?.trim();
    const isTagLine = await bulletLis.nth(i).evaluate(el => el.classList.contains('blip-tag-line') || el.style.listStyle === 'none');
    console.log(`  item[${i}]: "${liText}" (unbulleted tag line: ${isTagLine})`);
  }

  // Crop root blip content
  const rootBlipElem = page.locator('.topic-blip-content, .topic-content-view').first();
  if (await rootBlipElem.isVisible()) {
    await rootBlipElem.screenshot({ path: path.join(outDir, '02_crop_root_bullets.png') });
    console.log('Saved 02_crop_root_bullets.png');
  }

  // 4. Click root blip to enter edit mode
  console.log('Clicking root blip to enter edit mode...');
  await rootBlipElem.click();
  await page.waitForTimeout(1500);

  // Screenshot 2: Edit mode
  await page.screenshot({ path: path.join(outDir, '03_topic_edit_mode.png') });
  console.log('Saved 03_topic_edit_mode.png');

  // 5. Test Ctrl+Enter in editor
  console.log('Pressing Control+Enter inside the editor...');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(2500);

  // Check if an inline blip was created
  const inlineBlips = page.locator('.blip-container.nested-blip, .inline-child-blip, .blip-thread');
  const inlineCount = await inlineBlips.count();
  console.log(`[CHECK 4] Inline child blips after Ctrl+Enter: ${inlineCount}`);

  // Check again for "Untitled blip"
  const pageContentAfterCtrlEnter = await page.content();
  const untitledAfter = (pageContentAfterCtrlEnter.match(/Untitled blip/gi) || []).length;
  console.log(`[CHECK 5] "Untitled blip" occurrences after Ctrl+Enter: ${untitledAfter}`);

  // Screenshot 3: After Ctrl+Enter
  await page.screenshot({ path: path.join(outDir, '04_after_ctrl_enter.png') });
  console.log('Saved 04_after_ctrl_enter.png');

  // Check if active editor exists in child blip
  const activeEditor = page.locator('.nested-blip .ProseMirror[contenteditable="true"], .nested-blip .cm-editor, .nested-blip .blip-editor-container');
  const hasActiveEditor = await activeEditor.count();
  console.log(`[CHECK 6] Active editor in child blip: ${hasActiveEditor > 0 ? 'YES' : 'NO'}`);

  // If active editor exists, type into it
  if (hasActiveEditor > 0) {
    console.log('Typing tactical reply into child blip...');
    await page.keyboard.type('Sub-analysis: tactical response to red line breach');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(outDir, '05_child_typed_content.png') });
    console.log('Saved 05_child_typed_content.png');
  }

  await browser.close();
  console.log('ALL PARITY VERIFICATIONS FINISHED.');
}

main().catch(console.error);
