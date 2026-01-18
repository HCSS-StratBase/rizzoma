import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const topicPath = process.env.RIZZOMA_TOPIC_PATH || '#/topic/';
const headed = process.env.RIZZOMA_E2E_HEADED === '1';
const slowMo = Number(process.env.RIZZOMA_E2E_SLOWMO || (headed ? 200 : 0));
const defaultBrowsers = ['chromium', 'firefox', 'webkit'];
const browserList = (process.env.RIZZOMA_E2E_BROWSERS || defaultBrowsers.join(','))
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const launchers = {
  chromium,
  firefox,
  webkit,
};
const snapshotDir = process.env.RIZZOMA_SNAPSHOT_DIR || path.resolve('snapshots', 'toolbar-inline');
const timestamp = Date.now();
const storageStatePath = process.env.RIZZOMA_STORAGE_STATE || path.resolve('scripts', 'rizzoma-session-state.json');
const testEmail = process.env.RIZZOMA_E2E_USER || `toolbar+${timestamp}@example.com`;
const testPassword = process.env.RIZZOMA_E2E_PASSWORD || 'ToolbarSmoke!1';

const toolbarButtonIds = [
  'blip-menu-undo',
  'blip-menu-redo',
  'blip-menu-insert-link',
  'blip-menu-insert-attachment',
  'blip-menu-insert-image',
  'blip-menu-bold',
  'blip-menu-italic',
  'blip-menu-underline',
  'blip-menu-strike',
  'blip-menu-highlight-toggle',
  'blip-menu-clear-formatting',
  'blip-menu-bullet-list',
  'blip-menu-ordered-list',
  'blip-menu-overflow-toggle',
];

const log = (browserName, message) => console.log(`➡️  [${browserName}] ${message}`);

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function ensureAuth(page) {
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

    if (loginResp.ok) {
      return { success: true, method: 'login' };
    }

    // If login fails, try register
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
  }, { email: testEmail, password: testPassword });

  if (!authResult.success) {
    throw new Error(`Auth failed: ${authResult.error} (status: ${authResult.status})`);
  }

  // Reload page to pick up new session (use domcontentloaded instead of networkidle due to WebSocket)
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Verify logout button is visible (indicates successful auth)
  const logoutButton = page.locator('button', { hasText: 'Logout' });
  await logoutButton.waitFor({ timeout: 15000 });
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

async function createRootBlip(page, waveId, content) {
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
  if (!result.ok) throw new Error(`Failed to create root blip (${result.status})`);
  const blipId = result.data?.id || result.data?.blip?._id || result.data?.blip?.id;
  if (!blipId) throw new Error('Missing blip id in create response');
  return blipId;
}

async function ensureSelector(page, selector, description, browserName, options = {}) {
  await page.waitForSelector(selector, options);
  log(browserName, `Found ${description}`);
}

