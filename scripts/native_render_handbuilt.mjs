#!/usr/bin/env node
// Render the HAND-BUILT depth-10 topic through the NATIVE path (?render=native)
// and compare against the React path. Read-only: no edits.
import { chromium } from 'playwright';
import fs from 'node:fs';
const base = 'https://138-201-62-161.nip.io';
const topic = '18fd97812660e69bf157d9dc5a04da07'; // run-4 hand-built d10
const OUT = '/mnt/c/Rizzoma/screenshots/260714-native-vs-react';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', e => console.log(`[nat] PAGEERROR: ${String(e).slice(0, 160)}`));
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
});
for (const mode of ['native', 'react']) {
  await page.goto(`${base}/?layout=rizzoma&render=${mode}#/topic/${topic}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  const st = await page.evaluate(() => ({
    nativeMode: !!document.querySelector('.rizzoma-native-mode'),
    blipThreads: document.querySelectorAll('.blip-thread').length,
    folded: document.querySelectorAll('.blip-thread.folded').length,
    reactContainers: document.querySelectorAll('.blip-container').length,
    labelsVisible: [1,2,3,4,5,6,7,8,9,10].filter(i => document.body.innerText.includes(`L${i} label`)),
  }));
  console.log(`[nat] ${mode}: ${JSON.stringify(st)}`);
  await page.screenshot({ path: `${OUT}/${mode}-collapsed.png`, fullPage: false });
  // unfold everything the native way (CSS-class fold buttons) / react way (markers)
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => {
      const nat = Array.from(document.querySelectorAll('.blip-thread.folded .fold-button, .blip-thread.folded .js-fold-button'));
      if (nat.length) { nat.forEach(b => b.dispatchEvent(new MouseEvent('click', { bubbles: true }))); return; }
      const m = Array.from(document.querySelectorAll('.blip-thread-marker')).filter(el => el.offsetParent !== null && (el.textContent||'').trim() === '+').pop();
      m?.click();
    });
    await page.waitForTimeout(1100);
  }
  const st2 = await page.evaluate(() => ({
    labelsVisible: [1,2,3,4,5,6,7,8,9,10].filter(i => document.body.innerText.includes(`L${i} label`)),
    threads: document.querySelectorAll('.blip-thread').length,
  }));
  console.log(`[nat] ${mode} expanded: ${JSON.stringify(st2)}`);
  await page.screenshot({ path: `${OUT}/${mode}-expanded.png`, fullPage: false });
}
await browser.close();
