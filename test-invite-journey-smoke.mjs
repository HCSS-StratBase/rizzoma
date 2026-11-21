#!/usr/bin/env node
/**
 * Regression smoke: the whole e-mail invitation journey as real people, with the exact link from the invitation mail.
 *   a) a new person with no account opens the link, creates an account for the invited address and lands IN the topic, can type
 *   b) an existing user, signed out: link, e-mail/password sign-in, lands in the topic
 *   c) an existing user already signed in as the invited address
 *   d) signed in as a DIFFERENT address than invited: a clear message, no access
 *   e) a provider sign-in (Google): the OAuth callback lands on /?layout=rizzoma, not on the topic; the pending invitation must still
 *      redeem and put the person in the topic
 *   f) a used link and a link of a deleted topic: a clear message
 * Needs the app's SMTP_HOST/SMTP_PORT pointed at a capturing sink (scripts/tester-scenarios/mail-sink.mjs <port> <dir>), MAIL_DIR=<dir>.
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3144 COUCHDB_URL=... MAIL_DIR=... SHOTS=<dir> node test-invite-journey-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const MAIL_DIR = process.env.MAIL_DIR || '';
const SHOTS = process.env.SHOTS || '';
if (!MAIL_DIR) { console.log('MAIL_DIR (the capturing SMTP sink directory) is required'); process.exit(2); }
const RUN = Date.now().toString(36);
const PW = 'InviteJourney!12';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const ctxs = [];
async function person(name) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } }); ctxs.push(context);
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const shot = async (n) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${n}.png`) }); };
  return { context, page, shot };
}
async function signIn(p, email, password) {
  await p.page.getByPlaceholder('Email address').click(); await p.page.keyboard.press('Control+a'); await p.page.keyboard.type(email, { delay: 5 });
  await p.page.getByPlaceholder('Password', { exact: true }).click(); await p.page.keyboard.press('Control+a'); await p.page.keyboard.type(password, { delay: 5 });
  await p.page.locator('.submit-btn').click();
}
const api = (p, method, url, body) => p.page.evaluate(async ({ method, url, body }) => {
  const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  if (!raw) await fetch('/api/auth/csrf', { credentials: 'include' });
  const r2 = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  const csrf = r2 ? decodeURIComponent(r2.split('=')[1] || '') : '';
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, json: j };
}, { method, url, body });
function latestInviteLink(toEmail) {
  const files = fs.readdirSync(MAIL_DIR).filter((f) => f.endsWith('.eml')).sort().reverse();
  for (const f of files) {
    let raw = fs.readFileSync(path.join(MAIL_DIR, f), 'latin1');
    raw = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (!raw.toLowerCase().includes(`to: ${toEmail.toLowerCase()}`) && !raw.toLowerCase().includes(`<${toEmail.toLowerCase()}>`)) continue;
    const m = /https?:\/\/[^\s"'<>]+#\/topic\/[^\s"'<>]+invite=[A-Za-z0-9_-]+/.exec(raw);
    if (m) return m[0].replace(/&amp;/g, '&');
  }
  return null;
}
async function waitLink(email) { for (let i = 0; i < 20; i += 1) { const l = latestInviteLink(email); if (l) return l; await sleep(500); } return null; }

// owner and a topic
const ownerEmail = `own-${RUN}@example.com`; await seedVerifiedE2EAccount(ownerEmail, PW);
const owner = await person('owner');
await owner.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(2500);
await signIn(owner, ownerEmail, PW); await owner.page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }); await sleep(1500);
async function newTopic(title) {
  const r = await api(owner, 'POST', '/api/topics', { title, content: `<p>${title}</p>` });
  const id = r.json?.id || r.json?._id; if (!id) throw new Error(`topic create failed ${r.status}`);
  const b = await api(owner, 'POST', '/api/blips', { waveId: id, parentId: null, content: `<ul><li><p>Welcome ${title}</p></li></ul>` }).catch(() => null);
  return id;
}
async function invite(id, email) { const r = await api(owner, 'POST', `/api/waves/${id}/participants`, { emails: [email], role: 'editor' }); if (r.status >= 300) throw new Error(`invite ${r.status}`); return waitLink(email); }
const inTopic = async (p, id) => { await p.page.waitForFunction((tid) => location.hash.includes(tid), id, { timeout: 15000 }).catch(() => undefined); await sleep(3500); return p.page.locator('.rizzoma-topic-detail, .topic-detail, .blip-container, [data-testid="topic-title"]').first().isVisible().catch(() => false); };

// a) a new person with no account
{
  const email = `new-${RUN}@example.com`; const id = await newTopic(`ZZ SCRATCH invite a ${RUN}`); const link = await invite(id, email);
  check(!!link, 'a) the invitation mail carries a join link', String(link).slice(0, 90));
  const p = await person('a-new'); await p.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(3500); await p.shot('1-link-opened');
  check(!/invite=/.test(p.page.url()), 'a) the token is not left in the address bar');
  const signup = p.page.getByText('Sign up').first(); if (await signup.count()) await signup.click(); await sleep(600);
  await p.page.getByPlaceholder('Email address').click(); await p.page.keyboard.press('Control+a'); await p.page.keyboard.type(email, { delay: 5 });
  await p.page.getByPlaceholder('Password', { exact: true }).click(); await p.page.keyboard.press('Control+a'); await p.page.keyboard.type(PW, { delay: 5 });
  await p.shot('2-register-form');
  await p.page.locator('.submit-btn').click(); await sleep(6000); await p.shot('3-after-create-account');
  const ok = await inTopic(p, id); await p.shot('4-in-topic');
  check(ok && p.page.url().includes(id), 'a) new person created the account and is IN the invited topic', p.page.url().slice(-60));
  const parts = await api(owner, 'GET', `/api/waves/${id}/participants`);
  check(JSON.stringify(parts.json || {}).includes(email), 'a) the owner sees the new person as a participant', String(parts.status));
}
// b) existing user, signed out
{
  const email = `old-${RUN}@example.com`; await seedVerifiedE2EAccount(email, PW); const id = await newTopic(`ZZ SCRATCH invite b ${RUN}`); const link = await invite(id, email);
  const p = await person('b-existing'); await p.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(3500); await p.shot('1-link-signed-out');
  // the link opens SIGN IN first (an existing user needs no detour)
  const first = (await p.page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(/Sign in to continue/i.test(first) && !/Create an account/i.test(first), 'b) an invitation link opens the sign-in form first', first.slice(0, 40));
  await signIn(p, email, PW);
  await sleep(7000); await p.shot('3-after-sign-in');
  check(await inTopic(p, id), 'b) existing user signed out: link, sign-in, lands in the topic', p.page.url().slice(-60));
  // f1) the same link a second time (used token)
  const p2 = await person('f-used'); await p2.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(2000); await signIn(p2, email, PW); await p2.page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
  await p2.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(5000); await p2.shot('1-used-link');
  const txt = (await p2.page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(await inTopic(p2, id) || /already|used|invalid|expired/i.test(txt), 'f) a used link still opens the topic for its owner or says clearly why not', txt.slice(0, 100));
}
// b2) an existing user who ends up on the sign-up form is sent on to sign in, not left on a registration error
{
  const email = `old2-${RUN}@example.com`; await seedVerifiedE2EAccount(email, PW); const id = await newTopic(`ZZ SCRATCH invite b2 ${RUN}`); const link = await invite(id, email);
  const p = await person('b2-signup'); await p.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(3000);
  await p.page.getByText('Sign up').first().click(); await sleep(500);
  await signIn(p, email, PW); await sleep(2500); await p.shot('1-after-sign-up-try');
  const t = (await p.page.locator('body').innerText()).replace(/\s+/g, ' ');
  check(/already has an account/i.test(t), 'b2) an existing user on the sign-up form is told to sign in', t.slice(0, 40));
  await signIn(p, email, PW); await sleep(7000);
  check(await inTopic(p, id), 'b2) and lands in the topic after signing in', p.page.url().slice(-50));
}
// c) already signed in as the invited address
{
  const email = `in-${RUN}@example.com`; await seedVerifiedE2EAccount(email, PW); const id = await newTopic(`ZZ SCRATCH invite c ${RUN}`); const link = await invite(id, email);
  const p = await person('c-signed-in'); await p.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(2000); await signIn(p, email, PW); await p.page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
  await p.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(5000); await p.shot('1-opened-signed-in');
  check(await inTopic(p, id), 'c) already signed in as the invited address: the link opens the topic', p.page.url().slice(-60));
}
// d) signed in as a different address
{
  const invited = `inv-${RUN}@example.com`; const other = `oth-${RUN}@example.com`; await seedVerifiedE2EAccount(invited, PW); await seedVerifiedE2EAccount(other, PW);
  const id = await newTopic(`ZZ SCRATCH invite d ${RUN}`); const link = await invite(id, invited);
  const p = await person('d-wrong'); await p.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(2000); await signIn(p, other, PW); await p.page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
  await p.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(1800); await p.shot('1-toast');
  const toast = (await p.page.locator('[data-testid="toast"]').allInnerTexts().catch(() => [])).join(' ');
  await sleep(2500); await p.shot('2-after');
  check(/another email/i.test(toast), 'd) the notice is not replaced by a friendly "Welcome back!"', toast.slice(0, 80));
  const panel = (await p.page.locator('[data-testid="invite-problem"]').allInnerTexts().catch(() => [])).join(' ');
  check(/another email address/i.test(panel), 'd) a different address gets a clear message that stays on screen', panel.slice(0, 140) || toast.slice(0, 80));
}
// e) provider sign-in: the callback lands on /?layout=rizzoma
{
  const email = `goo-${RUN}@example.com`; await seedVerifiedE2EAccount(email, PW); const id = await newTopic(`ZZ SCRATCH invite e ${RUN}`); const link = await invite(id, email);
  const p = await person('e-provider'); await p.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(3500); await p.shot('1-link-signed-out');
  const login = await api(p, 'POST', '/api/auth/login', { email, password: PW }); // the session a provider callback would have set
  await p.page.goto('about:blank'); await p.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); // a full navigation to the callback's landing page: the topic is not in the address
  await sleep(9000); await p.shot('2-after-callback');
  check(login.status < 300 && await inTopic(p, id), 'e) after a provider sign-in the pending invitation redeems and the person lands in the topic', `login ${login.status}; ${p.page.url().slice(-60)}`);
}
// f2) deleted topic
{
  const email = `del-${RUN}@example.com`; await seedVerifiedE2EAccount(email, PW); const id = await newTopic(`ZZ SCRATCH invite f ${RUN}`); const link = await invite(id, email);
  await api(owner, 'DELETE', `/api/topics/${id}`);
  const p = await person('f-deleted'); await p.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(2000); await signIn(p, email, PW); await p.page.locator('.shell-auth-logout').waitFor({ timeout: 25000 });
  await p.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(2000); await p.shot('1-toast');
  const toast = (await p.page.locator('[data-testid="toast"]').allInnerTexts().catch(() => [])).join(' ');
  await sleep(3500); await p.shot('2-after'); const txt = (await p.page.locator('body').innerText()).replace(/\s+/g, ' ');
  const panel2 = (await p.page.locator('[data-testid="invite-problem"]').allInnerTexts().catch(() => [])).join(' ');
  check(/no longer (works|exists)/i.test(panel2 + ' ' + txt), 'f) a link for a deleted topic says clearly that it no longer works', (panel2 || toast || txt).slice(0, 120));
}
await browser.close();
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
