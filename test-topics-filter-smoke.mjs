#!/usr/bin/env node
/**
 * Topics list filter: All, Inbox and By me narrow the list (real clicks on the dropdown, what the person sees).
 *
 * Why it exists (19 Nov 2026, suite case N12 and contract row 13.8): the original topics list has a filter for All, Inbox and
 * "By me"; the modernized list had none, so a person who is in many topics could not narrow the list to the ones they started.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-topics-filter-smoke.mjs   (HEADED=1 on a virtual display)
 *   (needs the local test database: the second person is seeded as a participant of the first topic)
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount, seedAcceptedParticipant } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const HEADED = process.env.HEADED === '1';
const RUN = Date.now().toString(36);
const SHOTS = process.env.SHOTS || '';
let shotNo = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };

const A = { email: `filter-a-${RUN}@example.com`, password: 'FilterTopics!1' };
const B = { email: `filter-b-${RUN}@example.com`, password: 'FilterTopics!1' };
await seedVerifiedE2EAccount(A.email, A.password);
await seedVerifiedE2EAccount(B.email, B.password);
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 110 : 0 });

async function signIn(user) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
  await page.getByPlaceholder('Email address').click(); await page.keyboard.press('Control+a'); await page.keyboard.type(user.email, { delay: 10 });
  await page.getByPlaceholder('Password', { exact: true }).click(); await page.keyboard.press('Control+a'); await page.keyboard.type(user.password, { delay: 10 });
  await page.locator('.submit-btn').click();
  await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
  await sleep(2500);
  return page;
}
async function createTopic(page, title) {
  await page.locator('.create-wave').first().click(); await sleep(900);
  await page.getByPlaceholder('What would you like to discuss?').click(); await page.keyboard.type(title, { delay: 15 });
  await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4000);
  return (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
}
async function shot(page, name) { if (!SHOTS) return; const fs = await import('node:fs'); fs.mkdirSync(SHOTS, { recursive: true }); shotNo += 1; await page.screenshot({ path: `${SHOTS}/${String(shotNo).padStart(2, '0')}-${name}.png` }); }

const pb = await signIn(B);
const theirs = await createTopic(pb, `ZZ SCRATCH suite filter theirs ${RUN}`);
await pb.locator('.write-reply-input').first().click(); await pb.keyboard.type('something to read', { delay: 40 }); await pb.keyboard.press('Enter'); await sleep(2500);
const pa = await signIn(A);
const mine = await createTopic(pa, `ZZ SCRATCH suite filter mine ${RUN}`);
await seedAcceptedParticipant(theirs, A.email, 'editor', 'e2e');
await pa.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(5000);

const rows = async () => (await pa.locator('.search-result-item').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
const sel = pa.locator('[data-testid="topics-filter"]');
check(await sel.count() > 0, 'the topics list has a filter dropdown');
if (await sel.count()) {
  const opts = await sel.locator('option').allInnerTexts();
  check(['All', 'Inbox', 'By me'].every((o) => opts.includes(o)), 'it offers All, Inbox and By me', opts.join(','));
  const all = await rows();
  check(all.some((t) => t.includes(`filter mine ${RUN}`)) && all.some((t) => t.includes(`filter theirs ${RUN}`)), 'All shows both topics');
  await sel.selectOption('mine'); await sleep(800);
  const m = await rows(); await shot(pa, 'by-me');
  check(m.some((t) => t.includes(`filter mine ${RUN}`)) && !m.some((t) => t.includes(`filter theirs ${RUN}`)), 'By me shows only the topic I created', JSON.stringify(m).slice(0, 140));
  await sel.selectOption('inbox'); await sleep(800);
  const inbox = await rows(); await shot(pa, 'inbox');
  check(inbox.some((t) => t.includes(`filter theirs ${RUN}`)) && !inbox.some((t) => t.includes(`filter mine ${RUN}`)), 'Inbox shows the topic with unread content from the other person and not my own read topic', JSON.stringify(inbox).slice(0, 140));
  await sel.selectOption('all'); await sleep(800);
  check((await rows()).length >= 2, 'back to All shows both again');
}

const api = (page, method, url) => page.evaluate(async ({ method, url }) => {
  const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  const r = await fetch(url, { method, headers: { 'x-csrf-token': csrf }, credentials: 'include' });
  return { status: r.status, text: await r.text() };
}, { method, url });
for (const [page, id] of [[pa, mine], [pb, theirs]]) {
  if (id) check((await api(page, 'DELETE', `/api/topics/${encodeURIComponent(id)}`)).status < 300, 'scratch topic deleted');
}
const left = await api(pa, 'GET', '/api/topics?limit=200&my=1');
check(!left.text.includes(`filter mine ${RUN}`) && !left.text.includes(`filter theirs ${RUN}`), 'no scratch topic of this run remains');
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall topics-filter checks passed');
process.exit(failed ? 1 : 0);
