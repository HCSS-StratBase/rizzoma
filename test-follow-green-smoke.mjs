import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

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
const allProfiles = [
  { name: 'desktop', contextOptions: {}, snapshotLabel: 'desktop-all-read' },
  { name: 'mobile', contextOptions: mobileProfile, snapshotLabel: 'mobile-all-read' },
];
// Allow running specific profiles via env var (default: desktop only for faster CI)
const profileFilter = process.env.RIZZOMA_E2E_PROFILES?.split(',') || ['desktop'];
const profiles = allProfiles.filter(p => profileFilter.includes(p.name));

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

  // Use direct API calls to avoid UI timing issues (bcrypt takes 6-8s)
  const authResult = await page.evaluate(async ({ email, password }) => {
    // Get CSRF token first
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrfCookie = document.cookie.split('; ').find(c => c.startsWith('XSRF-TOKEN='));
    const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.split('=')[1] || '') : '';

    const headers = {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
    };

    // Try login first
    const loginResp = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (loginResp.ok) return { success: true, method: 'login' };
    return { success: false, error: await loginResp.text(), status: loginResp.status };
  }, { email, password: pwd });

  if (!authResult.success) {
    throw new Error(`Auth failed for ${label}: ${authResult.error} (status: ${authResult.status})`);
  }

  // Reload page to pick up new session (use domcontentloaded instead of networkidle due to WebSocket)
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Verify the authenticated layout is visible (indicates successful auth)
  const layoutMarker = page.locator('.rizzoma-layout');
  await layoutMarker.waitFor({ timeout: 15000 });
  log(`${label}: authenticated`);
}

