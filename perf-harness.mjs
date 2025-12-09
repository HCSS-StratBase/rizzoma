import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const headed = process.env.RIZZOMA_E2E_HEADED === '1';
const slowMo = Number(process.env.RIZZOMA_E2E_SLOWMO || (headed ? 100 : 0));
const blipTarget = Number(process.env.RIZZOMA_PERF_BLIPS || 5000);
const ownerEmail = process.env.RIZZOMA_E2E_USER_A || `perf-owner+${Date.now()}@example.com`;
const password = process.env.RIZZOMA_E2E_PASSWORD || 'PerfHarness!1';
const snapshotDir = process.env.RIZZOMA_SNAPSHOT_DIR || path.resolve('snapshots', 'perf');
const timestamp = Date.now();

const log = (msg) => console.log(`➡️  [perf] ${msg}`);

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function ensureAuth(page, email, pwd) {
  log(`Authenticating ${email}`);
  await gotoApp(page);
  await page.fill('input[placeholder="email"]', email);
  await page.fill('input[placeholder="password"]', pwd);
  await page.getByRole('button', { name: 'Login' }).click();
  const logoutButton = page.locator('button', { hasText: 'Logout' });
  const loggedIn = await logoutButton.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!loggedIn) {
    log(`Registering ${email}`);
    await page.getByRole('button', { name: 'Register' }).click();
    await logoutButton.waitFor({ timeout: 10000 });
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

async function createWave(page, title) {
  const token = await getXsrfToken(page);
  const result = await page.evaluate(
    async ({ title, token }) => {
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
    },
    { title, token },
  );
  if (!result.ok) throw new Error(`Failed to create wave (${result.status})`);
  return result.data.id;
}

async function createBlip(page, waveId, content) {
  const token = await getXsrfToken(page);
  const result = await page.evaluate(
    async ({ waveId, content, token }) => {
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
    },
    { waveId, content, token },
  );
  if (!result.ok) throw new Error(`Failed to create blip (${result.status})`);
  return result.data?.id || result.data?.blip?._id || result.data?.blip?.id;
}

async function seedWave(page, waveId) {
  log(`Seeding ${blipTarget} blips into wave ${waveId}`);
  for (let i = 0; i < blipTarget; i += 1) {
    const content = `<p>Perf seed ${i + 1}</p>`;
    await createBlip(page, waveId, content);
    if ((i + 1) % 250 === 0) {
      log(`Seeded ${(i + 1).toLocaleString()} blips`);
    }
  }
}

async function captureMetrics(waveId, creds) {
  await fs.mkdir(snapshotDir, { recursive: true });
  const browser = await chromium.launch({ headless: !headed, slowMo });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await ensureAuth(page, creds.email, creds.password);
  const url = `${baseUrl}#/topic/${encodeURIComponent(waveId)}?layout=rizzoma`;
  log(`Capturing TTF render for ${url}`);
  const start = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.rizzoma-blip', { timeout: 60000 });
  // Get comprehensive performance metrics
  const perfData = await page.evaluate(() => {
    const paintMetrics = performance.getEntriesByType('paint');
    const navMetrics = performance.getEntriesByType('navigation')[0];
    
    // Custom app metrics if available
    const appMetrics = window.PerformanceMonitor ? window.PerformanceMonitor.getMetrics() : {};
    
    return {
      timeToFirstRender: performance.now(),
      firstPaint: paintMetrics.find(m => m.name === 'first-paint')?.startTime || 0,
      firstContentfulPaint: paintMetrics.find(m => m.name === 'first-contentful-paint')?.startTime || 0,
      domComplete: navMetrics?.domComplete || 0,
      loadComplete: navMetrics?.loadEventEnd || 0,
      memoryUsage: performance.memory ? {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024), // MB
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024), // MB
      } : null,
      appMetrics, // React component render times, etc.
      blipCount: document.querySelectorAll('.rizzoma-blip').length
    };
  });

  const screenshotPath = path.join(snapshotDir, `render-${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  
  const metrics = {
    timestamp,
    waveId,
    expectedBlips: blipTarget,
    actualBlips: perfData.blipCount,
    performance: {
      timeToFirstRender: Number(perfData.timeToFirstRender.toFixed(2)),
      firstContentfulPaint: Number(perfData.firstContentfulPaint.toFixed(2)),
      domComplete: Number(perfData.domComplete.toFixed(2)),
      loadComplete: Number(perfData.loadComplete.toFixed(2)),
      memoryUsage: perfData.memoryUsage,
      appMetrics: perfData.appMetrics
    },
    url,
    screenshot: screenshotPath,
    startedAt: start,
    benchmarks: {
      // Performance targets
      firstRenderTarget: 3000, // 3s for 5k blips
      memoryTarget: 100, // 100MB max
      passed: perfData.timeToFirstRender < 3000 && (perfData.memoryUsage?.used || 0) < 100
    }
  };
  const metricsPath = path.join(snapshotDir, `metrics-${timestamp}.json`);
  await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));
  
  // Enhanced logging
  const perf = metrics.performance;
  log(`📊 Performance Results:`);
  log(`  Time to First Render: ${perf.timeToFirstRender}ms`);
  log(`  First Contentful Paint: ${perf.firstContentfulPaint}ms`);
  log(`  Memory Usage: ${perf.memoryUsage?.used || 'N/A'}MB`);
  log(`  Blips Rendered: ${metrics.actualBlips}/${metrics.expectedBlips}`);
  log(`  Benchmark: ${metrics.benchmarks.passed ? '✅ PASS' : '❌ FAIL'}`);
  log(`  Full metrics saved to ${metricsPath}`);
  await browser.close();
}

async function main() {
  const browser = await chromium.launch({ headless: !headed, slowMo });
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  try {
    await ensureAuth(ownerPage, ownerEmail, password);
    const waveId = await createWave(ownerPage, `Perf Harness ${timestamp}`);
    await seedWave(ownerPage, waveId);
    await ownerContext.close();
    await browser.close();
    await captureMetrics(waveId, { email: ownerEmail, password });
  } catch (error) {
    console.error('❌ Perf harness failed:', error);
    await ownerContext.close().catch(() => {});
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Perf harness aborted:', error);
  process.exit(1);
});
