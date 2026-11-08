import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1119, height: 817 },
    deviceScaleFactor: 1.0,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  const email = 'visual-parity+' + Date.now() + '@example.com';
  const password = 'Password123!';
  console.log('Authenticating ' + email + '...');
  await page.goto('https://138-201-62-161.nip.io', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    await fetch('/api/auth/register', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password, name: 'Stephan Parity' }),
    });
  }, { email, password });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 20000 });
  console.log('Navigating to topic...');
  await page.goto('https://138-201-62-161.nip.io/#/topic/917d750213736e02a665422fca066d53', { waitUntil: 'networkidle' });
  await page.waitForSelector('.topic-blip-content', { timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log('Selecting text inside .blip-text...');
  const selectInfo = await page.evaluate(() => {
    const textContainers = document.querySelectorAll('.blip-text');
    console.log('Found text containers:', textContainers.length);
    for (const textContainer of textContainers) {
      const walk = document.createTreeWalker(textContainer, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walk.nextNode())) {
        const val = node.textContent.trim();
        if (val.length > 10 && !val.startsWith('#')) {
          const range = document.createRange();
          range.setStart(node, 0);
          range.setEnd(node, Math.min(node.textContent.length, 15));
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);

          // Fire both mouseup and selectionchange
          document.dispatchEvent(new Event('selectionchange'));
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 450, clientY: 250 }));
          return {
            text: range.toString(),
            rect: range.getBoundingClientRect(),
            nodeText: node.textContent,
          };
        }
      }
    }
    return { error: 'No suitable text node found' };
  });

  console.log('Selection info:', JSON.stringify(selectInfo));
  await page.waitForTimeout(1000);

  const rangeMenu = page.locator('.range-menu');
  const count = await rangeMenu.count();
  console.log('Range menu count:', count);
  if (count > 0) {
    const isVis = await rangeMenu.first().isVisible();
    const box = await rangeMenu.first().boundingBox();
    const html = await rangeMenu.first().evaluate(el => el.outerHTML);
    console.log('Range menu visible:', isVis, 'box:', JSON.stringify(box), 'html:', html);
  }

  await page.screenshot({ path: '/home/stephan/.gemini/antigravity-cli/brain/e0d61102-174c-4127-a221-d5dffc93dabe/surface7_test_selection.png' });
  console.log('Saved surface7_test_selection.png');
  await browser.close();
}
test().catch(console.error);
