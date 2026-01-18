import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const headed = process.env.RIZZOMA_E2E_HEADED === '1';
const slowMo = Number(process.env.RIZZOMA_E2E_SLOWMO || (headed ? 100 : 0));
const blipTarget = Number(process.env.RIZZOMA_PERF_BLIPS || 5000);
const ownerEmail = process.env.RIZZOMA_E2E_USER_A || `perf-owner+${Date.now()}@example.com`;
const password = process.env.RIZZOMA_E2E_PASSWORD || 'PerfHarness!1';
const perfQuery = '?layout=rizzoma&perf=full';
const snapshotDir = process.env.RIZZOMA_SNAPSHOT_DIR || path.resolve('snapshots', 'perf');
const timestamp = Date.now();

const log = (msg) => console.log(`➡️  [perf] ${msg}`);

const metricsStages = [
  { name: 'landing-labels', selector: '.blip-collapsed-label' },
  // In perf mode we render a stub root for visibility; prefer the stub, fall back to the real blip/anchor
  { name: 'expanded-root', selector: '.perf-root-stub-blip, .perf-blip-anchor, .rizzoma-blip' },
];

async function gotoApp(page) {
  const perfUrl = `${baseUrl}#/?perf=1`;
  await page.goto(perfUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function ensureAuth(page, email, pwd) {
  log(`Authenticating ${email}`);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('rizzoma:perf:skipSidebarTopics', '1');
      localStorage.setItem('rizzoma:perf:autoExpandRoot', '0');
    } catch {}
  });
  await gotoApp(page);
  await page.evaluate(async () => {
    try {
      await fetch('/api/auth/csrf', { credentials: 'include' });
    } catch {}
  });
  const token = await getXsrfToken(page);
  const registerResult = await page.evaluate(
    async ({ email, pwd, token }) => {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': token,
        },
        credentials: 'include',
        body: JSON.stringify({ email, password: pwd, name: email.split('@')[0] }),
      });
      const data = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, data };
    },
    { email, pwd, token },
  );

  if (!registerResult.ok && registerResult.status !== 409) {
    log(`Register failed (${registerResult.status}); attempting login`);
  }

  if (registerResult.status === 409 || !registerResult.ok) {
    const loginResult = await page.evaluate(
      async ({ email, pwd, token }) => {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': token,
          },
          credentials: 'include',
          body: JSON.stringify({ email, password: pwd }),
        });
        const data = await resp.json().catch(() => ({}));
        return { ok: resp.ok, status: resp.status, data };
      },
      { email, pwd, token },
    );
    if (!loginResult.ok) {
      throw new Error(`Login failed (${loginResult.status})`);
    }
  }

  const me = await page.evaluate(async () => {
    const resp = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data };
  });
  if (!me.ok) throw new Error(`Auth verification failed (${me.status})`);
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
  if (!result.ok) throw new Error(`Failed to create wave (${result.status}): ${JSON.stringify(result.data)}`);
  if (!result.data || !result.data.id) {
    throw new Error(`Create wave returned no id (${result.status}): ${JSON.stringify(result.data)}`);
  }
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
  const url = `${baseUrl}#/topic/${encodeURIComponent(waveId)}${perfQuery}`;
  log(`Capturing TTF render for ${url}`);
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[api]') || text.includes('[topic]')) {
      log(`[console] ${text}`);
    }
  });
  await page.evaluate(() => {
    try {
      localStorage.setItem('rizzoma:perf:skipSidebarTopics', '1');
      localStorage.setItem('rizzoma:perf:autoExpandRoot', '0');
    } catch {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const results = [];

  for (const stage of metricsStages) {
    log(`Stage: ${stage.name}`);
    const start = Date.now();
    // Allow hidden but attached anchors; visibility is ensured by perf-mode stubs
    await page.waitForSelector(stage.selector, { timeout: 180000, state: 'attached' });

    // For landing-labels stage, wait for blips to fully load before counting
    if (stage.name === 'landing-labels') {
      // Wait for expected number of labels (blipTarget + 1 for root)
      // or timeout after 30s if something is wrong
      const expectedLabels = blipTarget + 1;
      try {
        await page.waitForFunction(
          (expected) => document.querySelectorAll('.blip-collapsed-label').length >= expected,
          expectedLabels,
          { timeout: 60000 }
        );
        log(`All ${expectedLabels} labels loaded`);
      } catch {
        const actualLabels = await page.evaluate(() => document.querySelectorAll('.blip-collapsed-label').length);
        log(`Warning: Only ${actualLabels}/${expectedLabels} labels loaded after 60s`);
      }
    }

    if (stage.name === 'expanded-root') {
      const expandBtn = await page.$('.blip-expand-btn');
      if (expandBtn) {
        await expandBtn.click();
        await page.waitForSelector('.rizzoma-blip', { timeout: 180000, state: 'attached' });
        await page.waitForTimeout(500); // allow layout to settle
      }
    }

    const perfData = await page.evaluate(() => {
      try {
        localStorage.setItem('rizzoma:perf:skipSidebarTopics', '1');
      } catch {}
      const paintMetrics = performance.getEntriesByType('paint');
      const navMetrics = performance.getEntriesByType('navigation')[0];
      
      const appMetrics = window.PerformanceMonitor ? window.PerformanceMonitor.getMetrics() : {};
      
      return {
        timeToFirstRender: performance.now(),
        firstPaint: paintMetrics.find(m => m.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paintMetrics.find(m => m.name === 'first-contentful-paint')?.startTime || 0,
        domComplete: navMetrics?.domComplete || 0,
        loadComplete: navMetrics?.loadEventEnd || 0,
        memoryUsage: performance.memory ? {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        } : null,
        appMetrics,
        labelCount: document.querySelectorAll('.blip-collapsed-label').length,
        blipCount: document.querySelectorAll('.rizzoma-blip').length,
      };
    });

    const stageTimestamp = `${timestamp}-${stage.name}`;
    const screenshotPath = path.join(snapshotDir, `render-${stageTimestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    const metrics = {
      timestamp: stageTimestamp,
      waveId,
      expectedBlips: blipTarget,
      actualBlips: stage.name === 'landing-labels' ? perfData.labelCount : perfData.blipCount,
      labelsVisible: perfData.labelCount,
      blipsRendered: perfData.blipCount,
      renderMode: stage.name,
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
        firstRenderTarget: 3000,
        memoryTarget: 100,
        passed: perfData.timeToFirstRender < 3000 && (perfData.memoryUsage?.used || 0) < 100
      }
    };
    const metricsPath = path.join(snapshotDir, `metrics-${stageTimestamp}.json`);
    await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));

    const perf = metrics.performance;
    log(`📊 [${stage.name}] Results:`);
    log(`  Time to First Render: ${perf.timeToFirstRender}ms`);
    log(`  First Contentful Paint: ${perf.firstContentfulPaint}ms`);
    log(`  Memory Usage: ${perf.memoryUsage?.used || 'N/A'}MB`);
    log(`  Labels Visible: ${metrics.labelsVisible}`);
    log(`  Blips Rendered: ${metrics.blipsRendered}/${metrics.expectedBlips}`);
    log(`  Benchmark: ${metrics.benchmarks.passed ? '✅ PASS' : '❌ FAIL'}`);
    log(`  Full metrics saved to ${metricsPath}`);
    results.push(metrics);
  }

  await browser.close();
  return results;
}

const enforceBudgets = process.env.RIZZOMA_PERF_ENFORCE_BUDGETS === '1';

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
    const results = await captureMetrics(waveId, { email: ownerEmail, password });

    // Check if any benchmarks failed
    const failedBenchmarks = results.filter(r => !r.benchmarks.passed);
    if (failedBenchmarks.length > 0) {
      log(`\n⚠️  ${failedBenchmarks.length} benchmark(s) failed budget thresholds`);
      if (enforceBudgets) {
        log('❌ Failing CI due to RIZZOMA_PERF_ENFORCE_BUDGETS=1');
        process.exit(1);
      } else {
        log('ℹ️  Set RIZZOMA_PERF_ENFORCE_BUDGETS=1 to fail CI on budget violations');
      }
    } else {
      log('\n✅ All benchmarks passed!');
    }
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
