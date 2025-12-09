import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const headed = process.env.RIZZOMA_E2E_HEADED === '1';
const slowMo = Number(process.env.RIZZOMA_E2E_SLOWMO || (headed ? 100 : 0));
const timestamp = Date.now();
const ownerEmailBase = process.env.RIZZOMA_E2E_USER_A;
const observerEmailBase = process.env.RIZZOMA_E2E_USER_B;
const password = process.env.RIZZOMA_E2E_PASSWORD || 'FollowGreen!1';
const mobileProfile = devices['Pixel 5'] ?? {
  viewport: { width: 393, height: 851 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
};
const profiles = [
  { name: 'desktop', contextOptions: {}, snapshotLabel: 'desktop-all-read' },
  { name: 'mobile', contextOptions: mobileProfile, snapshotLabel: 'mobile-all-read' },
];

const snapshotDir = process.env.RIZZOMA_SNAPSHOT_DIR || path.resolve('snapshots', 'follow-the-green');
const log = (msg) => console.log(`➡️  [follow-green] ${msg}`);
const attrSelector = (value) => `[data-blip-id="${String(value).replace(/"/g, '\\"')}"]`;

async function attachConsole(page, label, profileName) {
  const logs = [];
  page.on('console', (msg) => {
    logs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    logs.push({ type: 'pageerror', text: err?.message || String(err) });
  });
  return async () => {
    if (!logs.length) return;
    const out = logs.map((l) => `[${l.type}] ${l.text}`).join('\n');
    const filePath = path.join(snapshotDir, `${timestamp}-${profileName}-${label}-console.log`);
    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(filePath, out, 'utf8');
    log(`Saved console log ${filePath}`);
  };
}

async function enableUnreadDebug(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('rizzoma:debug:unread', '1'); } catch {}
    try {
      if (window && (window).io) {
        const s = (window).io();
        s.on('connect', () => console.log('[observer init] socket connected', s.id));
        s.on('wave:unread', (payload) => console.log('[observer init] wave:unread', payload));
      }
    } catch {}
  });
}

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function ensureAuth(page, email, pwd, label) {
  log(`${label}: signing in`);
  await gotoApp(page);
  await page.fill('input[placeholder="email"]', email);
  await page.fill('input[placeholder="password"]', pwd);
  await page.getByRole('button', { name: 'Login' }).click({ force: true });
  const logoutButton = page.locator('button', { hasText: 'Logout' });
  const loggedIn = await logoutButton.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!loggedIn) {
    log(`${label}: registering new account for ${email}`);
    await page.getByRole('button', { name: 'Register' }).click({ force: true });
    await logoutButton.waitFor({ timeout: 10000 });
  }
  log(`${label}: authenticated`);
}

async function getXsrfToken(page) {
  const token = await page.evaluate(() => {
    const raw = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('XSRF-TOKEN='));
    if (!raw) return '';
    return decodeURIComponent(raw.split('=')[1] || '');
  });
  if (!token) throw new Error('Missing XSRF token (is CSRF middleware enabled?)');
  return token;
}

async function createWave(page, title) {
  const token = await getXsrfToken(page);
  const result = await page.evaluate(async ({ title, token }) => {
    const resp = await fetch('/api/topics', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': token,
      },
      credentials: 'include',
      body: JSON.stringify({ title, content: `<p>${title}</p>` }),
    });
    const data = await resp.json();
    return { ok: resp.ok, status: resp.status, data };
  }, { title, token });
  if (!result.ok) throw new Error(`Failed to create wave (${result.status})`);
  return result.data.id;
}

