#!/usr/bin/env node
/**
 * Build a "Try" topic on our Rizzoma matching the rizzoma.com Try fractal exactly:
 *   - Topic title: "Try"
 *   - Body: 3 bullet labels — "First label by Claude" / "Second label by Claude" / "Third label by Claude"
 *   - On First label: a depth-10 spine with A child + B sibling at each level
 *
 * Uses the same auth/CSRF pattern as scripts/visual-feature-sweep.mjs.
 */
import { chromium } from 'playwright';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'https://dev.138-201-62-161.nip.io';
const stamp = process.env.RIZZOMA_TRY_STAMP || `try-${Date.now()}`;
const ownerEmail = process.env.RIZZOMA_TRY_OWNER || `try-owner+${stamp}@example.com`;
const ownerPassword = process.env.RIZZOMA_TRY_PASSWORD || `Try!Owner-${stamp}`;

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

async function getXsrfToken(page) {
  const token = await page.evaluate(() => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    return raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  });
  if (!token) throw new Error('Missing XSRF token');
  return token;
}

async function ensureAuth(page, email, password) {
  await gotoApp(page);
  const result = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    const login = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (login.ok) return { ok: true, method: 'login' };
    const register = await fetch('/api/auth/register', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password, name: email.split('@')[0] }),
    });
    if (register.ok) return { ok: true, method: 'register' };
    return { ok: false, status: register.status, text: await register.text() };
  }, { email, password });
  if (!result.ok) throw new Error(`auth failed: ${result.status} ${result.text}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 20000 });
  console.log(`auth ok via ${result.method}: ${email}`);
}

async function api(page, method, apiPath, body) {
  const token = await getXsrfToken(page);
  const result = await page.evaluate(async ({ method, apiPath, body, token }) => {
    const resp = await fetch(apiPath, {
      method,
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await resp.json(); } catch { data = await resp.text(); }
    return { ok: resp.ok, status: resp.status, data };
  }, { method, apiPath, body, token });
  if (!result.ok) throw new Error(`${method} ${apiPath} failed ${result.status}: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function apiRetry(page, method, apiPath, body, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await api(page, method, apiPath, body);
    } catch (error) {
      lastError = error;
      if (!String(error.message || error).includes('409') || attempt === attempts) break;
      await page.waitForTimeout(300 * attempt);
    }
  }
  throw lastError;
}

async function build(page) {
  const title = process.env.RIZZOMA_TRY_TITLE || 'Try';

  const wave = await api(page, 'POST', '/api/topics', {
    title,
    content: `<h1>${title}</h1><p>Replica of rizzoma.com Try topic — depth-10 spine on First label by Claude.</p>`,
  });
  const waveId = wave.id;
  console.log(`topic created: ${waveId}`);

  const newInline = async (parentId, anchorPosition, content) => {
    const created = await apiRetry(page, 'POST', '/api/blips', {
      waveId,
      parentId,
      anchorPosition,
      content,
    });
    return created.id || created.blip?._id || created.blip?.id;
  };

  const depth = 10;
  const labelA = (d) => d === 1 ? 'Subblip 1.A' : (d === 2 ? 'Depth-2 child A' : `Depth-${d} leaf A`);
  const labelB = (d) => d === 1 ? 'Subblip 1.B' : (d === 2 ? 'Depth-2 leaf B' : `Depth-${d} leaf B`);

  // Build spine top-down.
  const spineIds = new Array(depth + 1);
  spineIds[1] = await newInline(null, 8, `<ul><li>${labelA(1)} (placeholder)</li></ul>`);
  for (let k = 2; k <= depth; k += 1) {
    spineIds[k] = await newInline(spineIds[k - 1], 8, `<ul><li>${labelA(k)} (placeholder)</li></ul>`);
    console.log(`depth ${k}: ${spineIds[k]}`);
  }

  // Patch bottom-up — deepest is leaf-only (no further marker).
  await apiRetry(page, 'PUT', `/api/blips/${encodeURIComponent(spineIds[depth])}`, {
    content: `<ul><li>${labelA(depth)}</li><li>${labelB(depth)}</li></ul>`,
  });
  for (let k = depth - 1; k >= 1; k -= 1) {
    const childMarker = `<span class="blip-thread-marker has-unread" data-blip-thread="${spineIds[k + 1]}">+</span>`;
    const body = `<ul><li>${labelA(k)}${childMarker}</li><li>${labelB(k)}</li></ul>`;
    await apiRetry(page, 'PUT', `/api/blips/${encodeURIComponent(spineIds[k])}`, { content: body });
  }

  // Patch topic root: 3 bullets; only First label has a [+] pointing at spineIds[1].
  const rootBody = `<h1>${title}</h1>` +
    `<ul>` +
      `<li>First label by Claude<span class="blip-thread-marker has-unread" data-blip-thread="${spineIds[1]}">+</span></li>` +
      `<li>Second label by Claude</li>` +
      `<li>Third label by Claude</li>` +
    `</ul>`;
  await apiRetry(page, 'PATCH', `/api/topics/${encodeURIComponent(waveId)}`, { content: rootBody });

  console.log(`\nDONE.`);
  console.log(`URL: ${baseUrl}/?layout=rizzoma#/topic/${waveId}`);
  console.log(JSON.stringify({ waveId, title, owner: ownerEmail, password: ownerPassword, spineIds }, null, 2));
  return { waveId };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await ensureAuth(page, ownerEmail, ownerPassword);
  await build(page);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
