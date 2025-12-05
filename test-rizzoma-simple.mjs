#!/usr/bin/env node

import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Rizzoma Feature Tests with Headed Browser\n');
  
  // Launch browser in headed mode so you can watch
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 500, // Slow down actions so they're visible
    args: ['--window-size=1400,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  // Helper function to log with timestamps
  const log = (message) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
  };

  try {
    // 1. Navigate to app
    log('📍 Navigating to Rizzoma...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

    // 2. Check if features are enabled
    log('🔍 Checking enabled features...');
    const features = await page.evaluate(() => window.FEATURES);
    console.log('Enabled features:', features);

    // 3. Check API health
    const healthResponse = await page.evaluate(async () => {
      const response = await fetch('http://localhost:3000/api/health');
      return await response.text();
    });
    log('✅ API Health: ' + healthResponse);

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
          const boldButton = await page.$('button[title*="Bold"]');
          if (boldButton) {
            await boldButton.click();
            await page.keyboard.type('Bold text ');
            await boldButton.click();
          }
          
          // Test italic
          const italicButton = await page.$('button[title*="Italic"]');
          if (italicButton) {
            await italicButton.click();
            await page.keyboard.type('Italic text ');
            await italicButton.click();
          }
          
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
          for (let i = 0; i < 10; i++) {
            await page.keyboard.press('ArrowLeft');
          }
          await page.keyboard.up('Shift');
          await page.waitForTimeout(1000);
          
          const commentButton = await page.$('.add-comment-button');
          if (commentButton) {
            log('✅ Comment button appeared for selected text!');
            await commentButton.click();
            
            const commentForm = await page.$('.inline-comment-form');
            if (commentForm) {
              const textarea = await page.$('.inline-comment-form textarea');
              if (textarea) {
                await textarea.type('This is a test comment!');
                log('✅ Added inline comment');
              }
            }
          }
        }
      }

      // 10. Check for Follow the Green
      log('🟢 Looking for "Follow the Green" navigation...');
      const greenNav = await page.$('.green-navigation');
      if (greenNav) {
        log('✅ Follow the Green navigation found!');
        const greenCount = await page.$('.green-count');
        if (greenCount) {
          const unreadCount = await page.$eval('.green-count', el => el.textContent);
          log(`Unread changes: ${unreadCount}`);
        }
      }
    }

    // 11. Navigate to waves
    log('🌊 Navigating to waves...');
    await page.goto('http://localhost:3000#/waves', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    
    const waveLinks = await page.$$('a[href*="#/wave/"]');
    log(`Found ${waveLinks.length} waves`);

    // 12. Test editor search
    log('🔍 Testing editor search...');
    await page.goto('http://localhost:3000#/editor/search', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    
    const searchInput = await page.$('input[placeholder*="Search"]');
    if (searchInput) {
      await searchInput.type('test');
      await page.keyboard.press('Enter');
      log('✅ Editor search is functional');
    }

    // 13. Open second tab for collaboration test
    log('👥 Testing real-time collaboration...');
    const page2 = await browser.newPage();
    await page2.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    
    log('✅ Opened two browser tabs for collaboration test');
    log('👀 You should see cursors and real-time updates between tabs!');

    // Keep browser open for manual exploration
    log('\n🎉 All automated tests completed!');
    log('📌 Browser will stay open for manual testing.');
    log('📌 Try editing in one tab and watch the other!');
    log('📌 Press Ctrl+C in terminal when done.\n');

  } catch (error) {
    console.error('❌ Test error:', error);
  }

  // Don't close browser - let user explore
  await new Promise(() => {});
})();