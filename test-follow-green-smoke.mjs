import { chromium } from 'playwright';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const headed = process.env.RIZZOMA_E2E_HEADED === '1';
const slowMo = Number(process.env.RIZZOMA_E2E_SLOWMO || (headed ? 100 : 0));
const timestamp = Date.now();
const ownerEmail = process.env.RIZZOMA_E2E_USER_A || `follow-owner+${timestamp}@example.com`;
const observerEmail = process.env.RIZZOMA_E2E_USER_B || `follow-observer+${timestamp}@example.com`;
const password = process.env.RIZZOMA_E2E_PASSWORD || 'FollowGreen!1';

const log = (msg) => console.log(`➡️  [follow-green] ${msg}`);
const attrSelector = (value) => `[data-blip-id="${String(value).replace(/"/g, '\\"')}"]`;

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function ensureAuth(page, email, pwd, label) {
  log(`${label}: signing in`);
  await gotoApp(page);
  await page.fill('input[placeholder="email"]', email);
  await page.fill('input[placeholder="password"]', pwd);
  await page.getByRole('button', { name: 'Login' }).click();
  const logoutButton = page.locator('button', { hasText: 'Logout' });
  const loggedIn = await logoutButton.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!loggedIn) {
    log(`${label}: registering new account for ${email}`);
    await page.getByRole('button', { name: 'Register' }).click();
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

async function openWave(page, waveId) {
  await page.goto(`${baseUrl}#/wave/${encodeURIComponent(waveId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(attrSelector(waveId), { timeout: 20000 });
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
      body: JSON.stringify({ waveId, parentId: waveId, content }),
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
  await page.waitForFunction(
    ({ expectedCount }) => {
      const btn = document.querySelector('.follow-the-green-btn');
      if (!btn) return false;
      const count = btn.querySelector('.unread-count');
      return count && count.textContent?.trim() === String(expectedCount);
    },
    { expectedCount },
    { timeout: 15000 },
  );
  log(`Observer: unread button shows ${expectedCount}`);
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

async function main() {
  log('Starting Follow-the-Green multi-user smoke');
  const browser = await chromium.launch({ headless: !headed, slowMo });
  const ownerContext = await browser.newContext();
  const observerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const observerPage = await observerContext.newPage();

  try {
    await ensureAuth(ownerPage, ownerEmail, password, 'Owner');
    const waveId = await createWave(ownerPage, `FollowGreen ${timestamp}`);
    log(`Created wave ${waveId}`);
    await openWave(ownerPage, waveId);

    await ensureAuth(observerPage, observerEmail, password, 'Observer');
    await openWave(observerPage, waveId);

    await markWaveRead(ownerPage, waveId);
    await markWaveRead(observerPage, waveId);
    log('Cleared initial unread state');

    const blipId = await createBlip(ownerPage, waveId, `<p>Remote edit ${new Date().toISOString()}</p>`);
    log(`Owner created blip ${blipId}`);

    await waitForUnreadButton(observerPage, 1);
    await observerPage.click('.follow-the-green-btn');
    log('Observer clicked Follow-the-Green');
    await observerPage.waitForSelector('.follow-the-green-btn', { state: 'detached', timeout: 10000 }).catch(() => {});
    await ensureBlipRead(observerPage, blipId);
    log('Blip marked read and highlight cleared');

    log('✅ Follow-the-Green smoke completed successfully');
  } finally {
    await ownerContext.close().catch(() => {});
    await observerContext.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('❌ Follow-the-Green smoke failed:', error);
  process.exit(1);
});
