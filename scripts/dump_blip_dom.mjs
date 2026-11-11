#!/usr/bin/env node
import { chromium } from 'playwright';
const base = 'https://138-201-62-161.nip.io';
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
await page.goto(`${base}/?layout=rizzoma#/topic/18fd97812660e69bf157d9dc5a06130e`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
for (let i=0;i<3;i++){ await page.evaluate(()=>{const m=Array.from(document.querySelectorAll('.blip-thread-marker')).filter(el=>el.offsetParent!==null&&(el.textContent||'').trim()==='+').pop();m?.click();});await page.waitForTimeout(1000);}
const dump = await page.evaluate(() => {
  const c = Array.from(document.querySelectorAll('.blip-container')).find(x => ((x.querySelector('.blip-text')?.textContent)||'').trim().startsWith('L2 label'));
  if (!c) return 'no L2';
  // shallow structure: tag.class of each element down to first .blip-text, with rects
  const walk = (el, depth) => {
    if (depth > 6) return '';
    const r = el.getBoundingClientRect();
    const cls = (el.className||'').toString().split(' ').filter(Boolean).slice(0,2).join('.');
    const txt = el.children.length===0 ? (el.textContent||'').trim().slice(0,18) : '';
    let s = `${'  '.repeat(depth)}<${el.tagName.toLowerCase()}${cls?'.'+cls:''}> y=${Math.round(r.y)} h=${Math.round(r.height)} ${txt?'"'+txt+'"':''}\n`;
    for (const ch of el.children) if (ch.getBoundingClientRect().height >= 0) s += walk(ch, depth+1);
    return s;
  };
  return walk(c, 0);
});
console.log(dump);
await browser.close();
