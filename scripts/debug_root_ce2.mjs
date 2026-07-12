#!/usr/bin/env node
import { chromium } from 'playwright';
const baseUrl = process.env.RZ_BASE || 'https://138-201-62-161.nip.io';
const topicId = '0b997d49bf636cdd371819e13601e7ce';
const log = m => console.log(`[ce2] ${m}`);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('console', msg => { const t = msg.text(); if (!/contentEditable|DevTools|SW Hook|\[vite\]|\[api\] \/api\/(auth|topics\?|waves|blips\?|blips\/)/.test(t)) log(`console(${msg.type()}): ${t.slice(0,220)}`); });
page.on('pageerror', e => log(`PAGEERROR: ${String(e).slice(0,400)}`));
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
  const b = Array.from(document.querySelectorAll('button.topic-tb-btn')).find(x => /^edit$/i.test((x.textContent||'').trim()));
  b?.click();
});
await page.waitForTimeout(2500);
const before = await page.evaluate(() => ({
  containers: document.querySelectorAll('.blip-container').length,
  markers: document.querySelectorAll('.blip-thread-marker').length,
  editable: document.querySelectorAll('.topic-content-edit .ProseMirror[contenteditable="true"]').length,
}));
log(`in edit mode: ${JSON.stringify(before)}`);
// click into the editor's second list item (real click), End, Ctrl+Enter
const li = page.locator('.topic-content-edit .ProseMirror li').nth(1);
await li.click({ timeout: 5000 }).catch(e => log(`li real-click failed: ${e.message.split('\n')[0]}`));
await page.keyboard.press('End');
const focusInfo = await page.evaluate(() => {
  const ae = document.activeElement;
  window.__keyLog = [];
  window.addEventListener('keydown', e => window.__keyLog.push(`${e.ctrlKey?'Ctrl+':''}${e.key} → ${(document.activeElement?.className||'').toString().slice(0,50)}`), true);
  return { tag: ae?.tagName, cls: (ae?.className||'').toString().slice(0,60), editable: ae?.getAttribute?.('contenteditable') };
});
log(`activeElement before Ctrl+Enter: ${JSON.stringify(focusInfo)}`);
await page.keyboard.press('Control+Enter');
log('sent Ctrl+Enter');
await page.waitForTimeout(500);
log(`keyLog: ${JSON.stringify(await page.evaluate(() => window.__keyLog))}`);
log(`toasts: ${JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.toast, [class*=toast]')).map(t => t.textContent?.slice(0,60))))}`);
await page.waitForTimeout(5000);
const after = await page.evaluate(() => ({
  containers: document.querySelectorAll('.blip-container').length,
  markers: document.querySelectorAll('.blip-thread-marker').length,
  editableAnywhere: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(el => el.offsetParent !== null).length,
}));
log(`after Ctrl+Enter: ${JSON.stringify(after)}`);
// type into the new child and verify it lands + persists
await page.keyboard.type('hello from fable', { delay: 25 });
await page.waitForTimeout(2500);
const typed = await page.evaluate(() => {
  const ed = Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(el => el.offsetParent !== null).pop();
  return ed ? ed.textContent.slice(0, 60) : null;
});
log(`typed content in child editor: ${JSON.stringify(typed)}`);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const persisted = await page.evaluate(() => document.body.innerText.includes('hello from fable'));
log(`persists after reload: ${persisted}`);
await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/260709-root-ctrl-enter/05-ce2.png' });
await browser.close();
