#!/usr/bin/env node
/**
 * Regression smoke for the 18 Nov 2026 tester feedback (Liliia): editing sub-blips, a
 * third/fourth level blip, Ctrl+Enter from the view state, image size, per-blip author and
 * date, the Invite contacts list, and the second-client / reload checks that the "blips
 * disappeared" report needs. Real browser, real keystrokes, real reload, real second client.
 *
 *   node test-tester-feedback-smoke.mjs
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3000 RIZZOMA_RENDER=native node test-tester-feedback-smoke.mjs
 *
 * Needs COUCHDB_URL (same as the server) because accounts are seeded directly, exactly as
 * test-collab-smoke.mjs does. Exit 0 = every check passed.
 */
import { chromium } from 'playwright';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const RENDER = process.env.RIZZOMA_RENDER || '';
const PASS = 'TesterFeedback!1';
const stamp = Date.now();
const emailA = `tf-a-${stamp}@example.com`;
const emailB = `tf-b-${stamp}@example.com`;
const emailC = `tf-c-${stamp}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`);
  if (!ok) failed += 1;
};

async function login(page, email) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ email, pass }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email, password: pass }) });
  }, { email, pass: PASS });
}
async function api(page, method, url, body) {
  return page.evaluate(async ({ method, url, body }) => {
    const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
    return { status: r.status, json: j };
  }, { method, url, body });
}
const plain = (html) => String(html || '').replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '').replace(/<[^>]+>/g, '').trim();
const topicUrl = (id) => `${BASE}/?layout=rizzoma${RENDER ? `&render=${RENDER}` : ''}#/topic/${id}`;

await seedVerifiedE2EAccount(emailA, PASS);
await seedVerifiedE2EAccount(emailB, PASS);
await seedVerifiedE2EAccount(emailC, PASS);
const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const ctxA = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctxA.newPage();
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
await login(page, emailA);
const topic = await api(page, 'POST', '/api/topics', { title: 'ZZ SCRATCH tester feedback', content: '<h1>ZZ SCRATCH tester feedback</h1>' });
const topicId = topic.json.id || topic.json._id;
await seedAcceptedParticipant(topicId, emailB, 'editor', 'e2e');
// C shares ANOTHER topic with A (a contact), but is not a member of this one: Invite must offer C.
const otherTopic = await api(page, 'POST', '/api/topics', { title: 'ZZ SCRATCH tester feedback contacts', content: '<h1>contacts</h1>' });
await seedAcceptedParticipant(otherTopic.json.id || otherTopic.json._id, emailC, 'editor', 'e2e');
await page.goto(topicUrl(topicId), { waitUntil: 'domcontentloaded' });
await sleep(5000);

// ---- level 1 via the topic reply box (what the tester did first) ----
const replyBox = page.locator('.write-reply-input').first();
await replyBox.click();
await page.keyboard.type('L1');
await page.keyboard.press('Enter');
await sleep(2500);
await page.locator('.blip-collapsed-row', { hasText: 'L1' }).first().click();
await sleep(1500);
await page.locator('.blip-container.nested-blip li', { hasText: /^L1/ }).first().click({ position: { x: 12, y: 8 } });
await sleep(1500);

const childFromEditor = async (typed) => {
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Enter');
  await sleep(2500);
  await page.keyboard.type(typed, { delay: 30 });
  await sleep(1200);
};
const done = async () => { await page.locator('button:has-text("Done")').last().click().catch(() => undefined); await sleep(1800); };

// levels 2, 3, 4 by Ctrl+Enter chain inside the editors
await childFromEditor('L2first');
await childFromEditor('L3');
await childFromEditor('L4');
for (let i = 0; i < 4; i += 1) await done();
// second inline child on the SAME parent as L2first (the crash case): re-enter L1 and add another
await page.locator('.blip-container.nested-blip li', { hasText: /^L1/ }).first().click({ position: { x: 12, y: 8 } }).catch(() => undefined);
await sleep(1500);
await childFromEditor('L2second');
for (let i = 0; i < 3; i += 1) await done();
await sleep(2500);

// ---- persistence: reload, then compare what was typed with what is stored where ----
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(6000);
const stored = await api(page, 'GET', `/api/blips?waveId=${topicId}&limit=200`);
const norm = (list) => (list || []).map((b) => ({ ...b, id: b.id || b._id }));
const blips = norm(stored.json?.blips || stored.json).filter((b) => !b.deleted);
console.log('STORED', blips.map((b) => `${String(b.id).slice(-6)}<-${String(b.parentId || '-').slice(-6)}@${b.anchorPosition ?? '-'}:${JSON.stringify(plain(b.content))}`).join(' | '));
const by = (text) => blips.find((b) => plain(b.content) === text);
const l1 = by('L1'); const l2a = by('L2first'); const l3 = by('L3'); const l4 = by('L4'); const l2b = by('L2second');
check(!!l1 && !!l2a && !!l3 && !!l4 && !!l2b, 'every typed blip exists with exactly its own text', `found ${[l1, l2a, l3, l4, l2b].filter(Boolean).length}/5 of ${blips.map((b) => JSON.stringify(plain(b.content))).join(' ')}`);
check(l2a?.parentId === l1?.id && l2b?.parentId === l1?.id, 'level 2 blips are children of level 1');
check(l3?.parentId === l2a?.id, 'level 3 blip is a child of level 2');
check(l4?.parentId === l3?.id, 'level 4 blip is a child of level 3');
const l1Content = String(l1?.content || '');
check(!!l2a && !!l2b && l1Content.includes(l2a.id) && l1Content.includes(l2b.id), 'level 1 content keeps BOTH inline [+] markers after reload (no orphaned sub-blips)');
check(blips.every((b) => !b.parentId || blips.some((p) => p.id === b.parentId)), 'no blip points at a missing parent');