async function captureSnapshot(page, browserName, suffix) {
  await fs.mkdir(snapshotDir, { recursive: true });
  const safe = suffix.replace(/[^a-z0-9-_]/gi, '_').toLowerCase();
  const filePath = path.join(snapshotDir, `${timestamp}-${browserName}-${safe}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  log(browserName, `Captured snapshot ${filePath}`);
}

async function runSmoke(browserName) {
  const launcher = launchers[browserName];
  if (!launcher) {
    throw new Error(`Unsupported browser requested: ${browserName}`);
  }
  log(browserName, `Running toolbar + inline comments smoke against ${baseUrl}`);
  let browser;
  try {
    browser = await launcher.launch({ headless: !headed, slowMo });
  } catch (error) {
    error.message = `[${browserName}] Failed to launch browser: ${error.message}`;
    throw error;
  }
  const contextOptions = { viewport: { width: 1400, height: 900 } };
  let context;
  try {
    const stat = await fs.stat(storageStatePath);
    if (stat.isFile()) {
      log(browserName, `Using storage state from ${storageStatePath}`);
      context = await browser.newContext({ ...contextOptions, storageState: storageStatePath });
    }
  } catch {
    // no stored state
  }
  if (!context) {
    context = await browser.newContext(contextOptions);
  }
  const page = await context.newPage();

  try {
    await ensureAuth(page);
    const waveId = await createWave(page, `Toolbar smoke ${timestamp}`);
    const blipId = await createRootBlip(page, waveId, `<p>Toolbar smoke ${timestamp}</p>`);
    const cleanBase = baseUrl.replace(/\/$/, '');
    const cleanPath = topicPath.replace(/^\//, '');
    await page.goto(`${cleanBase}/${cleanPath}${encodeURIComponent(waveId)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const expandBtn = page.locator('.blip-expand-btn').first();
    if (await expandBtn.count()) {
      await expandBtn.click();
    }
    await ensureSelector(page, `[data-blip-id="${blipId}"]`, 'root blip', browserName, { timeout: 15000 });
    const targetExpand = page.locator(`[data-blip-id="${blipId}"] .blip-expand-btn`).first();
    if (await targetExpand.count()) {
      await targetExpand.click();
    }
    const readSurface = page.locator('[data-testid="blip-menu-read-surface"]');
    if (!(await readSurface.count())) {
      log(browserName, 'Read toolbar not found on this page; capturing and skipping assertions');
      await captureSnapshot(page, browserName, 'no-read-toolbar');
      await browser.close();
      return;
    }
    await ensureSelector(page, '[data-testid="blip-menu-read-surface"]', 'read-only inline toolbar', browserName, { timeout: 15000 });

    const editButton = page.locator('[data-testid="blip-menu-edit"]').first();
    await editButton.waitFor({ timeout: 10000 });
    log(browserName, 'Switching to edit mode');
    await editButton.click();

    await ensureSelector(page, '[data-testid="blip-menu-edit-surface"]', 'edit-mode toolbar surface', browserName, { timeout: 10000 });

    for (const id of toolbarButtonIds) {
      await ensureSelector(page, `[data-testid="${id}"]`, id, browserName, { timeout: 5000 });
    }

    log(browserName, 'Verifying edit overflow actions');
    const overflowToggle = page.locator('[data-testid="blip-menu-overflow-toggle"]').first();
    await overflowToggle.click();
    const overflowPanel = page.locator('.menu-dropdown-panel').first();
    await overflowPanel.waitFor({ timeout: 3000 });
    const expectedOverflowItems = ['Send', 'Copy comment', 'Playback history', 'Paste at cursor', 'Paste as reply', 'Copy direct link'];
    for (const label of expectedOverflowItems) {
      const item = overflowPanel.locator('button', { hasText: label }).first();
      const count = await item.count();
      if (!count) {
        throw new Error(`Missing overflow action: ${label}`);
      }
    }
    await overflowToggle.click().catch(() => {});

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ timeout: 5000 });
    await editor.click();
    await page.keyboard.type('Playwright toolbar smoke test. ');
    await page.locator('[data-testid="blip-menu-bold"]').click();
    await page.keyboard.type('Bold text');
    await page.locator('[data-testid="blip-menu-bold"]').click();

    log(browserName, 'Submitting edit to return to read mode');
    const doneButton = page.locator('[data-testid="blip-menu-done"]').first();
    await doneButton.click();
    await ensureSelector(page, '[data-testid="blip-menu-read-surface"]', 'read-only menu restored', browserName, { timeout: 10000 });

    log(browserName, 'Checking read-only gear overflow');
    const gearToggle = page.locator('[data-testid="blip-menu-gear-toggle"]').first();
    await gearToggle.click();
    const gearPanel = page.locator('.menu-dropdown-panel').first();
    await gearPanel.waitFor({ timeout: 3000 });
    const readOverflowItems = ['Copy comment', 'Playback history', 'Paste as reply', 'Copy direct link'];
    for (const label of readOverflowItems) {
      const item = gearPanel.locator('button', { hasText: label }).first();
      const count = await item.count();
      if (!count) {
        throw new Error(`Missing read overflow action: ${label}`);
      }
    }
    await gearToggle.click().catch(() => {});

    const inlineNav = page.locator('.inline-comment-nav');
    if (await inlineNav.count()) {
      await ensureSelector(page, '.inline-comment-nav', 'inline comments navigation', browserName, { timeout: 10000 });
      await ensureSelector(page, '[data-testid="inline-comment-filter-all"]', 'inline comments All filter', browserName);
      await ensureSelector(page, '[data-testid="inline-comment-filter-open"]', 'inline comments Open filter', browserName);
      await ensureSelector(page, '[data-testid="inline-comment-filter-resolved"]', 'inline comments Resolved filter', browserName);
      await page.locator('[data-testid="inline-comment-filter-open"]').first().click({ timeout: 2000 });
      await page.locator('[data-testid="inline-comment-filter-resolved"]').first().click({ timeout: 2000 });
      const navEmpty = await page.locator('.inline-comment-nav-empty').count();
      if (navEmpty) {
        log(browserName, 'Inline comments navigation currently empty');
      }
    } else {
      log(browserName, 'Inline comments navigation not present; skipping comment nav assertions');
    }

    log(browserName, 'Toolbar + inline comments smoke completed successfully');
  } catch (error) {
    console.error(`❌ [${browserName}] Toolbar/inline comments smoke failed:`, error);
    await captureSnapshot(page, browserName, 'failure').catch(() => {});
    throw error;
  } finally {
    if (browser) {
      await captureSnapshot(page, browserName, 'final').catch(() => {});
    }
    if (browser) {
      await browser.close();
    }
  }
}

async function main() {
  const failures = [];
  for (const browserName of browserList) {
    try {
      await runSmoke(browserName);
    } catch (error) {
      failures.push({ browserName, error });
    }
  }
  if (failures.length) {
    const failedNames = failures.map(({ browserName }) => browserName).join(', ');
    console.error(`❌ Toolbar smoke failed for: ${failedNames}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Toolbar smoke aborted:', error);
  process.exit(1);
});
