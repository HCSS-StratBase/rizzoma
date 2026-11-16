#!/usr/bin/env node
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto('https://dev.138-201-62-161.nip.io', { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
});
await page.goto('https://dev.138-201-62-161.nip.io/?layout=rizzoma#/topic/18fd97812660e69bf157d9dc5a023f42', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
for (let i = 0; i < 12; i++) {
  const n = await page.evaluate(() => {
    const ms = Array.from(document.querySelectorAll('.blip-thread-marker')).filter(el => el.offsetParent !== null && (el.textContent || '').trim() === '+');
    ms.forEach(m => m.click());
    return ms.length;
  });
  await page.waitForTimeout(1400);
  if (n === 0) break;
}
await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/260714-blb-layout/after-fix-v2-depth10.png', fullPage: false });
console.log('saved after-fix-v2-depth10.png');
await browser.close();
