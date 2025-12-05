const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('1. Testing Test Editor Page...');
  await page.goto('http://localhost:3000/test-editor.html');
  await page.waitForTimeout(2000);
  
  // Take screenshot of test editor
  await page.screenshot({ path: 'test-editor-page.png', fullPage: true });
  console.log('   - Screenshot saved: test-editor-page.png');

  // Check feature flags
  const featureFlags = await page.evaluate(() => {
    return window.import.meta?.env || {};
  });
  console.log('   - Feature flags:', featureFlags);

  console.log('\n2. Testing Main Topics Page...');
  await page.goto('http://localhost:3000#/topics');
  await page.waitForTimeout(2000);
  
  // Take screenshot of topics page
  await page.screenshot({ path: 'topics-page.png', fullPage: true });
  console.log('   - Screenshot saved: topics-page.png');

  // Create a new topic to test editor
  const newTopicButton = await page.locator('button:has-text("New Topic")');
  if (await newTopicButton.count() > 0) {
    console.log('   - Found New Topic button, clicking...');
    await newTopicButton.click();
    await page.waitForTimeout(1000);
    
    // Fill in topic title
    await page.fill('input[placeholder="Topic title"]', 'Test Topic for Editor Features');
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(2000);
    
    // Take screenshot of topic detail
    await page.screenshot({ path: 'topic-detail-editor.png', fullPage: true });
    console.log('   - Screenshot saved: topic-detail-editor.png');
  }

  console.log('\n3. Testing Wave View...');
  await page.goto('http://localhost:3000#/waves');
  await page.waitForTimeout(2000);
  
  // Take screenshot of waves page
  await page.screenshot({ path: 'waves-page.png', fullPage: true });
  console.log('   - Screenshot saved: waves-page.png');

  console.log('\n4. Checking for Rich Text Editor Toolbar...');
  // Look for toolbar elements
  const toolbarExists = await page.locator('[data-testid="rich-text-toolbar"], .toolbar, [class*="toolbar"]').count() > 0;
  console.log('   - Toolbar found:', toolbarExists);
  
  if (!toolbarExists) {
    console.log('   - Checking for any editor elements...');
    const editorElements = await page.locator('.editor, [contenteditable="true"], .blip-editor').count();
    console.log('   - Editor elements found:', editorElements);
  }

  console.log('\n5. Testing Text Selection for Inline Comments...');
  // Try to find and select text in an editor
  const editorElement = await page.locator('.editor, [contenteditable="true"], .blip-editor').first();
  if (await editorElement.count() > 0) {
    console.log('   - Found editor, attempting to select text...');
    
    // Type some text first
    await editorElement.click();
    await page.keyboard.type('This is test text for inline comments feature');
    await page.waitForTimeout(500);
    
    // Select the text
    await page.keyboard.press('Control+A');
    await page.waitForTimeout(1000);
    
    // Look for comment button
    const commentButton = await page.locator('button:has-text("Add comment"), [title*="comment"], .comment-button, button:has-text("💬")').count() > 0;
    console.log('   - Comment button found after selection:', commentButton);
    
    // Take screenshot of selected text
    await page.screenshot({ path: 'text-selection.png', fullPage: true });
    console.log('   - Screenshot saved: text-selection.png');
  }

  console.log('\nTest completed. Check the screenshots to see the current state of features.');
  
  await browser.close();
})();