#!/usr/bin/env node
// READ-ONLY probe of legacy rizzoma.com UI landmarks (auth via rizzoma-session-state.json)
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: 'scripts/rizzoma-session-state.json', viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
page.on('dialog', d => d.dismiss().catch(() => {}));
await page.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);
const landmarks = await page.evaluate(() => {
  const vis = el => el.offsetParent !== null;
  const brief = els => Array.from(els).filter(vis).slice(0, 25).map(el => ({
    tag: el.tagName, cls: (el.className || '').toString().slice(0, 60),
    txt: (el.textContent || '').trim().slice(0, 30), title: el.getAttribute('title')?.slice(0, 40) || undefined,
  }));
  return {
    url: location.href,
    title: document.title,
    topicRows: document.querySelectorAll('.js-search-result, .search-result-item').length,
    searchBox: !!document.querySelector('#js-search-query'),
    navish: brief(document.querySelectorAll('[class*="navigation"] *[class], [class*="left-panel"] button, [class*="mode"] button')).slice(0, 12),
    titledButtons: brief(document.querySelectorAll('button[title], a[title]')),
  };
});
console.log(JSON.stringify(landmarks, null, 1).slice(0, 3800));
await page.screenshot({ path: '/tmp/claude-1000/-mnt-c-Apps/c1f220e3-7d69-4721-af10-ed4871f1b510/scratchpad/legacy-probe-topics.png' });
await browser.close();
