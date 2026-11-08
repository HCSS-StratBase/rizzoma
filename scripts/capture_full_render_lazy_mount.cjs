// Verifies that full-render topic-root waves with more than
// LAZY_MOUNT_THRESHOLD (100) child blips render LazyBlipSlot
// placeholders for off-screen children and only upgrade to the full
// `.rizzoma-blip` component for children near the viewport.
//
// Seeds a 120-blip wave, navigates to the topic in perfRender=full
// mode, counts `[data-testid="lazy-blip-slot"]` vs full
// `.rizzoma-blip[data-blip-id]` elements, and records the ratio. Uses
// the existing test user + /api/topics + /api/blips endpoints (no
// special perf mode required beyond `perfRender=full`).
//
// Usage:
//   node scripts/capture_full_render_lazy_mount.cjs <outDir> [baseUrl]

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForSelector('.rizzoma-layout', { timeout: 15000 });
}

async function apiPost(page, urlPath, body) {
  return await page.evaluate(
    async ({ url, payload }) => {
      const readCookie = (name) => {
        const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
        return match?.[1] ? decodeURIComponent(match[1]) : undefined;
      };
      await fetch('/api/auth/csrf', { credentials: 'include' });
      const token = readCookie('XSRF-TOKEN');
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-csrf-token': token } : {}),
        },
        body: JSON.stringify(payload),
      });
      return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
    },
    { url: urlPath, payload: body },
  );
}

async function createTopic(page, title, content) {
  const r = await apiPost(page, '/api/topics', { title, content });
  if (!r?.ok || !r?.data?.id) throw new Error(`createTopic failed: ${JSON.stringify(r)}`);
  return r.data.id;
}

async function createBlip(page, waveId, parentId, content) {
  const r = await apiPost(page, '/api/blips', { waveId, parentId, content });
  if (!r?.ok || !r?.data) throw new Error(`createBlip failed: ${JSON.stringify(r)}`);
  return { id: r.data.id || r.data._id };
}

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || 'http://127.0.0.1:3000';
  if (!outDir) throw new Error('Usage: node scripts/capture_full_render_lazy_mount.cjs <outDir> [baseUrl]');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page, base, 'codex-live+1774803822194@example.com', 'CodexLive!1');

  const topicTitle = 'Lazy-mount perf test';
  const topicContent = `<h1>${topicTitle}</h1><p>Verifier seed — 120 reply blips below.</p>`;
  const topicId = await createTopic(page, topicTitle, topicContent);

  const BLIP_COUNT = 120;
  console.log(`seeding ${BLIP_COUNT} blips...`);
  for (let i = 0; i < BLIP_COUNT; i++) {
    await createBlip(page, topicId, null, `<p>Reply ${i + 1} of ${BLIP_COUNT} — lorem ipsum content so the label has something to render.</p>`);
  }

  // Navigate in FULL render mode (explicit perfRender=full)
  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma&perf=1&perfRender=full`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await page.waitForTimeout(2500);

  const initialAudit = await page.evaluate(() => ({
    totalListed: document.querySelectorAll('[data-blip-id]').length,
    lazySlots: document.querySelectorAll('[data-testid="lazy-blip-slot"]').length,
    mountedBlips: document.querySelectorAll('.rizzoma-blip:not(.lazy-blip-slot)').length,
    collapsedRows: document.querySelectorAll('.blip-collapsed-row').length,
  }));
  console.log('initial (before scroll):', initialAudit);

  await page.screenshot({ path: path.join(outDir, 'initial.png'), fullPage: false });

  // Scroll to bottom to trigger lazy-mount of below-viewport slots
  await page.evaluate(() => {
    const body = document.querySelector('.wave-container .topic-blip-body') ||
                 document.querySelector('.wave-container .rizzoma-topic-detail');
    if (body) body.scrollTop = body.scrollHeight;
    else window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(1500);

  const afterScrollAudit = await page.evaluate(() => ({
    totalListed: document.querySelectorAll('[data-blip-id]').length,
    lazySlots: document.querySelectorAll('[data-testid="lazy-blip-slot"]').length,
    mountedBlips: document.querySelectorAll('.rizzoma-blip:not(.lazy-blip-slot)').length,
    collapsedRows: document.querySelectorAll('.blip-collapsed-row').length,
  }));
  console.log('after scroll to bottom:', afterScrollAudit);

  await page.screenshot({ path: path.join(outDir, 'after-scroll.png'), fullPage: false });

  fs.writeFileSync(
    path.join(outDir, 'audit.json'),
    JSON.stringify({ topicId, blipCount: BLIP_COUNT, initial: initialAudit, afterScroll: afterScrollAudit }, null, 2),
  );

  // Accept/reject gates
  const ok = {
    labelCount: initialAudit.collapsedRows >= BLIP_COUNT * 0.9,
    lazyUsed: initialAudit.lazySlots > 0,
    mountedFraction: initialAudit.mountedBlips < BLIP_COUNT * 0.5,
  };
  console.log('gates:', ok);
  const allOk = Object.values(ok).every(Boolean);
  if (!allOk) {
    console.error('GATE FAIL — see audit above');
    process.exitCode = 2;
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
