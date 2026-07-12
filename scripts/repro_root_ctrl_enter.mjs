#!/usr/bin/env node
// Reproduce SDS's manual flow on LIVE: open topic → click Edit (root) → Ctrl+Enter.
// REAL Playwright clicks/keys, not evaluate-dispatched events.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.RZ_BASE || 'https://138-201-62-161.nip.io';
const topicId = '0b997d49bf636cdd371819e13601e7ce';
const outDir = '/mnt/c/Rizzoma/screenshots/260709-root-ctrl-enter';
await fs.mkdir(outDir, { recursive: true });
const log = m => console.log(`[root-ce] ${m}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('console', msg => { if (/error/i.test(msg.type())) log(`console.${msg.type()}: ${msg.text().slice(0,150)}`); });
page.on('pageerror', e => log(`pageerror: ${String(e).slice(0,200)}`));

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: 'try-owner+try-1783562412806@example.com', password: 'Try!Owner-try-1783562412806' }) });
});
await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${outDir}/01-loaded.png` });

// REAL click on the root Edit button (the chip at top of the topic blip)
const editBtn = page.locator('.blip-menu button:has-text("Edit"), button:has-text("Edit")').first();
await editBtn.click({ timeout: 8000 }).catch(e => log(`edit click failed: ${e.message.split('\n')[0]}`));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/02-after-edit-click.png` });

const st1 = await page.evaluate(() => ({
  editableEditors: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(el => el.offsetParent !== null).length,
  editMenus: Array.from(document.querySelectorAll('.blip-menu.edit-menu')).filter(el => el.offsetParent !== null).length,
  containers: document.querySelectorAll('.blip-container').length,
}));
log(`after Edit click: ${JSON.stringify(st1)}`);

// REAL click into the first list item text, then Ctrl+Enter
const li = page.locator('.ProseMirror[contenteditable="true"] li').first();
await li.click({ timeout: 5000 }).catch(async e => {
  log(`li click failed: ${e.message.split('\n')[0]}`);
  await page.locator('.ProseMirror[contenteditable="true"]').first().click({ timeout: 5000 }).catch(() => log('editor click failed too'));
});
await page.waitForTimeout(800);
await page.keyboard.press('End');
await page.keyboard.press('Control+Enter');
log('pressed Ctrl+Enter');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outDir}/03-after-ctrl-enter.png` });

const st2 = await page.evaluate(() => ({
  containers: document.querySelectorAll('.blip-container').length,
  editableEditors: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(el => el.offsetParent !== null).length,
  markers: document.querySelectorAll('.blip-thread-marker').length,
}));
log(`after Ctrl+Enter: ${JSON.stringify(st2)} (was containers=${st1.containers})`);
log(st2.containers > st1.containers ? 'CHILD CREATED' : 'NO CHILD — BUG REPRODUCED');
await browser.close();
