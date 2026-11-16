#!/usr/bin/env node
import { chromium } from 'playwright';
const baseUrl = 'https://dev.138-201-62-161.nip.io';
const topicId = '0b997d49bf636cdd371819e13601e7ce';
const log = m => console.log(`[br] ${m}`);
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
  window.__claims = [];
  window.addEventListener('rizzoma:active-blip-claim', e => window.__claims.push(`${Date.now() % 100000}: ${e.detail?.blipId}`));
});
const moduleCheck = await page.evaluate(async () => {
  const r = await fetch('/components/RizzomaTopicDetail.tsx');
  const t = await r.text();
  return { status: r.status, hasBridge: t.includes('topic-editor:'), hasClaim: t.includes('ACTIVE_BLIP_CLAIM_EVENT'), len: t.length };
});
log(`module check: ${JSON.stringify(moduleCheck)}`);
await page.evaluate(() => {
  const b = Array.from(document.querySelectorAll('button.topic-tb-btn')).find(x => /^edit$/i.test((x.textContent||'').trim()));
  b?.click();
});
await page.waitForTimeout(2500);
log(`claims after Edit: ${JSON.stringify(await page.evaluate(() => window.__claims))}`);
const li = page.locator('.topic-content-edit .ProseMirror li').first();
await li.click({ timeout: 5000 }).catch(e => log(`li click: ${e.message.split('\n')[0]}`));
await page.keyboard.press('End');
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(6000);
const st = await page.evaluate(() => ({
  claims: window.__claims,
  editors: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(el => el.offsetParent !== null).map(el => ({
    inTopicEdit: !!el.closest('.topic-content-edit'),
    blip: el.closest('[data-blip-id]')?.getAttribute('data-blip-id')?.slice(-14) || null,
  })),
  isEditingTopic: !!document.querySelector('.topic-content-edit'),
}));
log(JSON.stringify(st, null, 1));
await browser.close();
