#!/usr/bin/env node
/**
 * Regression smoke: the Publics tab shows the original's tag filter row (parity rows 016, 080, 302). A person makes two topics public, one
 * tagged #alpha<run>, one #beta<run> (Share dialog, "Public on the web"); a second person opens Publics, sees both tags, clicks one and the
 * list narrows to that topic, clicks it again and both are back. Real clicks and typing, headless Chromium.
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-public-tags-smoke.mjs   (SHOTS=<dir> keeps screenshots)
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const SHOTS = process.env.SHOTS || '';
const RUN = Date.now().toString(36);
const PASS = 'PublicTags!1';
const A = `pt-a-${RUN}@example.com`; const B = `pt-b-${RUN}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
await seedVerifiedE2EAccount(A, PASS); await seedVerifiedE2EAccount(B, PASS);
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
async function person(email) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage(); page.setDefaultTimeout(15000);
  await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
  await page.getByPlaceholder('Email address').click(); await page.keyboard.press('Control+a'); await page.keyboard.type(email, { delay: 10 });
  await page.getByPlaceholder('Password', { exact: true }).click(); await page.keyboard.press('Control+a'); await page.keyboard.type(PASS, { delay: 10 });
  await page.locator('.submit-btn').click(); await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }); await sleep(2500);
  return page;
}
const a = await person(A); const b = await person(B);
const ids = [];
for (const tag of [`#alpha${RUN}`, `#beta${RUN}`]) {
  await a.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
  await a.locator('.create-wave').first().click(); await sleep(900);
  await a.getByPlaceholder('What would you like to discuss?').click(); await a.keyboard.type(`ZZ SCRATCH suite public ${tag}`, { delay: 10 });
  await a.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
  ids.push((/#\/topic\/([^/?]+)/.exec(await a.evaluate(() => location.hash)) || [])[1]);
  await a.locator('.share-btn').click(); await sleep(1200);
  await a.getByText('Public on the web').first().click(); await sleep(500);
  await a.getByRole('button', { name: 'Save' }).first().click(); await sleep(2500);
}
await b.getByText('Publics', { exact: true }).first().click(); await sleep(1500);
await b.waitForFunction(() => !/Loading public topics/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => undefined); await sleep(1200);
if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await b.screenshot({ path: `${SHOTS}/1-publics-tags.png` }); }
const tags = await b.locator('[data-testid="public-tag"]').allInnerTexts();
check(tags.includes(`#alpha${RUN}`) && tags.includes(`#beta${RUN}`), 'the Publics tab shows a row of tags used by the public topics', tags.join(','));
await b.locator('[data-testid="public-tag"]', { hasText: `#alpha${RUN}` }).first().click(); await sleep(600);
if (SHOTS) await b.screenshot({ path: `${SHOTS}/2-publics-filtered.png` });
let rows = await b.locator('.topic-item').allInnerTexts();
check(rows.length === 1 && rows[0].includes(`#alpha${RUN}`), 'clicking a tag narrows the list to the topics carrying it', JSON.stringify(rows).slice(0, 120));
await b.locator('[data-testid="public-tag"]', { hasText: `#alpha${RUN}` }).first().click(); await sleep(600);
rows = await b.locator('.topic-item').allInnerTexts();
check(rows.some((r) => r.includes(`#alpha${RUN}`)) && rows.some((r) => r.includes(`#beta${RUN}`)), 'clicking it again brings both topics back');
for (const id of ids) await a.evaluate(async (t) => { const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : ''; await fetch(`/api/topics/${encodeURIComponent(t)}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' }); }, id);
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall public-tag checks passed');
process.exit(failed ? 1 : 0);
