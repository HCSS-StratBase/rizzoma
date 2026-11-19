#!/usr/bin/env node
/**
 * Regression smoke: gadgets must RENDER, not merely be stored. Inserts Code, Poll, LaTeX, YouTube, Sheet and Image
 * through the Gadgets palette with real clicks and typing, finishes, reloads, and judges the READ view:
 *   Code    a <pre> that holds the typed code (the palette used to insert nothing inside a bullet)
 *   Poll    a poll with its question and options and a non-zero height (it used to be a zero-height box)
 *   LaTeX   the typed formula typeset by the product renderer (.rizzoma-latex) and no raw "$$" left
 *   YouTube an iframe on youtube.com/embed whose sandbox keeps the player's own origin, and no React
 *           "Invalid DOM property" error in the console
 *   Sheet   an iframe on docs.google.com;  Image  an <img> that loaded (naturalWidth > 0)
 * Earlier checks only asserted that the data was STORED, so none of this was ever noticed.
 *
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3000 node test-gadgets-render-smoke.mjs   (needs COUCHDB_URL)
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const PASS = 'GadgetRender!1';
const email = `gr-${Date.now()}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };

await seedVerifiedE2EAccount(email, PASS);
const browser = await chromium.launch({ headless: process.env.RIZZOMA_E2E_HEADED !== '1' });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
const p = await ctx.newPage(); p.setDefaultTimeout(12000);
const consoleErrors = [];
p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.evaluate(async ({ email, pass }) => {
  await fetch('/api/auth/csrf', { credentials: 'include' });
  const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
  const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email, password: pass }) });
}, { email, pass: PASS });
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(500);
await p.locator('#topic-title').click(); await p.keyboard.type('ZZ SCRATCH gadget render', { delay: 15 });
await p.locator('.btn-primary').click(); await sleep(4500);
await p.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click(); await sleep(1800);
const EDITOR = '.ProseMirror[contenteditable="true"]';
await p.locator(EDITOR).first().click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
const type = (t) => p.keyboard.type(t, { delay: 20 });
const palette = async (name) => { await p.locator('[data-testid="right-tools-insert-gadget"]').click(); await sleep(600); await p.locator(`button[title="${name}"]`).first().click(); await sleep(1400); };
const inp = (ph) => p.locator(`input[placeholder="${ph}"]`).filter({ visible: true }).last();
const anchor = async () => { await p.locator(EDITOR).first().click({ position: { x: 5, y: 5 } }).catch(() => {}); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); };

await type('Poll row'); await p.keyboard.press('Enter'); await palette('Poll'); await anchor();
await type('LaTeX row'); await p.keyboard.press('Enter'); await palette('LaTeX'); await type('x^2 + \\frac{a}{b}'); await sleep(1200); await p.keyboard.press('End'); await anchor();
await type('YouTube row'); await p.keyboard.press('Enter'); await palette('YouTube'); await inp('YouTube URL...').click(); await type('https://www.youtube.com/watch?v=dQw4w9WgXcQ'); await p.keyboard.press('Enter'); await sleep(1200); await anchor();
await type('Sheet row'); await p.keyboard.press('Enter'); await palette('Sheet'); await inp('Google Sheets URL...').click(); await type('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit'); await p.keyboard.press('Enter'); await sleep(1200); await anchor();
await type('Image row'); await p.keyboard.press('Enter'); await palette('Image'); await inp('Image URL...').click(); await type(`${BASE}/s/img/user/anonim.png`); await p.keyboard.press('Enter'); await sleep(1200); await anchor();
await type('Code row'); await p.keyboard.press('Enter'); await palette('Code'); await type('const answer = 42;'); await sleep(2500);
await p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last().click().catch(() => {}); await sleep(2500);
await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(9000);

const v = p.locator('.topic-content-view').first();
const poll = await v.locator('figure.gadget-poll').first().evaluate((e) => ({ h: e.getBoundingClientRect().height, t: e.textContent })).catch(() => null);
check(!!poll && poll.h > 20 && /Yes/.test(poll.t) && /No/.test(poll.t), 'Poll renders with its options and a real height', poll ? `${Math.round(poll.h)}px "${poll.t.slice(0, 40)}"` : 'no poll figure');
const latex = await v.locator('.rizzoma-latex').first().evaluate((e) => e.textContent).catch(() => null);
check(!!latex && /x/.test(latex) && !/\$\$/.test(latex), 'LaTeX is typeset by the renderer (formula typed between the $$)', String(latex));
const rawDollar = await v.evaluate((e) => /\$\$/.test(e.innerText));
check(!rawDollar, 'no raw $$ left in the read view');
const yt = await v.locator('iframe[src*="youtube.com/embed"]').first().evaluate((e) => ({ src: e.getAttribute('src'), sb: e.getAttribute('sandbox'), fs: e.hasAttribute('allowfullscreen') })).catch(() => null);
check(!!yt && /dQw4w9WgXcQ/.test(yt.src), 'YouTube watch URL became a youtube.com/embed iframe', yt?.src);
check(!!yt && /allow-same-origin/.test(yt.sb || '') && /allow-scripts/.test(yt.sb || ''), 'the YouTube frame keeps its own origin (sandbox has allow-same-origin)', yt?.sb);
const sheet = await v.locator('iframe[src*="docs.google.com/spreadsheets"]').count();
check(sheet === 1, 'Sheet renders as a docs.google.com spreadsheet iframe');
const img = await v.locator('img[alt="image"]').first().evaluate((e) => e.naturalWidth).catch(() => 0);
check(img > 0, 'Image gadget loaded (naturalWidth > 0)', String(img));
const pre = await v.locator('pre').first().evaluate((e) => e.textContent).catch(() => null);
check(!!pre && /const answer = 42;/.test(pre), 'Code gadget renders a code block with the typed code', String(pre).slice(0, 40));
check(!consoleErrors.some((t) => /Invalid DOM property/.test(t)), 'no React "Invalid DOM property" errors from embeds', consoleErrors.filter((t) => /Invalid DOM/.test(t)).slice(0, 1).join(''));
await browser.close();
console.log(failed ? `FAILED ${failed} check(s)` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
