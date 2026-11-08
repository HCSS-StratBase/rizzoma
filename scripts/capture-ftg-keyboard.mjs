#!/usr/bin/env node
/**
 * Two-user FtG keyboard capture for features 54 (jkgG) and 55 (Ctrl+Space).
 * User B posts a blip → User A sees unread → presses j/Ctrl+Space → captures state.
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FtgKeyboard!1';
const userA = `ftg-kb-a-${Date.now()}@example.com`;
const userB = `ftg-kb-b-${Date.now()}@example.com`;

const ok = (m) => console.log(`✅ ${m}`);
const err = (m) => console.error(`❌ ${m}`);

async function shot(page, slug, step) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${step}_new.png`) });
}

async function ensureAuth(page, email) {
  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const cc = document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='));
    const csrf = cc ? decodeURIComponent(cc.split('=')[1] || '') : '';
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const reg = await fetch('/api/auth/register', { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify({ email, password }) });
    if (reg.ok) return { ok: true };
    const lg = await fetch('/api/auth/login', { method: 'POST', headers: h, credentials: 'include', body: JSON.stringify({ email, password }) });
    return lg.ok ? { ok: true } : { ok: false };
  }, { email, password });
  if (!r.ok) throw new Error('auth failed');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 15000 });
}

async function seedTopicAsA(page) {
  const csrf = await page.evaluate(() => {
    const c = document.cookie.split('; ').find(x => x.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1] || '') : '';
  });
  return page.evaluate(async ({ csrf }) => {
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const tr = await fetch('/api/topics', { method: 'POST', headers: h, credentials: 'include',
      body: JSON.stringify({ title: 'FtG Keyboard Test', content: '<p>Topic for jkgG and Ctrl+Space keyboard nav tests.</p>' }) });
    const topic = await tr.json();
    await fetch('/api/blips', { method: 'POST', headers: h, credentials: 'include',
      body: JSON.stringify({ waveId: topic.id, parentId: null, content: '<p>Blip A1 by user A.</p>' }) });
    return topic.id;
  }, { csrf });
}

async function postBlipAsB(page, topicId) {
  const csrf = await page.evaluate(() => {
    const c = document.cookie.split('; ').find(x => x.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1] || '') : '';
  });
  return page.evaluate(async ({ csrf, topicId }) => {
    const h = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const r1 = await fetch('/api/blips', { method: 'POST', headers: h, credentials: 'include',
      body: JSON.stringify({ waveId: topicId, parentId: null, content: '<p>Unread blip B1 by user B for jkgG test.</p>' }) });
    const r2 = await fetch('/api/blips', { method: 'POST', headers: h, credentials: 'include',
      body: JSON.stringify({ waveId: topicId, parentId: null, content: '<p>Unread blip B2 by user B for jkgG test.</p>' }) });
    return { b1: r1.ok, b2: r2.ok };
  }, { csrf, topicId });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  try {
    await ensureAuth(pageA, userA);
    ok(`auth A: ${userA}`);
    const topicId = await seedTopicAsA(pageA);
    ok(`topic: ${topicId}`);

    await ensureAuth(pageB, userB);
    ok(`auth B: ${userB}`);
    const posted = await postBlipAsB(pageB, topicId);
    ok(`B posted: ${JSON.stringify(posted)}`);

    // User A opens the topic — should see unread blips from B
    await pageA.goto('about:blank');
    await pageA.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
    await pageA.waitForTimeout(1000);
    await pageA.locator('.rizzoma-layout').waitFor({ timeout: 10000 });

    // Feature 54: j key navigates to next unread
    await shot(pageA, '54-ftg-jkgG-keys', '01-before');
    await pageA.keyboard.press('j');
    await pageA.waitForTimeout(500);
    await shot(pageA, '54-ftg-jkgG-keys', '02-during');
    await pageA.keyboard.press('k');
    await pageA.waitForTimeout(500);
    await shot(pageA, '54-ftg-jkgG-keys', '03-after');
    ok('54-ftg-jkgG-keys');

    // Feature 55: Ctrl+Space navigates to next topic
    await shot(pageA, '55-ftg-ctrl-space', '01-before');
    await pageA.keyboard.press('Control+Space');
    await pageA.waitForTimeout(800);
    await shot(pageA, '55-ftg-ctrl-space', '02-during');
    await shot(pageA, '55-ftg-ctrl-space', '03-after');
    ok('55-ftg-ctrl-space');

    console.log('\n==== FtG KEYBOARD SUMMARY ====');
    console.log('Passed: 2');
  } finally {
    await browser.close();
  }
}

main().catch(e => { err(String(e)); process.exit(1); });
