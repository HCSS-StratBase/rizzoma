#!/usr/bin/env node
/**
 * Diagnostic probe for the Ctrl+Enter hand-off (LOCAL stack only).
 * Opens a fresh topic, types L1 in the root, presses Ctrl+Enter, then samples
 * every 200 ms for PROBE_MS: is the new child mounted, is it editable, which
 * element holds focus, and what the page logged. Writes nothing to live.
 * Env: HB_BASE (required, must be localhost), HB_EMAIL, HB_PASS, PROBE_MS.
 */
import { chromium } from 'playwright';

const BASE = process.env.HB_BASE;
if (!BASE || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(BASE)) {
  console.error('[probe] HB_BASE must be a localhost URL');
  process.exit(2);
}
const EMAIL = process.env.HB_EMAIL, PASS = process.env.HB_PASS;
const PROBE_MS = Number(process.env.PROBE_MS || 6000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = { v: 0 };
const ts = () => String(Date.now() - t0.v).padStart(5);

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
const logs = [];
page.on('console', (m) => { if (t0.v) logs.push(`${ts()} console.${m.type()}: ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => logs.push(`${ts()} PAGEERROR ${String(e).slice(0, 200)}`));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
const topic = await page.evaluate(async ({ email, pass }) => {
  const csrf = async () => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
    return raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  };
  let c = await csrf();
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': c }, credentials: 'include', body: JSON.stringify({ email, password: pass }) });
  c = await csrf();
  const r = await fetch('/api/topics', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': c }, credentials: 'include', body: JSON.stringify({ title: 'PROBE ' + Date.now(), content: '<h1>PROBE</h1>' }) });
  const d = await r.json();
  return d.id || d._id;
}, { email: EMAIL, pass: PASS });
await page.goto(`${BASE}/?layout=rizzoma&render=react#/topic/${topic}`, { waitUntil: 'domcontentloaded' });
await sleep(7000);
await page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 });
await sleep(1500);
await page.locator('.topic-content-edit .ProseMirror').first().click();
await page.keyboard.press('End');
await page.keyboard.press('Enter');
await page.keyboard.type('L1 label', { delay: 25 });
await sleep(1200);

// PROBE_DEPTH (default 2): build the levels above the probed one first, each
// with Ctrl+Enter + label, waiting until the label is in the new child.
const allIds = () => page.evaluate(() =>
  Array.from(new Set(Array.from(document.querySelectorAll('[data-blip-id]')).map((e) => e.getAttribute('data-blip-id')))));
const PROBE_DEPTH = Number(process.env.PROBE_DEPTH || 2);
for (let d = 2; d < PROBE_DEPTH; d++) {
  const pre = await allIds();
  const t1 = Date.now();
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type(`L${d} label`, { delay: 25 });
  // Same rule as the gate: the label is in a blip that did not exist before.
  const ok = await page.waitForFunction(({ t, pre }) => {
    const old = new Set(pre);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const id = n.parentElement?.closest('[data-blip-id]')?.getAttribute('data-blip-id');
      if ((n.nodeValue || '').includes(t) && id && !old.has(id)) return true;
    }
    return false;
  }, { t: `L${d} label`, pre }, { timeout: 15000, polling: 100 }).then(() => true, () => false);
  console.log(`[probe] built L${d}: ${ok ? `label in new child after ${Date.now() - t1} ms` : 'NOT built within 15 s'}`);
  await sleep(1500);
}
const beforeIds = await allIds();
await page.evaluate((ids) => { window.__probeBefore = ids; }, beforeIds);

t0.v = Date.now();
await page.keyboard.press('Control+Enter');
// PROBE_TYPE: type straight after Ctrl+Enter, as a user (and the gate) does.
if (process.env.PROBE_TYPE) {
  await page.keyboard.type(process.env.PROBE_TYPE, { delay: 25 });
  logs.push(`${ts()} TYPED ${process.env.PROBE_TYPE}`);
}
let last = '';
while (Date.now() - t0.v < PROBE_MS) {
  const s = await page.evaluate(() => {
    const blips = Array.from(document.querySelectorAll('[data-blip-id]')).map((e) => e.getAttribute('data-blip-id'));
    const ids = Array.from(new Set(blips));
    const before = new Set(window.__probeBefore || []);
    const child = ids.find((id) => id && id.includes(':b') && !before.has(id));
    const c = child ? document.querySelector(`[data-blip-id="${CSS.escape(child)}"]`) : null;
    const ae = document.activeElement;
    // Same DOM node as before? A new node means React remounted the child.
    const w = window;
    w.__probeSeq = w.__probeSeq || 0;
    if (c && !c.__probeNode) c.__probeNode = ++w.__probeSeq;
    // Element chain from the child's wrapper up to the topic blip, to see
    // whether the parent's HTML shape around the marker changes.
    let chain = '';
    for (let e = c?.parentElement, i = 0; e && i < 8 && !e.matches('[data-blip-id]'); e = e.parentElement, i++) {
      chain += `${e.tagName.toLowerCase()}${e.__probeNode2 ? '' : '*'}<`;
      e.__probeNode2 = 1;
    }
    return JSON.stringify({
      chain,
      child: child ? child.slice(-6) : null,
      childText: c ? (c.querySelector('.ProseMirror')?.textContent || c.textContent || '').slice(0, 30) : null,
      marker: (document.querySelector('.blip-thread-marker')?.textContent || '').trim(),
      node: c ? c.__probeNode : 0,
      active: (window.__rizzomaActiveBlipId || '').slice(-6) || null,
      childPM: c ? c.querySelectorAll('.ProseMirror').length : 0,
      childEditable: c ? c.querySelectorAll('.ProseMirror[contenteditable="true"]').length : 0,
      childClass: c ? (c.className || '').toString().slice(0, 80) : null,
      topicEditing: !!document.querySelector('.topic-content-edit'),
      focus: ae ? `${ae.tagName}.${(ae.className || '').toString().slice(0, 40)} in=${ae.closest('[data-blip-id]')?.getAttribute('data-blip-id')?.slice(-6) || '-'}` : null,
    });
  });
  if (s !== last) { logs.push(`${ts()} STATE ${s}`); last = s; }
  await sleep(200);
}
console.log(`[probe] topic ${topic}`);
for (const l of logs) console.log(l);
await browser.close();
