#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const baseUrl = process.env.RZ_BASE || 'https://dev.138-201-62-161.nip.io';
const topicId = '0b997d49bf636cdd371819e13601e7ce';
const outDir = '/mnt/c/Rizzoma/screenshots/260709-single-active-verify';
await fs.mkdir(outDir, { recursive: true });
const log = m => console.log(`[ctrl-enter] ${m}`);
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
await new Promise(r => setTimeout(r, 7000));

// expand level 1, activate the child, enter edit
await page.evaluate(() => {
  const m = Array.from(document.querySelectorAll('.blip-thread-marker'))
    .filter(el => el.offsetParent !== null && (el.textContent || '').trim() === '+').pop();
  m?.click();
});
await new Promise(r => setTimeout(r, 2500));
const before = await page.evaluate(() => document.querySelectorAll('.blip-container').length);

await page.evaluate(() => {
  const c = Array.from(document.querySelectorAll('.blip-container.nested-blip')).filter(el => el.offsetParent !== null).pop();
  (c.querySelector('.blip-content') || c).dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 1200));
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('.blip-menu button')).filter(el => el.offsetParent !== null)
    .find(b => /edit/i.test(b.textContent || '') || /edit/i.test(b.getAttribute('title') || ''));
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise(r => setTimeout(r, 2000));

// focus the ProseMirror, put cursor at end of first line, Ctrl+Enter
const focused = await page.evaluate(() => {
  const ed = Array.from(document.querySelectorAll('.tiptap.ProseMirror, .ProseMirror'))
    .filter(el => el.offsetParent !== null && el.getAttribute('contenteditable') === 'true').pop();
  if (!ed) return false;
  ed.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  const li = ed.querySelector('li') || ed;
  range.selectNodeContents(li);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
});
log(`editor focused: ${focused}`);
await page.keyboard.press('Control+Enter');
await new Promise(r => setTimeout(r, 3500));
await page.screenshot({ path: `${outDir}/06-after-ctrl-enter.png`, fullPage: false });

const after = await page.evaluate(() => ({
  containers: document.querySelectorAll('.blip-container').length,
  editMenus: Array.from(document.querySelectorAll('.blip-menu.edit-menu')).filter(el => el.offsetParent !== null).length,
  editingEditors: Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(el => el.offsetParent !== null).length,
}));
log(`containers ${before} → ${after.containers}; editMenus=${after.editMenus}; editableEditors=${after.editingEditors}`);
const ok = after.containers > before && after.editMenus === 1;
log(ok ? 'PASS Ctrl+Enter creates inline subblip with single edit toolbar' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