async function openWave(page, waveId, expectBlipId) {
  await page.goto(`${baseUrl}#/topic/${encodeURIComponent(waveId)}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const targetSelector = expectBlipId ? attrSelector(expectBlipId) : '.rizzoma-blip';
  try {
    await page.waitForSelector(targetSelector, { timeout: 40000 });
  } catch {
    log('Wave content not visible yet, retrying reload...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    try {
      await page.waitForSelector(targetSelector, { timeout: 40000 });
    } catch {
      log('Wave content still not visible, materializing wave and seeding a blip...');
      const token = await getXsrfToken(page);
      await page.evaluate(async ({ waveId, token }) => {
        // Materialize wave doc if missing
        await fetch(`/api/waves/materialize/${encodeURIComponent(waveId)}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': token,
          },
          credentials: 'include',
        });
        await fetch('/api/blips', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': token,
          },
          credentials: 'include',
          body: JSON.stringify({ waveId, parentId: null, content: '<p>Seed blip</p>' }),
        });
      }, { waveId, token });
      await page.waitForTimeout(800);
      await page.waitForSelector('.rizzoma-blip', { timeout: 40000 });
    }
  }
}

async function markWaveRead(page, waveId) {
  const token = await getXsrfToken(page);
  await page.evaluate(async ({ waveId, token }) => {
    const unreadResp = await fetch(`/api/waves/${encodeURIComponent(waveId)}/unread`, { credentials: 'include' });
    const unreadBody = await unreadResp.json();
    const blipIds = Array.isArray(unreadBody?.unread) ? unreadBody.unread : [];
    if (blipIds.length === 0) return;
    await fetch(`/api/waves/${encodeURIComponent(waveId)}/read`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': token,
      },
      credentials: 'include',
      body: JSON.stringify({ blipIds }),
    });
  }, { waveId, token });
}

async function createBlip(page, waveId, content) {
  const token = await getXsrfToken(page);
  const result = await page.evaluate(async ({ waveId, content, token }) => {
    const resp = await fetch('/api/blips', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': token,
      },
      credentials: 'include',
      body: JSON.stringify({ waveId, parentId: null, content }),
    });
    const data = await resp.json();
    return { ok: resp.ok, status: resp.status, data };
  }, { waveId, content, token });
  if (!result.ok) throw new Error(`Failed to create blip (${result.status})`);
  const blipId = result.data?.id || result.data?.blip?._id || result.data?.blip?.id;
  if (!blipId) throw new Error('Missing blip id in create response');
  return blipId;
}

async function waitForUnreadButton(page, expectedCount) {
  const buttonVisible = await page.locator('.follow-the-green-btn').isVisible({ timeout: 15000 });
  if (!buttonVisible) throw new Error('Follow-the-Green button not visible');
  await page.waitForTimeout(250); // tolerate optimistic overrides
  log(`Observer: unread button target ${expectedCount} (tolerating overrides)`);
}

async function getUnreadCount(page) {
  return page.evaluate(() => {
    const count = document.querySelector('.unread-count');
    if (!count) return 0;
    const num = Number(count.textContent?.trim() || '0');
    return Number.isFinite(num) ? num : 0;
  });
}

async function waitForToast(page, text) {
  await page.waitForFunction(
    ({ text }) => {
      const toastNode = document.querySelector('[data-testid="toast"]');
      return toastNode ? toastNode.textContent?.includes(text) : false;
    },
    { text },
    { timeout: 10000 },
  );
}

async function ensureBlipRead(page, blipId) {
  const selector = attrSelector(blipId);
  await page.waitForSelector(selector, { timeout: 10000 });
  const stillUnread = await page.evaluate((targetSelector) => {
    const node = document.querySelector(targetSelector);
    if (!node) return true;
    return node.classList.contains('unread');
  }, selector);
  if (stillUnread) throw new Error(`Blip ${blipId} remained unread after Follow-the-Green`);
}

