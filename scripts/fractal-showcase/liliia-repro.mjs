// Reproduce Liliia's 19 Nov defects as a NON-OWNER in a clean context (headed, private display, real input).
// Local stack: owner A builds a topic (reply-box blips + a nested child) and shares it with B (seeded participant);
// B (the non-owner) is the actor. env: FS_BASE, FS_SECTIONS (a,c,d,e)
import fs from 'node:fs';
import { launch, newClient, signInUi, seedUser, sleep, shot, apiGet, OUT, TYPE_DELAY } from './lib.mjs';
import { seedAcceptedParticipant } from '../lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.FS_BASE; const SECTIONS = (process.env.FS_SECTIONS || 'a,c,d,e').split(',');
const tag = process.env.FS_TAG || 'repro';
const A = `lil-a-${Date.now().toString(36)}@example.com`; const B2 = `lil-b-${Date.now().toString(36)}@example.com`;
await seedUser(A); await seedUser(B2);
const b = await launch();
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
// ---- owner builds the topic
const ca = await newClient(b, A); await signInUi(ca); const pa = ca.page;
await pa.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await pa.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(500);
await pa.locator('#topic-title').click(); await pa.keyboard.type('ZZ SCRATCH liliia', { delay: 20 });
await pa.locator('.btn-primary').click(); await sleep(4500);
const topicId = pa.url().split('/topic/')[1];
await seedAcceptedParticipant(topicId, B2, 'editor', 'e2e');
for (const t of ['First blip text', 'Second blip text', 'Third blip text']) {
  await pa.locator('.write-reply-input').first().click(); await pa.keyboard.type(t, { delay: 20 }); await pa.keyboard.press('Enter'); await sleep(2200);
}
// nested child under the first blip (Ctrl+Enter)
await pa.locator('.blip-collapsed-row', { hasText: 'First blip' }).first().click(); await sleep(1500);
await pa.locator('.blip-container.nested-blip li', { hasText: /^First blip/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
await pa.keyboard.press('Control+End'); await pa.keyboard.press('Control+Enter'); await sleep(2500);
await pa.keyboard.type('Nested child text', { delay: 25 }); await sleep(1500);
for (let i = 0; i < 4; i += 1) { const d = pa.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } }
log(`topic ${topicId} built by owner`);
await ca.ctx.close();

// ---- non-owner B in a clean context
const cb = await newClient(b, B2); await signInUi(cb); const p = cb.page;
const url = `${BASE}/?layout=rizzoma#/topic/${topicId}`;
await p.goto(url, { waitUntil: 'domcontentloaded' }); await sleep(8000);
const next = () => p.evaluate(() => { const n = document.querySelector('.next-button'); return n ? `${n.className.replace(/\s+/g, ' ')} disabled=${n.disabled} title="${n.title}"` : 'no next button'; });
if (SECTIONS.includes('a')) {
  log('(a) follow the green, BEFORE reading: ' + await next());
  const unread0 = await p.locator('.blip-collapsed-row.has-unread, .unread').count();
  await shot(cb, `steps/${tag}-a-before`);
  // read everything: open each row, then the nested marker
  for (const t of ['First blip', 'Second blip', 'Third blip']) { await p.locator('.blip-collapsed-row', { hasText: t }).first().click().catch(() => {}); await sleep(1500); }
  await p.locator('.blip-thread-marker').filter({ visible: true }).first().click().catch(() => {}); await sleep(2500);
  await sleep(4000);
  log(`(a) AFTER reading all (unread-marked elements before=${unread0}, now=${await p.locator('.blip-collapsed-row.has-unread, .unread').count()}): ` + await next());
  await shot(cb, `steps/${tag}-a-after`);
  const counts = await apiGet(cb, `/api/waves/${topicId}/unread`); log('(a) server unread: ' + JSON.stringify(counts.json).slice(0, 160));
}
if (SECTIONS.includes('e')) {
  // (e) copy the link of the NESTED child, then open it in a fresh context
  await p.locator('.rizzoma-blip').filter({ hasText: 'Nested child text' }).last().click({ position: { x: 30, y: 10 } }).catch(() => {}); await sleep(900);
  const gl = p.locator('[data-testid="blip-menu-get-link"]').filter({ visible: true }).last();
  await gl.click().catch((e) => log('(e) get-link click: ' + String(e.message).split('\n')[0].slice(0, 70))); await sleep(900);
  const link = await p.evaluate(() => navigator.clipboard.readText().catch(() => 'CLIPBOARD-UNREADABLE'));
  log('(e) the copied blip link: ' + link);
  const cc = await newClient(b, B2); await signInUi(cc);
  await cc.page.goto(link, { waitUntil: 'domcontentloaded' }); await sleep(8000);
  const what = await cc.page.evaluate(() => ({ url: location.hash, text: (document.querySelector('.wave-panel')?.innerText || '').replace(/\s+/g, ' ').slice(0, 140) }));
  log('(e) opening that link as the non-owner shows: ' + JSON.stringify(what));
  await shot(cc, `steps/${tag}-e-linkopened`); await cc.ctx.close();
}
log('problems: ' + cb.problems.length);
fs.writeFileSync('/home/stephan/rizzoma-fractal-scratch/run/liliia-topic.json', JSON.stringify({ topicId, base: BASE, a: A, b: B2 }));
await cb.ctx.close(); await b.close();
