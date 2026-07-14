#!/usr/bin/env node
// Standalone two-client realtime capture → 041-real-time-cursor-and-typing-indicator-visible.png
import { chromium } from 'playwright';
const baseUrl = 'https://138-201-62-161.nip.io';
const SWEEP = process.env.RIZZOMA_SWEEP_DIR || '/mnt/c/Rizzoma/screenshots/260714-021500-feature-sweep';
const stamp = Date.now();
const ownerEmail = `rt-owner+${stamp}@example.com`;
const obsEmail = `rt-obs+${stamp}@example.com`;
const pw = 'Rt!Pair-260714';
const log = m => console.log(`[rt] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
async function client(email) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async ({ email, pw }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const h = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    let resp = await fetch('/api/auth/register', { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify({ email, password: pw }) });
    if (!resp.ok) resp = await fetch('/api/auth/login', { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify({ email, password: pw }) });
    return resp.ok;
  }, { email, pw });
  log(`auth ${email}: ${r}`);
  return { ctx, page };
}
const api = (page, method, apiPath, body) => page.evaluate(async ({ method, apiPath, body }) => {
  const raw = document.cookie.split('; ').find(e => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  const resp = await fetch(apiPath, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await resp.json(); } catch {}
  return { ok: resp.ok, status: resp.status, data };
}, { method, apiPath, body });

const owner = await client(ownerEmail);
const topic = await api(owner.page, 'POST', '/api/topics', { title: `RT fixture ${stamp}`, content: '<h1>RT fixture</h1>' });
const waveId = topic.data?.id || topic.data?._id;
log(`topic: ${topic.status} ${waveId}`);
const blip = await api(owner.page, 'POST', '/api/blips', { waveId, content: '<ul><li><p>realtime fixture line</p></li></ul>', parentId: null });
const blipId = blip.data?.id || blip.data?._id;
log(`blip: ${blip.status} ${blipId}`);
await api(owner.page, 'POST', `/api/waves/${encodeURIComponent(waveId)}/participants`, { emails: [obsEmail], message: 'rt' });

const obs = await client(obsEmail);
for (const [name, page] of [['owner', owner.page], ['observer', obs.page]]) {
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${waveId}`, { waitUntil: 'domcontentloaded' });
  await sleep(7000);
  const main = page.locator(`[data-blip-id="${blipId}"]`).first();
  await main.waitFor({ timeout: 20000 });
  await page.evaluate(id => {
    const el = document.querySelector(`[data-blip-id="${id}"]`);
    el?.scrollIntoView({ block: 'center' });
  }, blipId);
  await sleep(600);
  await main.locator('.blip-collapsed-row').click({ timeout: 4000 }).catch(async e => {
    log(`${name} collapsed-row real click failed (${e.message.split('\n')[0]}); dispatching`);
    await page.evaluate(id => {
      const el = document.querySelector(`[data-blip-id="${id}"]`);
      const row = el?.querySelector('.blip-collapsed-row');
      (row || el)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, blipId);
  });
  await sleep(1200);
  const st1 = await page.evaluate(id => {
    const el = document.querySelector(`[data-blip-id="${id}"]`);
    return { cls: el?.className.slice(0, 90), hasContent: !!el?.querySelector('.blip-content'), menus: el?.querySelectorAll('.blip-menu').length };
  }, blipId);
  log(`${name} after expand: ${JSON.stringify(st1)}`);
  await main.locator('.blip-content').first().click({ timeout: 4000 }).catch(async e => {
    log(`${name} content real click failed; dispatching`);
    await page.evaluate(id => {
      const el = document.querySelector(`[data-blip-id="${id}"]`);
      (el?.querySelector('.blip-content') || el)?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, blipId);
  });
  await sleep(1200);
  const st2 = await page.evaluate(id => {
    const el = document.querySelector(`[data-blip-id="${id}"]`);
    return { active: el?.className.includes('active'), readSurface: !!el?.querySelector('[data-testid="blip-menu-read-surface"]'), editSurface: !!el?.querySelector('[data-testid="blip-menu-edit-surface"]') };
  }, blipId);
  log(`${name} after content click: ${JSON.stringify(st2)}`);
  if (!st2.editSurface) {
    await main.locator('[data-testid="blip-menu-edit"]').first().click({ timeout: 8000 }).catch(e => log(`${name} edit click: ${e.message.split('\n')[0]}`));
    await sleep(1500);
  }
  const st3 = await page.evaluate(id => {
    const el = document.querySelector(`[data-blip-id="${id}"]`);
    return { editSurface: !!el?.querySelector('[data-testid="blip-menu-edit-surface"]'), editable: !!el?.querySelector('.ProseMirror[contenteditable="true"]') };
  }, blipId);
  log(`${name} edit state: ${JSON.stringify(st3)}`);
}
// observer types; owner should see remote cursor/typing indicator
await obs.page.locator(`[data-blip-id="${blipId}"] .ProseMirror[contenteditable="true"]`).first().click({ timeout: 5000 }).catch(() => {});
await obs.page.keyboard.press('End');
await obs.page.keyboard.type(' remote typing evidence', { delay: 50 });
log('observer typed');
const seen = await owner.page.locator('.collaboration-cursor, .typing-indicator, [class*="collaboration-cursor"], [class*="typing"]').first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
log(`owner sees remote cursor/typing: ${seen}`);
await sleep(1000);
await owner.page.screenshot({ path: `${SWEEP}/041-real-time-cursor-and-typing-indicator-visible.png`, fullPage: false });
log(`saved 041-real-time-cursor-and-typing-indicator-visible.png (seen=${seen})`);
await browser.close();
process.exit(seen ? 0 : 1);
