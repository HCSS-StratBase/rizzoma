import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const headed = process.env.RIZZOMA_E2E_HEADED === '1';
const slowMo = Number(process.env.RIZZOMA_E2E_SLOWMO || (headed ? 100 : 0));
const blipTarget = Number(process.env.RIZZOMA_PERF_BLIPS || 5000);
const ownerEmail = process.env.RIZZOMA_E2E_USER_A || `perf-owner+${Date.now()}@example.com`;
const password = process.env.RIZZOMA_E2E_PASSWORD || 'PerfHarness!1';
const perfLimit = blipTarget;
// RIZZOMA_PERF_RENDER=lite (default) or =full to exercise the full
// RizzomaBlip render path with LazyBlipSlot gating (task #15).
const renderMode = (process.env.RIZZOMA_PERF_RENDER === 'full') ? 'full' : 'lite';
const perfQuery = `?layout=rizzoma&perf=full&perfRender=${renderMode}&perfLimit=${perfLimit}`;
const perfHeaders = { 'x-rizzoma-perf': '1' };
const snapshotDir = process.env.RIZZOMA_SNAPSHOT_DIR || path.resolve('snapshots', 'perf');
const timestamp = Date.now();
const childBlipSelector = '.rizzoma-blip:not(.topic-root)';
const collapsedChildSelector = `${childBlipSelector} > .blip-collapsed-row`;
// Mirrors LAZY_MOUNT_THRESHOLD in src/client/components/blip/LazyBlipSlot.tsx.
// Keep this fixture-side boundary explicit so CI proves the lazy branch is live.
const lazyMountThreshold = 100;
const stageDurationTargetMs = 3000;
const memoryTargetMb = 100;

const log = (msg) => console.log(`➡️  [perf] ${msg}`);

