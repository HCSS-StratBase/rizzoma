#!/usr/bin/env node
/**
 * Read-mode topic seed smoke (Playwright).
 *
 * Regression for the topic-root collaboration seed: a topic whose content has
 * no stored Y.js state (created through the API, imported, or replaced
 * server-side) must keep its body when a user with edit rights opens it in
 * read mode. Before the fix the topic root seeded its Y.Doc only on entering
 * edit mode; in read mode the editor synced an empty document, the BLB
 * normalizer "repaired" it and the auto-save wrote the empty body over the
 * stored topic, and the reader saw nothing.
 *
 * Checks, with realtime collaboration on (dev stack started with FEAT_ALL=1):
 *   1. a topic created with three items keeps all three after a read-mode open;
 *   2. the three items are visible in the page;
 *   3. after a server-side content replacement, a second read-mode open keeps
 *      and shows the new items.
 *
 * Run: RIZZOMA_BASE_URL=http://127.0.0.1:3000 node test-topic-readmode-seed-smoke.mjs
 * Exit code 0 = all PASS, 1 = at least one FAIL.
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const password = process.env.RIZZOMA_E2E_PASSWORD || 'ReadSeed!1';
const email = process.env.RIZZOMA_E2E_USER || `readmode-seed-${Date.now()}@example.com`;
const settleMs = Number(process.env.RIZZOMA_READMODE_SETTLE_MS || 5000);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

await seedVerifiedE2EAccount(email, password);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });

  const call = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const response = await fetch(path, {
      method,
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await response.json(); } catch { /* empty body */ }
    return { status: response.status, data };
  }, { method, path, body });

  const storedContent = async (id) => {
    const response = await call('GET', `/api/topics/${encodeURIComponent(id)}`);
    return String(response.data?.content ?? response.data?.topic?.content ?? '');
  };

  const openReadMode = async (id) => {
    await page.goto('about:blank');
    await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
    await page.waitForTimeout(settleMs);
    return page.locator('.rizzoma-topic-detail').innerText().catch(() => '');
  };

  const login = await call('POST', '/api/auth/login', { email, password });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);

  const title = `Read-mode seed ${Date.now()}`;
  const created = await call('POST', '/api/topics', {
    title,
    content: `<h1>${title}</h1><ul><li>Alpha</li><li>Beta</li><li>Gamma</li></ul>`,
  });
  const id = created.data?.id;
  if (!id) throw new Error(`topic create failed: ${created.status}`);

  const shown = await openReadMode(id);
  const afterFirst = await storedContent(id);
  check('API-created topic keeps its body after a read-mode open',
    ['Alpha', 'Beta', 'Gamma'].every((word) => afterFirst.includes(word)), afterFirst.slice(0, 120));
  check('API-created topic body is visible in read mode',
    ['Alpha', 'Beta', 'Gamma'].every((word) => shown.includes(word)));

  // Leave the topic so no collaboration session blocks a server-side replacement.
  await page.goto('about:blank');
  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const replaced = await call('PATCH', `/api/topics/${encodeURIComponent(id)}`, {
    content: `<h1>${title}</h1><ul><li>Delta</li><li>Epsilon</li></ul>`,
  });
  check('server-side replacement accepted', replaced.status === 200, `status ${replaced.status}`);

  const shownAgain = await openReadMode(id);
  const afterSecond = await storedContent(id);
  check('replaced content survives the next read-mode open',
    ['Delta', 'Epsilon'].every((word) => afterSecond.includes(word)), afterSecond.slice(0, 120));
  check('replaced content is visible in read mode',
    ['Delta', 'Epsilon'].every((word) => shownAgain.includes(word)));
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.pass);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
