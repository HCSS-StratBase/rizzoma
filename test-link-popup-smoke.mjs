#!/usr/bin/env node
/**
 * Regression smoke: the ribbon's link button opens the original's in-page "Insert link" popup (Text and URL fields, Submit and Remove,
 * parity rows 064 and 065) instead of a browser prompt. Real clicks and typing, headless Chromium.
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... node test-link-popup-smoke.mjs   (SHOTS=<dir> keeps screenshots)
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const BASE = (process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const SHOTS = process.env.SHOTS || '';
const RUN = Date.now().toString(36);
const email = `link-${RUN}@example.com`; const password = 'LinkPopup!1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` | ${detail}` : ''}`); if (!ok) failed += 1; };
await seedVerifiedE2EAccount(email, password);
const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage(); page.setDefaultTimeout(15000);
const pageErrors = []; page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160))); page.on('console', (m) => { if (m.type() === 'error' && /Rendered (more|fewer) hooks|change in the order of Hooks/i.test(m.text())) pageErrors.push(m.text().slice(0, 160)); });
let promptSeen = false; page.on('dialog', (d) => { promptSeen = true; d.dismiss().catch(() => undefined); });
const k = page.keyboard;
const shot = async (n) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
await page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
await page.getByPlaceholder('Email address').click(); await k.press('Control+a'); await k.type(email, { delay: 10 });
await page.getByPlaceholder('Password', { exact: true }).click(); await k.press('Control+a'); await k.type(password, { delay: 10 });
await page.locator('.submit-btn').click(); await page.locator('.shell-auth-logout').waitFor({ timeout: 25000 }); await sleep(2500);
await page.locator('.create-wave').first().click(); await sleep(900);
await page.getByPlaceholder('What would you like to discuss?').click(); await k.type(`ZZ SCRATCH suite link popup ${RUN}`, { delay: 10 });
await page.getByRole('button', { name: 'Create Topic' }).click(); await sleep(4500);
const topicId = (/#\/topic\/([^/?]+)/.exec(await page.evaluate(() => location.hash)) || [])[1];
await page.locator('.write-reply-input').first().click(); await k.type('see docs here', { delay: 20 }); await k.press('Enter'); await sleep(2200);
await page.locator('.blip-collapsed-row', { hasText: 'see docs' }).first().click(); await sleep(1300);
await page.locator('.blip-container.nested-blip li', { hasText: /^see docs/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1400);
await k.press('Home'); for (let i = 0; i < 4; i += 1) await k.press('ArrowRight');
await k.down('Shift'); for (let i = 0; i < 4; i += 1) await k.press('ArrowRight'); await k.up('Shift'); await sleep(300);
await page.locator('[data-testid="blip-menu-insert-link"]').last().click(); await sleep(600);
await shot('1-popup-open');
const popup = page.locator('[data-testid="link-popup"]');
check(await popup.isVisible().catch(() => false), 'the link button opens the in-page Insert link popup');
check(!promptSeen, 'no browser prompt was used');
check((await page.locator('[data-testid="link-popup-text"]').inputValue().catch(() => '')) === 'docs', 'the Text field holds the selected text');
await page.locator('[data-testid="link-popup-url"]').click(); await k.type('https://example.org/popup', { delay: 15 });
await page.locator('[data-testid="link-popup-submit"]').click(); await sleep(800);
check(await popup.count() === 0, 'Submit closes the popup');
const html = await page.locator('.ProseMirror[contenteditable="true"]').first().innerHTML();
check(/<a [^>]*href="https:\/\/example\.org\/popup"[^>]*>docs<\/a>/.test(html), 'the selected text became a link', html.slice(0, 160));
await shot('2-linked');
// Remove
await page.locator('.ProseMirror[contenteditable="true"] a').first().click(); await sleep(300);
await page.locator('[data-testid="blip-menu-insert-link"]').last().click(); await sleep(500);
check((await page.locator('[data-testid="link-popup-url"]').inputValue().catch(() => '')) === 'https://example.org/popup', 'on a link the URL field holds its address');
await page.locator('[data-testid="link-popup-remove"]').click(); await sleep(600);
const html2 = await page.locator('.ProseMirror[contenteditable="true"]').first().innerHTML();
check(!/<a /.test(html2), 'Remove takes the link off', html2.slice(0, 120));
// Escape closes
await page.locator('[data-testid="blip-menu-insert-link"]').last().click(); await sleep(400);
await k.press('Escape'); await sleep(400);
check(await popup.count() === 0, 'Escape closes the popup');
await page.locator('.ProseMirror[contenteditable="true"]').first().click(); await k.press('End'); await k.press('Control+Enter'); await sleep(2500); await k.type('kid', { delay: 30 }); await sleep(1500);
check((await page.locator('.ProseMirror[contenteditable="true"]').allInnerTexts()).some((t) => /kid/.test(t)), 'Ctrl+Enter still creates a child and typing lands in it');
check(pageErrors.length === 0, 'no page errors (the popup hooks must not break rendering of an inactive blip menu)', pageErrors.join(' | '));
const del = await page.evaluate(async (id) => { const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : ''; return (await fetch(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' })).status; }, topicId);
check(del < 300, 'scratch topic deleted', String(del));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall link-popup checks passed');
process.exit(failed ? 1 : 0);
