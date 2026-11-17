/**
 * Computed-style smoke: every piece of blip BODY text has the same size, line-height and
 * family, whatever it is (paragraph, bullet, numbered, nested bullet, bare <li>), wherever
 * it is (topic root blip or a child blip) and however it is shown (read or edit mode),
 * on BOTH render paths (React/TipTap and ?render=native).
 *
 * Original Rizzoma: 14px Arial for every text run (static/css/blip.css:860, page.css:16).
 * Regression this guards (2026-11-17): list items 15px vs paragraphs 14px, and the editor
 * falling back to the app shell's -apple-system font stack.
 *
 *   RIZZOMA_BASE_URL=http://localhost:3000 npm run test:body-text
 *
 * Verifies numbers from getComputedStyle. It does NOT replace looking at screenshots.
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const email = process.env.RIZZOMA_E2E_USER || `bodytext+${Date.now()}@example.com`;
const password = process.env.RIZZOMA_E2E_PASSWORD || 'BodyText!1';
const widths = (process.env.RIZZOMA_E2E_WIDTHS || '1366,1600').split(',').map(Number);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const EXPECT = { fontSize: '14px', lineHeight: '22px', family: 'Arial' };

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

const ROOT_HTML = '<h1>BODY TEXT PROBE</h1><p>Paragraph text</p>'
  + '<ul><li><p>Bullet L1</p><ul><li><p>Bullet L2</p><ul><li><p>Bullet L3</p></li></ul></li></ul></li></ul>'
  + '<ol><li><p>Number L1</p><ol><li><p>Number L2</p></li></ol></li></ol>'
  + '<ul><li>Bare li L1<ul><li>Bare li L2</li></ul></li></ul>';
const CHILD_HTML = '<ul><li><p>Child bullet L1</p><ul><li><p>Child bullet L2</p><ul><li><p>Child bullet L3</p></li></ul></li></ul></li>'
  + '<li><p>Child second</p></li></ul><p>Child paragraph</p><ul><li>Child bare li</li></ul><ol><li><p>Child numbered</p></li></ol>';

await seedVerifiedE2EAccount(email, password);
const browser = await chromium.launch({ headless: true });

async function measureAll(page, selector) {
  return page.evaluate((selector) => {
    const rows = [];
    document.querySelectorAll(selector).forEach((root, rootIndex) => {
      root.querySelectorAll('p, li').forEach((el) => {
        if (!Array.from(el.childNodes).some((node) => node.nodeType === 3 && node.textContent.trim())) return;
        const style = getComputedStyle(el);
        rows.push({
          rootIndex,
          text: el.textContent.trim().slice(0, 18),
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        });
      });
    });
    return rows;
  }, selector);
}

function assertUniform(label, rows, minimum) {
  check(`${label}: measured enough text elements`, rows.length >= minimum, `${rows.length} (need ${minimum})`);
  const bad = rows.filter((row) => row.fontSize !== EXPECT.fontSize || row.lineHeight !== EXPECT.lineHeight || row.family !== EXPECT.family);
  check(`${label}: every element is ${EXPECT.fontSize}/${EXPECT.lineHeight} ${EXPECT.family}`, bad.length === 0,
    bad.length ? bad.slice(0, 4).map((row) => `"${row.text}" ${row.fontSize}/${row.lineHeight} ${row.family}`).join('; ') : `${rows.length} elements`);
}

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async ({ email, password }) => {
      await fetch('/api/auth/csrf', { credentials: 'include' });
      const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
      const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
      await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email, password }) });
    }, { email, password });
    const post = (url, body) => page.evaluate(async ({ url, body }) => {
      const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
      const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify(body) });
      return response.json();
    }, { url, body });

    for (const render of ['react', 'native']) {
      const tag = `${render}@${width}`;
      const topic = await post('/api/topics', { title: `BODY TEXT ${Date.now()}`, content: ROOT_HTML });
      const topicId = topic.id || topic._id;
      await post('/api/blips', { waveId: topicId, parentId: null, content: CHILD_HTML });
      await page.goto(`${baseUrl}/?layout=rizzoma&render=${render}#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
      await sleep(6000);
      // expand the child blip (React: collapsed row; native: fold button)
      await page.locator('.blip-collapsed-row, .fold-button, .blip-thread-marker').first().click({ timeout: 3000 }).catch(() => {});
      await sleep(1500);
      const read = await measureAll(page, '.blip-text');
      assertUniform(`${tag} READ (root + child blip, levels 1-3, p/bullet/numbered/bare li)`, read, 12);
      check(`${tag} READ includes the child blip`, new Set(read.map((row) => row.rootIndex)).size >= 2);

      await page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 8000 });
      await sleep(2500);
      const edit = await measureAll(page, '.ProseMirror');
      assertUniform(`${tag} EDIT (root blip, levels 1-3)`, edit, 8);
    }
    await context.close();
  }
} catch (error) {
  check('smoke ran to completion', false, String(error).slice(0, 300));
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join('; ')}` : '\nall body-text checks passed');
process.exit(failures.length ? 1 : 0);
