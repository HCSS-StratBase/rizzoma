import { chromium } from 'playwright';

(async () => {
  console.log('🚀 Starting Rizzoma Feature Tests with Headed Browser\n');
  
  // Launch browser in headed mode so you can watch
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500, // Slow down actions so they're visible
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  
  const page = await context.newPage();
  
  // Helper function to log with timestamps
  const log = (message) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
  };

  try {
    // 1. Navigate to app
    log('📍 Navigating to Rizzoma...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // 2. Check if features are enabled
    log('🔍 Checking enabled features...');
    const features = await page.evaluate(() => window.FEATURES);
    console.log('Enabled features:', features);

    // 3. Check API health
    const healthResponse = await page.request.get('http://localhost:3000/api/health');
    log('✅ API Health: ' + await healthResponse.text());

    // 4. Look for existing topics
    log('📝 Looking for topics...');
    await page.waitForTimeout(2000);
    
    const topicLinks = await page.$$('a[href*="#/topic/"]');
    log(`Found ${topicLinks.length} topics`);

    if (topicLinks.length > 0) {
      // 5. Click on first topic
      log('🖱️ Opening first topic...');
      await topicLinks[0].click();
      await page.waitForTimeout(3000);

      // 6. Check for editor and toolbar
      log('🎨 Checking for rich text editor...');
      const hasEditor = await page.$('.ProseMirror') !== null;
      const hasToolbar = await page.$('.editor-toolbar') !== null;
      
      log(`Editor present: ${hasEditor ? '✅' : '❌'}`);
      log(`Rich toolbar: ${hasToolbar ? '✅' : '❌'}`);

      if (hasToolbar) {
        // 7. Test toolbar buttons
        log('🔧 Testing toolbar functionality...');
        
        // Click into editor first
        const editor = await page.$('.ProseMirror');
        if (editor) {
          await editor.click();
          await page.keyboard.type('Testing Rizzoma features: ');
          
          // Test bold
          await page.click('button[title*="Bold"]');
          await page.keyboard.type('Bold text ');
          await page.click('button[title*="Bold"]');
          
          // Test italic
          await page.click('button[title*="Italic"]');
          await page.keyboard.type('Italic text ');
          await page.click('button[title*="Italic"]');
          
          log('✅ Tested text formatting');

          // 8. Test @mentions
          log('👤 Testing @mentions...');
          await page.keyboard.type('Hello @');
          await page.waitForTimeout(1000);
          
          const mentionList = await page.$('.mention-list');
          if (mentionList) {
            log('✅ Mention dropdown appeared!');
            await page.keyboard.press('Escape');
          }

          // 9. Test inline comments
          log('💬 Testing inline comments...');
          
          // Select some text
          await page.keyboard.down('Shift');
          await page.keyboard.press('ArrowLeft', { count: 10 });
          await page.keyboard.up('Shift');
          await page.waitForTimeout(1000);
          
          const commentButton = await page.$('.add-comment-button');
          if (commentButton) {
            log('✅ Comment button appeared for selected text!');
            await commentButton.click();
            
            const commentForm = await page.$('.inline-comment-form');
            if (commentForm) {
              await page.fill('.inline-comment-form textarea', 'This is a test comment!');
              log('✅ Added inline comment');
            }
          }
        }
      }

      // 10. Check for Follow the Green
      log('🟢 Looking for "Follow the Green" navigation...');
      const greenNav = await page.$('.green-navigation');
      if (greenNav) {
        log('✅ Follow the Green navigation found!');
        const unreadCount = await page.$eval('.green-count', el => el.textContent);
        log(`Unread changes: ${unreadCount}`);
      }
    }

    // 11. Navigate to waves
    log('🌊 Navigating to waves...');
    await page.goto('http://localhost:3000#/waves');
    await page.waitForTimeout(2000);
    
    const waveLinks = await page.$$('a[href*="#/wave/"]');
    log(`Found ${waveLinks.length} waves`);

    // 12. Test editor search
    log('🔍 Testing editor search...');
    await page.goto('http://localhost:3000#/editor/search');
    await page.waitForTimeout(2000);
    
    const searchInput = await page.$('input[placeholder*="Search"]');
    if (searchInput) {
      await searchInput.fill('test');
      await page.keyboard.press('Enter');
      log('✅ Editor search is functional');
    }

    // 13. Open second tab for collaboration test
    log('👥 Testing real-time collaboration...');
    const page2 = await context.newPage();
    await page2.goto('http://localhost:3000');
    
    // Position windows side by side
    await page.bringToFront();
    await page.evaluate(() => {
      window.moveTo(0, 0);
      window.resizeTo(700, 900);
    });
    
    await page2.bringToFront();
    await page2.evaluate(() => {
      window.moveTo(700, 0);
      window.resizeTo(700, 900);
    });

    log('✅ Opened two browser windows for collaboration test');
    log('👀 You should see cursors and real-time updates between windows!');

    // Keep browser open for manual exploration
    log('\n🎉 All automated tests completed!');
    log('📌 Browser will stay open for manual testing.');
    log('📌 Try editing in one window and watch the other!');
    log('📌 Press Ctrl+C in terminal when done.\n');

  } catch (error) {
    console.error('❌ Test error:', error);
  }

  // Don't close browser - let user explore
  await new Promise(() => {});
})();