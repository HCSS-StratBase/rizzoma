#!/usr/bin/env node
import { chromium } from 'playwright';
const base = 'https://138-201-62-161.nip.io';
const topic = process.env.HB_TOPIC || '18fd97812660e69bf157d9dc5a044bdb';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
});
await page.goto(`${base}/?layout=rizzoma#/topic/${topic}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(7000);
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => {
    const m = Array.from(document.querySelectorAll('.blip-thread-marker')).filter(el => el.offsetParent !== null && (el.textContent||'').trim() === '+').pop();
    m?.click();
  });
  await page.waitForTimeout(1200);
}
const r = await page.evaluate(() => {
  const out = [];
  for (const lbl of ['L2 label', 'L4 label', 'L7 label']) {
    const el = Array.from(document.querySelectorAll('.blip-container')).find(c => (c.querySelector('.blip-text')?.textContent || '').trim().startsWith(lbl));
    if (!el) { out.push({ lbl, err: 'container not found' }); continue; }
    const text = el.querySelector('.blip-text');
    const bullet = el.querySelector(':scope > .blip-content .blip-bullet, :scope .blip-bullet');
    const br = bullet?.getBoundingClientRect();
    const tr = text?.getBoundingClientRect();
    out.push({
      lbl,
      bodyHTML: (text?.innerHTML || '').slice(0, 90),
      bulletRect: br ? { x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width) } : null,
      textRect: tr ? { x: Math.round(tr.x), y: Math.round(tr.y) } : null,
    });
  }
  return out;
});
for (const o of r) console.log(JSON.stringify(o));
await browser.close();