async function getXsrfToken(page, timeoutMs = 5000) {
  const token = await Promise.race([
    page.evaluate(() => {
      const raw = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('XSRF-TOKEN='));
      if (!raw) return '';
      return decodeURIComponent(raw.split('=')[1] || '');
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('getXsrfToken timeout')), timeoutMs)),
  ]);
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
  await page.waitForTimeout(500);

  // First wait for any blip (the root blip renders immediately from topic data)
  try {
    await page.waitForSelector('.rizzoma-blip', { timeout: 15000 });
    log('Root blip visible');
  } catch {
    log('Root blip not visible yet, retrying reload...');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    try {
      await page.waitForSelector('.rizzoma-blip', { timeout: 15000 });
    } catch {
      log('Root blip still not visible, materializing wave...');
      const token = await getXsrfToken(page);
      await page.evaluate(async ({ waveId, token }) => {
        await fetch(`/api/waves/materialize/${encodeURIComponent(waveId)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': token },
          credentials: 'include',
        });
      }, { waveId, token });
      await page.waitForTimeout(500);
      await page.waitForSelector('.rizzoma-blip', { timeout: 15000 });
    }
  }

  // If expecting a specific child blip, wait briefly (child blips load async via API)
  // Skip the wait if it's slowing things down - root blip is enough to proceed
  if (expectBlipId) {
    const childSelector = attrSelector(expectBlipId);
    try {
      await page.waitForSelector(childSelector, { timeout: 5000 });
      log(`Child blip visible`);
    } catch {
      // Child blips may not have loaded yet - that's OK, test can proceed
    }
  }
}

async function fetchUnreadState(page, waveId) {
  const result = await page.evaluate(async (targetWaveId) => {
    const response = await fetch(`/api/waves/${encodeURIComponent(targetWaveId)}/unread`, {
      credentials: 'include',
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: response.ok, status: response.status, text, data };
  }, waveId);
  if (!result.ok) {
    throw new Error(`Unread fetch failed (${result.status}): ${result.text.slice(0, 300)}`);
  }
  if (!result.data || !Array.isArray(result.data.unread)) {
    throw new Error(`Unread response is missing an array: ${result.text.slice(0, 300)}`);
  }
  return result.data;
}

async function markWaveRead(page, waveId, label = 'page') {
  log(`markWaveRead [${label}] starting...`);
  const operation = (async () => {
    const unreadBody = await fetchUnreadState(page, waveId);
    const blipIds = unreadBody.unread.map((id) => String(id));
    if (blipIds.length === 0) return 'no_unread';
    const token = await getXsrfToken(page);
    const result = await page.evaluate(async ({ targetWaveId, ids, csrf }) => {
      const response = await fetch(`/api/waves/${encodeURIComponent(targetWaveId)}/read`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
        },
        credentials: 'include',
        body: JSON.stringify({ blipIds: ids }),
      });
      return { ok: response.ok, status: response.status, text: await response.text() };
    }, { targetWaveId: waveId, ids: blipIds, csrf: token });
    if (!result.ok) {
      throw new Error(`Mark-read failed (${result.status}): ${result.text.slice(0, 300)}`);
    }
    return `marked_${blipIds.length}`;
  })();
  const result = await Promise.race([
    operation,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`markWaveRead [${label}] timeout`)), 30000)),
  ]);
  log(`markWaveRead [${label}] complete: ${result}`);
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
  await page.waitForFunction((count) => {
    const button = document.querySelector('button.next-button.has-unread');
    if (!(button instanceof HTMLButtonElement) || button.disabled || button.offsetParent === null) return false;
    return button.title.startsWith(`${count} unread`);
  }, expectedCount, { timeout: 15000 });
  log(`Observer: real Next button shows ${expectedCount} unread`);
}

async function getUnreadCount(page) {
  return page.evaluate(() => {
    const button = document.querySelector('button.next-button');
    const match = button?.getAttribute('title')?.match(/^(\d+) unread/);
    const num = Number(match?.[1] || '0');
    return Number.isFinite(num) ? num : 0;
  });
}

async function waitForUnreadIds(page, waveId, expectedIds, timeoutMs = 15000) {
  const expected = [...expectedIds].map(String).sort();
  const deadline = Date.now() + timeoutMs;
  let actual = [];
  while (Date.now() < deadline) {
    const state = await fetchUnreadState(page, waveId);
    actual = state.unread.map((id) => String(id)).sort();
    if (JSON.stringify(actual) === JSON.stringify(expected)) return state;
    await page.waitForTimeout(250);
  }
  throw new Error(`Unread IDs did not converge: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
  await page.screenshot({ path: filepath, fullPage: false });
  log(`Saved snapshot ${filepath}`);
}

async function main() {
  log('Starting Follow-the-Green multi-user smoke');
  const browser = await chromium.launch({ headless: !headed, slowMo });

  for (const profile of profiles) {
    log(`Running profile: ${profile.name}`);
    const ownerEmail = ownerEmailBase || `follow-owner+${profile.name}+${timestamp}@example.com`;
    const observerEmail = observerEmailBase || `follow-observer+${profile.name}+${timestamp}@example.com`;
    const ownerFixture = await seedVerifiedE2EAccount(ownerEmail, password);
    await seedVerifiedE2EAccount(observerEmail, password);
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
      await seedAcceptedParticipant(waveId, observerEmail, 'viewer', ownerFixture._id);
      const viewerAccess = await observerPage.evaluate(async (id) => {
        const response = await fetch(`/api/topics/${encodeURIComponent(id)}`, { credentials: 'include' });
        const data = await response.json().catch(() => null);
        return { status: response.status, role: data?.permissions?.role, canRead: data?.permissions?.canRead, canEdit: data?.permissions?.canEdit };
      }, waveId);
      if (viewerAccess.status !== 200 || viewerAccess.role !== 'viewer' || !viewerAccess.canRead || viewerAccess.canEdit) {
        throw new Error(`Observer viewer policy mismatch: ${JSON.stringify(viewerAccess)}`);
      }
      await openWave(observerPage, waveId, rootBlipId);

      await markWaveRead(ownerPage, waveId, 'owner');
      await markWaveRead(observerPage, waveId, 'observer');
      log('Cleared initial unread state');

      const blipIds = [];
      for (let i = 0; i < 2; i += 1) {
        const blipId = await createBlip(ownerPage, waveId, `<p>Remote edit ${i + 1} ${new Date().toISOString()}</p>`);
        blipIds.push(blipId);
        log(`Owner created blip ${blipId}`);
      }

      let unreadState = await waitForUnreadIds(observerPage, waveId, blipIds);
      await waitForUnreadButton(observerPage, blipIds.length);
      await captureSnapshot(observerPage, `${profile.name}-two-unread`);

      for (let remaining = blipIds.length; remaining > 0; remaining -= 1) {
        const nextId = String(unreadState.unread[0]);
        const expectedAfterClick = unreadState.unread.slice(1).map((id) => String(id));
        await observerPage.locator('button.next-button.has-unread').click();
        unreadState = await waitForUnreadIds(observerPage, waveId, expectedAfterClick);
        await ensureBlipRead(observerPage, nextId);
        if (expectedAfterClick.length > 0) {
          await waitForUnreadButton(observerPage, expectedAfterClick.length);
        }
        log(`Observer real Next click drained ${remaining} → ${expectedAfterClick.length}`);
      }

      await observerPage.waitForFunction(() => {
        const button = document.querySelector('button.next-button');
        return button instanceof HTMLButtonElement && !button.classList.contains('has-unread');
      }, undefined, { timeout: 15000 });
      const finalUiCount = await getUnreadCount(observerPage);
      if (finalUiCount !== 0) throw new Error(`Next button still reports ${finalUiCount} unread`);
      for (const blipId of blipIds) await ensureBlipRead(observerPage, blipId);
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
