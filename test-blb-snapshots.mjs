import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const topicPath = process.env.RIZZOMA_TOPIC_PATH || '#/topic/';
const snapshotDir = process.env.RIZZOMA_SNAPSHOT_DIR || path.resolve('snapshots', 'blb');
const timestamp = Date.now();
const ownerEmail = process.env.RIZZOMA_E2E_USER || `blb-owner+${timestamp}@example.com`;
const observerEmail = process.env.RIZZOMA_E2E_OBSERVER || `blb-observer+${timestamp}@example.com`;
const password = process.env.RIZZOMA_E2E_PASSWORD || 'BlbSnapshot!1';

const log = (msg) => console.log(`➡️  ${msg}`);

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function ensureAuth(page, email, password) {
  await gotoApp(page);
  const authResult = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrfCookie = document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='));
    const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.split('=')[1] || '') : '';

    const headers = {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    };

    const loginResp = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (loginResp.ok) {
      return { success: true, method: 'login' };
    }

    const registerResp = await fetch('/api/auth/register', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (registerResp.ok) {
      return { success: true, method: 'register' };
    }

    const error = await registerResp.text();
    return { success: false, error, status: registerResp.status };
  }, { email, password });

  if (!authResult.success) {
    throw new Error(`Auth failed: ${authResult.error} (status: ${authResult.status})`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  const meResult = await page.evaluate(async () => {
    const resp = await fetch('/api/auth/me', { credentials: 'include' });
    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = await resp.text();
    }
    return { ok: resp.ok, status: resp.status, data };
  });
  if (!meResult.ok) {
    throw new Error(`Auth check failed: /api/auth/me (${meResult.status})`);
  }
}

async function getXsrfToken(page) {
  const token = await page.evaluate(() => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    if (!raw) return '';
    return decodeURIComponent(raw.split('=')[1] || '');
  });
  if (!token) throw new Error('Missing XSRF token');
  return token;
}

async function api(page, method, apiPath, body) {
  const token = await getXsrfToken(page);
  const result = await page.evaluate(async ({ method, apiPath, body, token }) => {
    const resp = await fetch(apiPath, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': token,
      },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await resp.json();
    } catch {
      data = await resp.text();
    }
    return { ok: resp.ok, status: resp.status, data };
  }, { method, apiPath, body, token });
  if (!result.ok) {
    const detail = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
    throw new Error(`API ${method} ${apiPath} failed (${result.status}): ${detail}`);
  }
  return result.data;
}

async function createWave(page, title) {
  const data = await api(page, 'POST', '/api/topics', { title, content: `<h1>${title}</h1><p>BLB snapshot content.</p>` });
  return data.id;
}

async function createBlip(page, waveId, content, parentId = null, anchorPosition = undefined) {
  const payload = { waveId, parentId, content };
  if (typeof anchorPosition === 'number') payload.anchorPosition = anchorPosition;
  const data = await api(page, 'POST', '/api/blips', payload);
  return data?.id || data?.blip?._id || data?.blip?.id;
}

async function updateBlip(page, blipId, content) {
  await api(page, 'PUT', `/api/blips/${encodeURIComponent(blipId)}`, { content });
}

