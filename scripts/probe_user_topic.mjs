#!/usr/bin/env node
import { chromium } from 'playwright';
const base = 'https://138-201-62-161.nip.io';
const topic = '1784048217005';  // will resolve via search; user gave the title number
const OUT = '/mnt/c/Rizzoma/screenshots/260715-user-repro';
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const log = m => console.log(`[probe] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
// find the topic id whose title contains the number
const tid = await page.evaluate(async (num) => {
  const r = await fetch('/api/topics?limit=50&offset=0', { credentials: 'include' });
  const d = await r.json();
  const t = (d.topics || d).find(x => (x.title || '').includes(num));
  return t ? (t.id || t._id) : null;
}, topic);
log(`resolved topic id: ${tid}`);
await page.goto(`${base}/?layout=rizzoma#/topic/${tid}`, { waitUntil: 'domcontentloaded' });
await sleep(8000);
for (let i = 0; i < 6; i++) { await page.evaluate(() => { const m = Array.from(document.querySelectorAll('.blip-thread-marker')).filter(el=>el.offsetParent!==null&&(el.textContent||'').trim()==='+').pop(); m?.click(); }); await sleep(1200); }
await page.screenshot({ path: `${OUT}/01-expanded.png`, fullPage: false });

// PROBE 1: is the topic ROOT body (L1) bulleted?
const rootBody = await page.evaluate(() => {
  const topicBlip = document.querySelector('.blip-container.topic-root, .topic-blip-content, .blip-container');
  const bt = topicBlip?.querySelector('.blip-text');
  return { html: (bt?.innerHTML || '').slice(0, 200) };
});
log(`ROOT body html: ${rootBody.html}`);

// PROBE 2: the empty leading-bullet artifact. For an L2 container, dump its DIRECT children.
const artifact = await page.evaluate(() => {
  const c = Array.from(document.querySelectorAll('.blip-container')).find(x => ((x.querySelector('.blip-text')?.textContent)||'').trim().startsWith('L2 label'));
  if (!c) return { err: 'no L2' };
  const contentRow = c.querySelector(':scope > .blip-content, :scope .blip-content-row')?.parentElement || c;
  // find all bullets rendered inside this container and where they sit
  const bullets = Array.from(c.querySelectorAll('.blip-bullet')).map(b => {
    const r = b.getBoundingClientRect();
    const li = b.closest('li');
    return { x: Math.round(r.x), y: Math.round(r.y), inLi: !!li, ownerText: (b.parentElement?.textContent||'').trim().slice(0,20) };
  });
  // is there an empty .blip-content-row with a bullet but no text?
  const rows = Array.from(c.querySelectorAll('.blip-content-row')).map(row => ({
    text: (row.querySelector('.blip-main-content, .blip-text')?.textContent||'').trim().slice(0,20),
    hasBullet: !!row.querySelector('.blip-bullet'),
  }));
  return { bullets, rows };
});
log(`L2 artifact: ${JSON.stringify(artifact, null, 1)}`);

// PROBE 3: does the topic have a hashtag line?
const hashtags = await page.evaluate(() => document.body.innerText.match(/#\w+/g) || []);
log(`hashtags present: ${JSON.stringify(hashtags)}`);
await browser.close();
