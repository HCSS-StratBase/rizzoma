#!/usr/bin/env node
import { chromium } from 'playwright';
const baseUrl = process.env.RZ_BASE || 'https://138-201-62-161.nip.io';
const topicId = '0b997d49bf636cdd371819e13601e7ce';
const log = m => console.log(`[ft] ${m}`);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
});
await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
await page.evaluate(() => {
  window.__focusLog = [];
  const t0 = performance.now();
  document.addEventListener('focusout', e => window.__focusLog.push(`${(performance.now()-t0).toFixed(0)}ms OUT from ${(e.target?.className||'').toString().slice(0,60)}`), true);
  document.addEventListener('focusin', e => window.__focusLog.push(`${(performance.now()-t0).toFixed(0)}ms IN  to ${(e.target?.className||'').toString().slice(0,60)}`), true);
  const b = Array.from(document.querySelectorAll('button.topic-tb-btn')).find(x => /^edit$/i.test((x.textContent||'').trim()));
  b?.click();
});
await page.waitForTimeout(2000);
const li = page.locator('.topic-content-edit .ProseMirror li').first();
await li.click({ timeout: 5000 }).catch(e => log(`li click fail: ${e.message.split('\n')[0]}`));
for (const wait of [100, 400, 800, 1600]) {
  await page.waitForTimeout(wait);
  const ae = await page.evaluate(() => ({ tag: document.activeElement?.tagName, cls: (document.activeElement?.className||'').toString().slice(0,50) }));
  log(`+${wait}ms activeElement: ${JSON.stringify(ae)}`);
}
log('focusLog:');
for (const l of await page.evaluate(() => window.__focusLog.slice(-14))) log(`  ${l}`);
await browser.close();
