#!/usr/bin/env node
// Reproduce SDS's action: click into L3 label, place cursor, Ctrl+Enter (as old Rizzoma).
import { chromium } from 'playwright';
const base = process.env.RZ_BASE || 'https://138-201-62-161.nip.io';
const topic = process.env.RZ_TOPIC || '18fd97812660e69bf157d9dc5a06130e';
const OUT = '/mnt/c/Rizzoma/screenshots/260715-nested-cursor-ce';
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const log = m => console.log(`[ce] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', e => log(`PAGEERROR: ${String(e).slice(0,120)}`));
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
});
await page.goto(`${base}/?layout=rizzoma#/topic/${topic}`, { waitUntil: 'domcontentloaded' });
await sleep(8000);
for (let i=0;i<4;i++){ await page.evaluate(()=>{const m=Array.from(document.querySelectorAll('.blip-thread-marker')).filter(el=>el.offsetParent!==null&&(el.textContent||'').trim()==='+').pop();m?.click();});await sleep(1000);}
await page.screenshot({ path: `${OUT}/01-expanded.png` });
const before = await page.evaluate(()=>document.querySelectorAll('.blip-container').length);

// find the "L3 label" text on screen and REAL-click on it to place cursor
const l3 = page.locator('.blip-text li', { hasText: 'L3 label' }).first();
const cnt = await l3.count();
log(`L3 label locator count: ${cnt}`);
await l3.click({ timeout: 6000 }).catch(e => log(`L3 real click failed: ${e.message.split('\n')[0]}`));
await sleep(1500);
const afterClick = await page.evaluate(()=>({
  editable: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(e=>e.offsetParent!==null).length,
  focused: (document.activeElement?.className||'').toString().includes('ProseMirror'),
  activeText: (document.activeElement?.textContent||'').slice(0,30),
}));
log(`after clicking L3: ${JSON.stringify(afterClick)}`);
await page.screenshot({ path: `${OUT}/02-clicked-L3.png` });

// press Ctrl+Enter (as old Rizzoma)
await page.keyboard.press('Control+Enter');
await sleep(4000);
const after = await page.evaluate(()=>({
  containers: document.querySelectorAll('.blip-container').length,
  editable: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(e=>e.offsetParent!==null).length,
}));
log(`after Ctrl+Enter: containers ${before}→${after.containers}, editable=${after.editable}`);
log(after.containers > before ? 'CHILD CREATED' : 'NO CHILD — BUG REPRODUCED');
await page.screenshot({ path: `${OUT}/03-after-ctrl-enter.png` });
await browser.close();
