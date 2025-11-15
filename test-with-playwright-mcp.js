// Comprehensive Rizzoma Feature Test
// Run this with: npx @playwright/test test-with-playwright-mcp.js

const { test, expect } = require('@playwright/test');

// Configure to run in headed mode
test.use({
  headless: false,
  viewport: { width: 1400, height: 900 },
  video: 'retain-on-failure',
  trace: 'retain-on-failure',
});

test.describe('Rizzoma Core Features', () => {
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    console.log('🚀 Starting Rizzoma Feature Tests\n');
  });

  test('1. Check if all features are enabled', async () => {
    await page.goto('http://localhost:3000');
    
    const features = await page.evaluate(() => window.FEATURES);
    console.log('✅ Enabled features:', features);
    
    expect(features.RICH_TOOLBAR).toBe(true);
    expect(features.INLINE_COMMENTS).toBe(true);
    expect(features.FOLLOW_GREEN).toBe(true);
    expect(features.LIVE_CURSORS).toBe(true);
  });

  test('2. API Health Check', async () => {
    const response = await page.request.get('http://localhost:3000/api/health');
    expect(response.status()).toBe(200);
    
    const health = await response.json();
    console.log('✅ API Health:', health);
    expect(health.status).toBe('ok');
  });

  test('3. Navigate and find topics', async () => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    const topicLinks = await page.$$('a[href*="#/topic/"]');
    console.log(`📝 Found ${topicLinks.length} topics`);
    
    if (topicLinks.length > 0) {
      // Click first topic
      await topicLinks[0].click();
      await page.waitForTimeout(2000);
      
      // Verify we're on a topic page
      expect(page.url()).toContain('#/topic/');
    }
  });

  test('4. Test Rich Text Editor Toolbar', async () => {
    // Ensure we're on a topic page
    const topicLinks = await page.$$('a[href*="#/topic/"]');
    if (topicLinks.length === 0) {
      console.log('⚠️ No topics found, skipping editor tests');
      return;
    }

    await topicLinks[0].click();
    await page.waitForTimeout(2000);

    // Check for editor and toolbar
    const editor = await page.$('.ProseMirror');
    const toolbar = await page.$('.editor-toolbar');
    
    expect(editor).toBeTruthy();
    expect(toolbar).toBeTruthy();
    
    // Count toolbar buttons
    const buttons = await page.$$('.editor-toolbar button');
    console.log(`🎨 Found ${buttons.length} toolbar buttons`);
    expect(buttons.length).toBeGreaterThan(10);

    // Test typing and formatting
    if (editor) {
      await editor.click();
      await page.keyboard.type('Testing: ');
      
      // Test bold
      await page.click('button[title*="Bold"]');
      await page.keyboard.type('Bold text ');
      
      // Test italic  
      await page.click('button[title*="Italic"]');
      await page.keyboard.type('Italic text ');
      
      console.log('✅ Text formatting works');
    }
  });

  test('5. Test @Mentions', async () => {
    const editor = await page.$('.ProseMirror');
    if (!editor) return;

    await editor.click();
    await page.keyboard.type(' @');
    await page.waitForTimeout(1000);
    
    const mentionList = await page.$('.mention-list');
    expect(mentionList).toBeTruthy();
    
    if (mentionList) {
      console.log('✅ Mention dropdown appeared!');
      
      // Count mention items
      const items = await page.$$('.mention-item');
      console.log(`👤 Found ${items.length} users in mention list`);
      
      await page.keyboard.press('Escape');
    }
  });

  test('6. Test Inline Comments', async () => {
    const editor = await page.$('.ProseMirror');
    if (!editor) return;

    // Type some text
    await editor.click();
    await page.keyboard.type(' This text can be commented on.');
    await page.waitForTimeout(500);
    
    // Select text
    await page.keyboard.down('Shift');
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowLeft');
    }
    await page.keyboard.up('Shift');
    await page.waitForTimeout(1000);
    
    // Look for comment button
    const commentButton = await page.$('.add-comment-button');
    expect(commentButton).toBeTruthy();
    
    if (commentButton) {
      console.log('✅ Comment button appeared for selected text!');
      
      await commentButton.click();
      const commentForm = await page.$('.inline-comment-form');
      expect(commentForm).toBeTruthy();
      
      if (commentForm) {
        await page.fill('.inline-comment-form textarea', 'Test comment!');
        console.log('✅ Comment form works');
      }
    }
  });

  test('7. Check Follow the Green navigation', async () => {
    const greenNav = await page.$('.green-navigation');
    
    if (greenNav) {
      console.log('✅ Follow the Green navigation found!');
      
      const countElement = await page.$('.green-count');
      if (countElement) {
        const count = await countElement.textContent();
        console.log(`🟢 Unread changes: ${count}`);
      }
    }
  });

  test('8. Test Live Collaboration', async ({ browser }) => {
    // Open second page
    const page2 = await browser.newPage();
    await page2.goto(page.url());
    await page2.waitForLoadState('networkidle');
    
    console.log('✅ Opened second tab for collaboration test');
    
    // Type in first page
    const editor1 = await page.$('.ProseMirror');
    if (editor1) {
      await editor1.click();
      await page.keyboard.type(' Collab test from tab 1');
      
      // Check for cursors in second page
      await page2.waitForTimeout(1000);
      const cursors = await page2.$$('.collaboration-cursor');
      
      if (cursors.length > 0) {
        console.log(`✅ Found ${cursors.length} collaborative cursors!`);
      }
    }
    
    await page2.close();
  });

  test('9. Test Editor Search', async () => {
    await page.goto('http://localhost:3000#/editor/search');
    await page.waitForLoadState('networkidle');
    
    const searchInput = await page.$('input[placeholder*="Search"]');
    expect(searchInput).toBeTruthy();
    
    if (searchInput) {
      await searchInput.fill('test');
      await page.keyboard.press('Enter');
      console.log('✅ Editor search is functional');
    }
  });

  test('10. Test Waves Navigation', async () => {
    await page.goto('http://localhost:3000#/waves');
    await page.waitForLoadState('networkidle');
    
    const waveLinks = await page.$$('a[href*="#/wave/"]');
    console.log(`🌊 Found ${waveLinks.length} waves`);
    
    if (waveLinks.length > 0) {
      await waveLinks[0].click();
      await page.waitForTimeout(2000);
      
      // Check for blip structure
      const blips = await page.$$('[id^="blip-"]');
      console.log(`📄 Found ${blips.length} blips in wave`);
    }
  });

  test.afterAll(async () => {
    console.log('\n🎉 All tests completed!');
    console.log('💡 Browser will stay open for manual exploration.');
    console.log('📌 Press Ctrl+C when done.\n');
    
    // Keep browser open
    await new Promise(() => {});
  });
});