#!/usr/bin/env node
/**
 * Reproduce the dead-"+" subblip bug on LIVE master (138-201-62-161.nip.io).
 * Logs in with the Try-topic test account, opens the depth-10 Try topic,
 * clicks the first inline [+] marker, screenshots before/after.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RZ_BASE || 'https://138-201-62-161.nip.io';
const topicId = '0b997d49bf636cdd371819e13601e7ce';
const ownerEmail = 'try-owner+try-1783562412806@example.com';
const ownerPassword = 'Try!Owner-try-1783562412806';
const outDir = process.env.RZ_OUT || '/mnt/c/Rizzoma/screenshots/260709-live-subblip-repro';

const log = m => console.log(`[repro] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await fs.mkdir(outDir, { recursive: true });
const shot = f => page.screenshot({ path: path.join(outDir, f), fullPage: false });

// 1. login via API
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async ({ email, password }) => {
  const headers = { 'Content-Type': 'application/json' };
  const login = await fetch('/api/auth/login', { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ email, password }) });
  return { ok: login.ok, status: login.status };
}, { email: ownerEmail, password: ownerPassword });
log(`login: ${JSON.stringify(r)}`);
if (!r.ok) { await shot('00-login-failed.png'); await browser.close(); process.exit(2); }

// 2. open the Try topic
await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
await sleep(6000);
await shot('01-topic-loaded.png');

// 3. inventory: inline [+] markers / blip threads
const inv = await page.evaluate(() => {
  const q = s => document.querySelectorAll(s).length;
  return {
    plusMarkers: q('.inline-blip-marker, .blip-thread .fold-button, [data-inline-blip], .rizzoma-inline-plus'),
    blipThreads: q('.blip-thread'),
    foldButtons: q('.fold-button'),
    blipContainers: q('.blip-container'),
    anyPlusText: Array.from(document.querySelectorAll('button, span'))
      .filter(el => el.textContent.trim() === '+' && el.offsetParent !== null).length,
    bodySnippet: document.querySelector('.rizzoma-topic-detail, main')?.className || 'n/a',
  };
});
log(`inventory: ${JSON.stringify(inv)}`);

// 4. click the first visible "+" and observe
const plus = page.locator('button:has-text("+"), span:has-text("+")').first();
try {
  await plus.click({ timeout: 5000 });
  log('clicked first "+"');
} catch (e) {
  log(`could not click "+": ${e.message.split('\n')[0]}`);
}
await sleep(3000);
await shot('02-after-plus-click.png');

const after = await page.evaluate(() => ({
  expandedChildren: document.querySelectorAll('.blip-thread .blip-container, .inline-blip-expanded').length,
  blipContainers: document.querySelectorAll('.blip-container').length,
}));
log(`after click: ${JSON.stringify(after)}`);

await browser.close();
log(`screenshots in ${outDir}`);
