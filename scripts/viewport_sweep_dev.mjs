#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = 'https://dev.138-201-62-161.nip.io';
const topicId = '0b997d49bf636cdd371819e13601e7ce';
const outDir = '/mnt/c/Rizzoma/screenshots/260709-single-active-verify';
await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

for (const w of [1280, 1366, 1440, 1600]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 950 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
  });
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 7000));
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      const m = Array.from(document.querySelectorAll('.blip-thread-marker'))
        .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === '+').pop();
      if (m) m.click();
    });
    await new Promise(r => setTimeout(r, 2000));
  }
  await page.screenshot({ path: `${outDir}/sweep-${w}.png`, fullPage: false });
  console.log(`shot at ${w}`);
  await ctx.close();
}
await browser.close();