async function patchTopicContentWithRetry(page, waveId, content) {
  const path = `/api/topics/${encodeURIComponent(waveId)}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await api(page, 'PATCH', path, { content });
      return;
    } catch (error) {
      const message = String(error);
      if (!message.includes('409') || attempt === 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

async function captureSnapshot(page, label, descriptionLines) {
  await fs.mkdir(snapshotDir, { recursive: true });
  const safe = label.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
  const fileBase = `${timestamp}-${safe}`;
  const pngPath = path.join(snapshotDir, `${fileBase}.png`);
  const mdPath = path.join(snapshotDir, `${fileBase}.md`);
  await page.screenshot({ path: pngPath, fullPage: true });
  const md = [`# Snapshot: ${fileBase}.png`, '', ...descriptionLines].join('\n');
  await fs.writeFile(mdPath, md, 'utf8');
  log(`Captured ${pngPath}`);
  log(`Wrote ${mdPath}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const contextOwner = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pageOwner = await contextOwner.newPage();

  log('Authenticating owner session');
  await ensureAuth(pageOwner, ownerEmail, password);

  log('Creating BLB wave + blips');
  const waveId = await createWave(pageOwner, `BLB Snapshot ${timestamp}`);

  await createBlip(pageOwner, waveId, '<p>Oneliner</p>');
  await createBlip(pageOwner, waveId, '<p>Relevant links</p>');
  await createBlip(pageOwner, waveId, '<p>Expanded blip demo</p>');
  const inlineChild = await createBlip(pageOwner, waveId, '<p>Inline child blip body</p>', null, 5);

  const markerHtml = `<span class="blip-thread-marker has-unread" data-blip-thread="${inlineChild}">+</span>`;
  const topicContent = `<h1>BLB Snapshot ${timestamp}</h1><p>Inline marker demo ${markerHtml} continues here.</p>`;
  await patchTopicContentWithRetry(pageOwner, waveId, topicContent);

  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = topicPath.replace(/^\//, '');
  const waveUrl = `${cleanBase}/${cleanPath}${encodeURIComponent(waveId)}`;

  log('Opening wave as owner');
  await pageOwner.goto(waveUrl, { waitUntil: 'domcontentloaded' });
  await pageOwner.waitForSelector('.blip-collapsed-row', { timeout: 15000 });

  await captureSnapshot(pageOwner, 'blb-landing-collapsed', [
    '- **What it shows:** Modern BLB landing view with root-level blips collapsed (label-only rows with [+]).',
    '- **Expected behavior:** Only labels are visible; no body/toolbar until expanded.',
  ]);

  // Expand the demo blip
  const parentRow = pageOwner.locator('.blip-collapsed-row', { hasText: 'Expanded blip demo' }).first();
  await parentRow.click();
  await pageOwner.waitForSelector('[data-testid="blip-menu-read-surface"], .blip-expander', { timeout: 15000 });

  await captureSnapshot(pageOwner, 'blb-expanded-view', [
    '- **What it shows:** Expanded blip with toolbar visible (collapsed neighbors still label-only).',
    '- **Expected behavior:** Toolbar only appears on expanded blip; nested children remain collapsed.',
  ]);

  // Click inline marker to expand inline child
  const marker = pageOwner.locator('.blip-thread-marker').first();
  if (await marker.count()) {
    try {
      await marker.click({ force: true });
    } catch {
      await pageOwner.evaluate(() => {
        const el = document.querySelector('.blip-thread-marker');
        if (el) el.click();
      });
    }
    await pageOwner.waitForSelector('.inline-expanded-blips', { timeout: 10000 });
  }

  await captureSnapshot(pageOwner, 'blb-inline-expanded', [
    '- **What it shows:** Inline [+] marker expanded to reveal child blip inline.',
    '- **Expected behavior:** Clicking [+] expands inline content without navigation.',
  ]);

  // Observer view for unread green [+]
  const contextObserver = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pageObserver = await contextObserver.newPage();
  log('Authenticating observer session');
  await ensureAuth(pageObserver, observerEmail, password);

  await pageObserver.goto(waveUrl, { waitUntil: 'domcontentloaded' });
  await pageObserver.waitForSelector('.blip-collapsed-row', { timeout: 15000 });

  await captureSnapshot(pageObserver, 'blb-unread-green-plus', [
    '- **What it shows:** Collapsed blip rows with green [+] indicator for unread content.',
    '- **Expected behavior:** Unread child blips surface a green [+] marker on collapsed rows.',
  ]);

  await contextObserver.close();
  await contextOwner.close();
  await browser.close();

  log('BLB snapshot run complete.');
})();