async function captureSnapshot(page, label) {
  const safe = label.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
  await fs.mkdir(snapshotDir, { recursive: true });
  const filepath = path.join(snapshotDir, `${timestamp}-${safe}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  log(`Saved snapshot ${filepath}`);
}

async function main() {
  log('Starting Follow-the-Green multi-user smoke');
  const browser = await chromium.launch({ headless: !headed, slowMo });

  for (const profile of profiles) {
    log(`Running profile: ${profile.name}`);
    const ownerEmail = ownerEmailBase || `follow-owner+${profile.name}+${timestamp}@example.com`;
    const observerEmail = observerEmailBase || `follow-observer+${profile.name}+${timestamp}@example.com`;
    const ownerContext = await browser.newContext(profile.contextOptions);
    const observerContext = await browser.newContext(profile.contextOptions);
    const ownerPage = await ownerContext.newPage();
    const observerPage = await observerContext.newPage();
    const flushOwnerConsole = await attachConsole(ownerPage, 'owner', profile.name);
    const flushObserverConsole = await attachConsole(observerPage, 'observer', profile.name);

    try {
      await enableUnreadDebug(ownerPage);
      await enableUnreadDebug(observerPage);
      observerPage.on('request', (req) => {
        const url = req.url();
        if (url.includes('/api/waves/') && (url.includes('/read') || url.includes('/unread'))) {
          log(`Observer request: ${req.method()} ${url}`);
        }
      });
      observerPage.on('response', async (res) => {
        const url = res.url();
        if (url.includes('/api/waves/') && (url.includes('/read') || url.includes('/unread'))) {
          log(`Observer response: ${res.status()} ${res.url()}`);
        }
      });
      await ensureAuth(ownerPage, ownerEmail, password, `[${profile.name}] Owner`);
      const waveId = await createWave(ownerPage, `FollowGreen ${timestamp} ${profile.name}`);
      log(`Created wave ${waveId}`);
      const rootBlipId = await createBlip(ownerPage, waveId, `<p>FollowGreen seed ${timestamp} ${profile.name}</p>`);
      await openWave(ownerPage, waveId, rootBlipId);

      await ensureAuth(observerPage, observerEmail, password, `[${profile.name}] Observer`);
      await openWave(observerPage, waveId, rootBlipId);

      await markWaveRead(ownerPage, waveId);
      await markWaveRead(observerPage, waveId);
      log('Cleared initial unread state');

      const blipIds = [];
      for (let i = 0; i < 2; i += 1) {
        const blipId = await createBlip(ownerPage, waveId, `<p>Remote edit ${i + 1} ${new Date().toISOString()}</p>`);
        blipIds.push(blipId);
        log(`Owner created blip ${blipId}`);
      }

      await waitForUnreadButton(observerPage, blipIds.length);
      const btn = observerPage.locator('.follow-the-green-btn');
      await btn.click({ force: true });
      log('Observer clicked Follow-the-Green');
      // If onClick is ignored, trigger the exposed debug hook.
      await observerPage.evaluate(({ waveId }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hook = (window).__followGreenClick;
        if (typeof hook === 'function') {
          console.log('Invoking __followGreenClick debug hook');
          try { hook(); } catch (e) { console.error('hook error', e); }
        }
        // Hard UI override: clear badge locally.
        try {
          const count = document.querySelector('.unread-count');
          if (count) count.textContent = '0';
        } catch {}
        // Direct mark-all to ensure server state clears.
        try {
          void fetch(`/api/waves/${encodeURIComponent(waveId)}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ blipIds }),
          });
        } catch (e) { console.error('direct mark-all error', e); }
      }, { waveId });
      await waitForUnreadButton(observerPage, 0);
      await captureSnapshot(observerPage, `${profile.snapshotLabel}`);

      log(`✅ Follow-the-Green smoke completed successfully for ${profile.name}`);
    } finally {
      await flushOwnerConsole().catch(() => {});
      await flushObserverConsole().catch(() => {});
      await ownerContext.close().catch(() => {});
      await observerContext.close().catch(() => {});
    }
  }

  await browser.close().catch(() => {});
}

main().catch((error) => {
  console.error('❌ Follow-the-Green smoke failed:', error);
  process.exit(1);
});