// ---- Ctrl+Enter from the VIEW state creates a child of the ACTIVE blip, not a root blip ----
await page.locator('.blip-collapsed-row', { hasText: 'L1' }).first().click().catch(() => undefined);
await sleep(1500);
await page.locator('.blip-container.nested-blip li', { hasText: /^L1/ }).first().click({ position: { x: 12, y: 8 } });
await sleep(1500);
await done();
const editingBefore = await page.evaluate(() => document.querySelectorAll('.ProseMirror[contenteditable="true"]').length);
await page.keyboard.press('Control+Enter');
await sleep(3500);
await page.keyboard.type('L2view', { delay: 30 });
await sleep(2000);
const after = await api(page, 'GET', `/api/blips?waveId=${topicId}&limit=200`);
const viewChild = norm(after.json?.blips || after.json).find((b) => !b.deleted && plain(b.content) === 'L2view');
check(editingBefore === 0 && !!viewChild && viewChild.parentId === l1?.id, 'Ctrl+Enter from the view state makes a child of the active blip', `parent=${String(viewChild?.parentId || '-').slice(-8)} expected=${String(l1?.id).slice(-8)}`);

// ---- second client sees the same tree ----
const ctxB = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const pageB = await ctxB.newPage();
pageB.on('pageerror', (e) => pageErrors.push(`B: ${String(e).slice(0, 160)}`));
await login(pageB, emailB);
const seenB = await api(pageB, 'GET', `/api/blips?waveId=${topicId}&limit=200`);
const seenTexts = norm(seenB.json?.blips || seenB.json).filter((b) => !b.deleted).map((b) => plain(b.content)).sort();
check(['L1', 'L2first', 'L2second', 'L2view', 'L3', 'L4'].every((t) => seenTexts.includes(t)), 'a second client sees all six blips', seenTexts.join(','));

// ---- image size cap (edit and view mode) ----
const dataUrl = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
  const g = c.getContext('2d'); g.fillStyle = '#3b82f6'; g.fillRect(0, 0, 1200, 800);
  return c.toDataURL('image/png');
});
const imgBlip = await api(page, 'POST', '/api/blips', { waveId: topicId, parentId: l1?.id || null, content: `<ul><li><p>IMG</p><img src="${dataUrl}" alt=""></li></ul>` });
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(5500);
await page.locator('.blip-collapsed-row', { hasText: 'L1' }).first().click().catch(() => undefined);
await sleep(1200);
await page.locator('.blip-collapsed-row', { hasText: 'IMG' }).first().click().catch(() => undefined);
await sleep(1800);
const viewSize = await page.evaluate(() => { const i = document.querySelector('.blip-text img[src^="data:"]'); if (!i) return null; const r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
check(!!viewSize && viewSize.w <= 200 && viewSize.h <= 150 && viewSize.w > 0, 'pasted image is a thumbnail (max 200x150) in view mode', JSON.stringify(viewSize));
await page.locator('.blip-container.nested-blip li', { hasText: /^IMG/ }).first().click({ position: { x: 12, y: 8 } }).catch(() => undefined);
await sleep(1800);
const editSize = await page.evaluate(() => { const i = document.querySelector('.ProseMirror[contenteditable="true"] img[src^="data:"]'); if (!i) return null; const r = i.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
check(!!editSize && editSize.w <= 200 && editSize.h <= 150 && editSize.w > 0, 'pasted image is a thumbnail (max 200x150) in edit mode', JSON.stringify(editSize));
await done(); await done();

// ---- author + date on an expanded blip in view mode ----
const meta = await page.evaluate(() => Array.from(document.querySelectorAll('.nested-blip.expanded .blip-contributors-info')).map((el) => {
  const d = el.querySelector('.blip-author-date'); const b = (d || el).getBoundingClientRect();
  return { text: (d?.textContent || '').trim(), visible: b.width > 0 && b.height > 0 && getComputedStyle(d || el).visibility !== 'hidden' };
}));
check(meta.length > 0 && meta.every((m) => m.visible && /\d/.test(m.text)), 'every expanded blip shows author avatar and creation date in view mode', JSON.stringify(meta));

// ---- Invite lists contacts and accepts a name ----
await page.getByRole('button', { name: 'Invite' }).first().click();
await sleep(2000);
const suggestionText = await page.locator('[data-testid="invite-suggestions"]').innerText().catch(() => '');
check(suggestionText.includes(emailC) && !suggestionText.includes(emailB), 'Invite dialog lists people the user already works with (not those already in the topic)', suggestionText.slice(0, 80).replace(/\n/g, ' '));
await page.locator('.invite-suggestion', { hasText: emailC }).first().click().catch(() => undefined);
const typedValue = await page.locator('#invite-emails').inputValue().catch(() => '');
check(typedValue.includes(emailC), 'clicking a contact puts its address into the invite box', typedValue);
check(!(await page.locator('.invite-member-name', { hasText: /^Participant$/ }).count()), 'Invite member list shows real names, not the word "Participant"');

check(pageErrors.length === 0, 'no uncaught page errors during the whole run', pageErrors.join(' || ').slice(0, 300));
await browser.close();
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
