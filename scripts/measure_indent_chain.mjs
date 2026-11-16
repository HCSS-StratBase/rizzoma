#!/usr/bin/env node
// Walk the DOM chain from a parent blip-container to its child container and
// attribute each px of left-edge shift to the element/property causing it.
import { chromium } from 'playwright';
const baseUrl = 'https://dev.138-201-62-161.nip.io';
const log = m => console.log(`[chain] ${m}`);
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
await page.goto(`${baseUrl}/?layout=rizzoma#/topic/18fd97812660e69bf157d9dc5a023f42`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('.blip-thread-marker'))
      .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === '+')
      .forEach(m => m.click());
  });
  await page.waitForTimeout(1400);
}
const chain = await page.evaluate(() => {
  const containers = Array.from(document.querySelectorAll('.blip-container')).filter(el => el.offsetParent !== null);
  const byDepth = c => { let d = 0, p = c.parentElement; while (p) { if (p.classList?.contains('blip-container')) d++; p = p.parentElement; } return d; };
  const child = containers.find(c => byDepth(c) === 3);
  if (!child) return ['no depth-3 container'];
  const out = [];
  let el = child;
  let stop = null;
  let p = child.parentElement;
  while (p) { if (p.classList?.contains('blip-container')) { stop = p; break; } p = p.parentElement; }
  while (el && el !== stop.parentElement) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push(`x=${Math.round(r.x)} w=${Math.round(r.width)} ml=${cs.marginLeft} pl=${cs.paddingLeft} <${el.tagName.toLowerCase()}.${(el.className||'').toString().split(' ').slice(0,2).join('.').slice(0,45)}>`);
    if (el === stop) break;
    el = el.parentElement;
  }
  return out;
});
for (const l of chain) log(l);
const rowKids = await page.evaluate(() => {
  const containers = Array.from(document.querySelectorAll('.blip-container')).filter(el => el.offsetParent !== null);
  const byDepth = c => { let d = 0, p = c.parentElement; while (p) { if (p.classList?.contains('blip-container')) d++; p = p.parentElement; } return d; };
  const child = containers.find(c => byDepth(c) === 3);
  const row = child?.querySelector(':scope .blip-content-row');
  if (!row) return ['no row'];
  return Array.from(row.children).map(k => {
    const r = k.getBoundingClientRect();
    const cs = getComputedStyle(k);
    return `x=${Math.round(r.x)} w=${Math.round(r.width)} pos=${cs.position} <${k.tagName.toLowerCase()}.${(k.className||'').toString().split(' ').slice(0,3).join('.').slice(0,50)}>`;
  });
});
log('--- row children (depth-3) ---');
for (const l of rowKids) log(l);
await browser.close();
