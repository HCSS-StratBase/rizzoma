#!/usr/bin/env node
// Measure per-depth box geometry of the depth-10 fixture (staging).
import { chromium } from 'playwright';
const baseUrl = process.env.RZ_BASE || 'https://dev.138-201-62-161.nip.io';
const log = m => console.log(`[geo] ${m}`);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
});
const topics = await page.evaluate(async () => {
  const r = await fetch('/api/topics?limit=30&offset=0', { credentials: 'include' });
  const d = await r.json();
  return (d.topics || d).map(t => ({ id: t.id || t._id, title: t.title || '' }));
});
const fx = topics.find(t => /BLB Fractal d10/i.test(t.title));
log(`fixture: ${fx?.title} ${fx?.id}`);
await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${fx.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
for (let i = 0; i < 12; i++) {
  const n = await page.evaluate(() => {
    const ms = Array.from(document.querySelectorAll('.blip-thread-marker'))
      .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === '+');
    ms.forEach(m => m.click());
    return ms.length;
  });
  await page.waitForTimeout(1500);
  if (n === 0) break;
}
const geo = await page.evaluate(() => {
  const out = [];
  const containers = Array.from(document.querySelectorAll('.blip-container')).filter(el => el.offsetParent !== null);
  for (const c of containers) {
    let d = 0, p = c.parentElement;
    while (p) { if (p.classList?.contains('blip-container')) d++; p = p.parentElement; }
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    out.push({ depth: d, x: Math.round(r.x), w: Math.round(r.width), ml: cs.marginLeft, pl: cs.paddingLeft, bl: cs.borderLeftWidth + ' ' + cs.borderLeftStyle + ' ' + cs.borderLeftColor.slice(0, 18) });
  }
  return out.sort((a, b) => a.depth - b.depth);
});
for (const g of geo) log(JSON.stringify(g));
await page.screenshot({ path: '/mnt/c/Rizzoma/screenshots/260714-blb-layout/before-ladder.png', fullPage: false });
log('shot: before-ladder.png');
await browser.close();
