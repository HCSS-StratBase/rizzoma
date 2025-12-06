import { chromium, firefox, webkit } from 'playwright';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
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

async function ensureSelector(page, selector, description, browserName, options = {}) {
  await page.waitForSelector(selector, options);
  log(browserName, `Found ${description}`);
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
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const topicLink = page.locator('a[href*="#/topic/"]').first();
    await topicLink.waitFor({ timeout: 15000 });
    log(browserName, 'Opening first topic');
    await topicLink.click();
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

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

    log(browserName, 'Toolbar + inline comments smoke completed successfully');
  } catch (error) {
    console.error(`❌ [${browserName}] Toolbar/inline comments smoke failed:`, error);
    await page.screenshot({ path: `toolbar-inline-smoke-${browserName}-failure.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally {
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