const metricsStages = [
  { name: 'landing-labels', selector: '.blip-collapsed-row' },
  // Lite mode intentionally renders non-interactive rows, so it has no honest
  // expansion stage. Full mode must exercise a real RizzomaBlip interaction;
  // the retired `.blip-expand-btn` selector made the old "expanded-root"
  // stage a no-op whose screenshot was byte-identical to landing.
  ...(renderMode === 'full'
    ? [{ name: 'expanded-first-blip', selector: '.rizzoma-blip:not(.topic-root) > .blip-collapsed-row' }]
    : []),
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
    async ({ title, token, perfHeaders }) => {
      const resp = await fetch('/api/topics', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': token,
          ...perfHeaders,
        },
        credentials: 'include',
        body: JSON.stringify({ title, content: `<p>${title}</p>` }),
      });
      const data = await resp.json();
      return { ok: resp.ok, status: resp.status, data };
    },
    { title, token, perfHeaders },
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
    async ({ waveId, content, token, perfHeaders }) => {
      const resp = await fetch('/api/blips', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': token,
          ...perfHeaders,
        },
        credentials: 'include',
        body: JSON.stringify({ waveId, parentId: null, content }),
      });
      const data = await resp.json();
      return { ok: resp.ok, status: resp.status, data };
    },
    { waveId, content, token, perfHeaders },
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
  log(`Capturing topic render stages for ${url}`);
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
  const measureWindowedCount = async (selector, target, timeoutMs) => {
    try {
      return await page.evaluate(
        ({ selector, target, timeoutMs }) => new Promise((resolve) => {
          const start = performance.now();
          const deadline = start + timeoutMs;
          const check = () => {
            const count = document.querySelectorAll(selector).length;
            if (count >= target) {
              resolve({ elapsedMs: performance.now() - start, count, timedOut: false });
              return;
            }
            if (performance.now() >= deadline) {
              resolve({ elapsedMs: performance.now() - start, count, timedOut: true });
              return;
            }
            requestAnimationFrame(check);
          };
          check();
        }),
        { selector, target, timeoutMs },
      );
    } catch {
      return null;
    }
  };

  for (const stage of metricsStages) {
    log(`Stage: ${stage.name}`);
    const start = Date.now();
    const stageStartPerf = await page.evaluate(() => performance.now());
    // Allow hidden but attached anchors; visibility is ensured by perf-mode stubs
    await page.waitForSelector(stage.selector, { timeout: 180000, state: 'attached' });

    let windowed = null;

    // For landing-labels stage, wait for blips to fully load before counting
    if (stage.name === 'landing-labels') {
      const windowTarget = Math.min(blipTarget, 200);
      windowed = await measureWindowedCount(collapsedChildSelector, windowTarget, 60000);

      // Wait for the exact number of collapsed child rows. The topic root is
      // deliberately excluded from both the selector and the acceptance count.
      const expectedLabels = blipTarget;
      try {
        await page.waitForFunction(
          ({ selector, expected }) => document.querySelectorAll(selector).length >= expected,
          { selector: collapsedChildSelector, expected: expectedLabels },
          { timeout: 60000 }
        );
        log(`All ${expectedLabels} labels loaded`);
      } catch {
        const actualLabels = await page.evaluate(
          (selector) => document.querySelectorAll(selector).length,
          collapsedChildSelector,
        );
        log(`Warning: Only ${actualLabels}/${expectedLabels} labels loaded after 60s`);
      }
    }

    let expandedBlipId = null;
    if (stage.name === 'expanded-first-blip') {
      const firstCollapsed = page.locator(collapsedChildSelector).first();
      expandedBlipId = await firstCollapsed.evaluate((node) => node.parentElement?.dataset.blipId || null);
      if (!expandedBlipId) {
        throw new Error('Full-render perf stage could not resolve the first collapsed blip id');
      }
      await firstCollapsed.click();
      await page.waitForFunction((blipId) => {
        const blip = document.querySelector(`[data-blip-id="${blipId}"]`);
        return blip?.classList.contains('expanded')
          && blip.querySelector('.blip-content[data-expanded="1"]') !== null;
      }, expandedBlipId, { timeout: 15000 });
      const windowTarget = Math.min(blipTarget, 200);
      windowed = await measureWindowedCount(childBlipSelector, windowTarget, 60000);
      await page.waitForSelector(childBlipSelector, { timeout: 180000, state: 'attached' });
      await page.waitForTimeout(500); // allow layout to settle
    }

    const perfData = await page.evaluate(({ childBlipSelector, collapsedChildSelector }) => {
      try {
        localStorage.setItem('rizzoma:perf:skipSidebarTopics', '1');
      } catch {}
      const appMetrics = window.PerformanceMonitor ? window.PerformanceMonitor.getMetrics() : {};

      return {
        measurementClockMs: performance.now(),
        memoryUsage: performance.memory ? {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
        } : null,
        appMetrics,
        labelCount: document.querySelectorAll(collapsedChildSelector).length,
        childBlipCount: document.querySelectorAll(childBlipSelector).length,
        domBlipCount: document.querySelectorAll('.rizzoma-blip').length,
        lazySlotCount: document.querySelectorAll('[data-testid="lazy-blip-slot"]').length,
        expandedBlipCount: document.querySelectorAll('.rizzoma-blip.expanded:not(.topic-root)').length,
      };
    }, { childBlipSelector, collapsedChildSelector });

    if (stage.name === 'expanded-first-blip' && perfData.expandedBlipCount < 1) {
      throw new Error('Full-render perf stage did not leave a real child blip expanded');
    }

    const stageTimestamp = `${timestamp}-${stage.name}`;
    const screenshotPath = path.join(snapshotDir, `render-${stageTimestamp}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    const stageDurationMs = Number((perfData.measurementClockMs - stageStartPerf).toFixed(2));
    const windowTarget = Math.min(blipTarget, 200);
    const expectedLabels = stage.name === 'expanded-first-blip'
      ? Math.max(0, blipTarget - 1)
      : blipTarget;
    const durationPassed = Number.isFinite(stageDurationMs) && stageDurationMs < stageDurationTargetMs;
    const memoryTelemetryAvailable = Number.isFinite(perfData.memoryUsage?.used);
    const memoryPassed = memoryTelemetryAvailable && perfData.memoryUsage.used < memoryTargetMb;
    const childCountPassed = perfData.childBlipCount === blipTarget;
    const labelCountPassed = perfData.labelCount === expectedLabels;
    const lazySlotsRequired = renderMode === 'full' && blipTarget > lazyMountThreshold;
    const lazySlotsPassed = !lazySlotsRequired || perfData.lazySlotCount > 0;
    const windowPassed = windowed !== null
      && windowed.timedOut === false
      && windowed.count >= windowTarget;
    const metrics = {
      timestamp: stageTimestamp,
      waveId,
      expectedBlips: blipTarget,
      actualBlips: perfData.childBlipCount,
      labelsVisible: perfData.labelCount,
      expectedLabels,
      blipsRendered: perfData.childBlipCount,
      domBlipsIncludingTopicRoot: perfData.domBlipCount,
      lazySlots: perfData.lazySlotCount,
      lazyMountThreshold,
      expandedBlips: perfData.expandedBlipCount,
      expandedBlipId,
      stage: stage.name,
      renderProfile: stage.name,
      renderMode,
      windowed: windowed
        ? {
            target: windowTarget,
            elapsedMs: Number(windowed.elapsedMs.toFixed(2)),
            count: windowed.count,
            timedOut: windowed.timedOut,
          }
        : null,
      performance: {
        stageDurationMs,
        memoryUsage: perfData.memoryUsage,
        appMetrics: perfData.appMetrics
      },
      url,
      screenshot: screenshotPath,
      startedAt: start,
      benchmarks: {
        stageDurationTargetMs,
        memoryTargetMb,
        checks: {
          duration: { actualMs: stageDurationMs, passed: durationPassed },
          memory: {
            actualMb: perfData.memoryUsage?.used ?? null,
            telemetryAvailable: memoryTelemetryAvailable,
            passed: memoryPassed,
          },
          childCount: { expected: blipTarget, actual: perfData.childBlipCount, passed: childCountPassed },
          labelCount: { expected: expectedLabels, actual: perfData.labelCount, passed: labelCountPassed },
          lazySlots: {
            required: lazySlotsRequired,
            threshold: lazyMountThreshold,
            actual: perfData.lazySlotCount,
            passed: lazySlotsPassed,
          },
          windowedCount: {
            expected: windowTarget,
            actual: windowed?.count ?? null,
            timedOut: windowed?.timedOut ?? null,
            passed: windowPassed,
          },
        },
        passed: durationPassed
          && memoryPassed
          && childCountPassed
          && labelCountPassed
          && lazySlotsPassed
          && windowPassed,
      }
    };
    const metricsPath = path.join(snapshotDir, `metrics-${stageTimestamp}.json`);
    await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));

    const perf = metrics.performance;
    log(`📊 [${stage.name}] Results:`);
    log(`  Topic Stage Duration: ${perf.stageDurationMs}ms`);
    log(`  Memory Usage: ${perf.memoryUsage?.used ?? 'unavailable'}MB`);
    log(`  Labels Visible: ${metrics.labelsVisible}/${metrics.expectedLabels}`);
    log(`  Blips Rendered: ${metrics.blipsRendered}/${metrics.expectedBlips}`);
    log(`  Lazy Slots: ${metrics.lazySlots}${lazySlotsRequired ? ' (required)' : ''}`);
    if (metrics.windowed) {
      log(`  Windowed ${metrics.windowed.target}: ${metrics.windowed.elapsedMs}ms (${metrics.windowed.count}${metrics.windowed.timedOut ? ', timed out' : ''})`);
    }
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
