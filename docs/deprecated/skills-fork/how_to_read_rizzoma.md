# Skill: How to Read Rizzoma Topics

## Prerequisites
- Anonymous access to Rizzoma is disabled. Do **NOT** attempt to open pages anonymously or log in interactively via Google SSO from scratch.
- You must use an authenticated browser session. The persistent storage state is located at: `/mnt/c/Rizzoma/scripts/rizzoma-session-state.json`
- Ensure Node.js and Playwright are available in the `/mnt/c/Rizzoma` directory.

## Execution Steps
1. **Initialize Playwright Context:**
   Create a Playwright browser context using the saved storage state:
   ```javascript
   const { chromium } = require('playwright');
   const browser = await chromium.launch({ headless: true });
   const context = await browser.newContext({ storageState: '/mnt/c/Rizzoma/scripts/rizzoma-session-state.json' });
   const page = await context.newPage();
   ```

2. **Navigate to the Topic:**
   ```javascript
   await page.goto('https://rizzoma.com/topic/TARGET_TOPIC_ID/', { waitUntil: 'networkidle' });
   ```

3. **Wait for Content to Load:**
   Rizzoma heavily relies on dynamic loading via JavaScript/WebSockets. Always wait a few seconds or explicitly wait for the editor container before scraping text:
   ```javascript
   await page.waitForTimeout(5000); 
   // Alternatively: await page.waitForSelector('.editor-root');
   ```

4. **Extract Content:**
   Extract the inner text from the topic body:
   ```javascript
   const content = await page.evaluate(() => {
       const editor = document.querySelector('.editor-root') || document.body;
       return editor.innerText;
   });
   console.log(content);
   ```

5. **Clean Up:**
   Always close the browser context to free up resources:
   ```javascript
   await browser.close();
   ```
