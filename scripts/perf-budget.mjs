#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  stageDuration: Number(process.env.PERF_BUDGET_STAGE_DURATION || 3000), // ms
  memoryUsage: Number(process.env.PERF_BUDGET_MEMORY || 150), // MB
  expectedBlips: Number(process.env.PERF_BUDGET_EXPECTED_BLIPS || 5000),
  minBlipRatio: Number(process.env.PERF_BUDGET_MIN_RATIO || 0.5), // accept partial render for large seeds
  sampleSize: Number(process.env.PERF_BUDGET_SAMPLE || 5), // number of recent runs to check
};

const snapshotDir = path.resolve(process.env.PERF_SNAPSHOT_DIR || path.join('snapshots', 'perf'));

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

async function loadRecentMetrics() {
  const files = (await fs.readdir(snapshotDir)).filter(
    (f) => f.startsWith('metrics-') && f.endsWith('.json'),
  );
  if (files.length === 0) {
    console.log('❌ No performance metrics found. Run: npm run perf:harness');
    process.exit(1);
  }
  const recent = files.sort().slice(-DEFAULTS.sampleSize);
  const results = [];
  for (const file of recent) {
    const raw = await fs.readFile(path.join(snapshotDir, file), 'utf8');
    const metrics = JSON.parse(raw);
    results.push({ file, metrics });
  }
  return results;
}

export function checkRun({ metrics }) {
  const perf = metrics.performance;
  const expectedBlips = Number(metrics.expectedBlips ?? DEFAULTS.expectedBlips);
  const minBlipCount = Math.round(expectedBlips * DEFAULTS.minBlipRatio);
  const stageDuration = finiteNumber(perf.stageDurationMs);
  const memoryUsed = finiteNumber(perf.memoryUsage?.used);
  const harnessChecks = metrics.benchmarks?.checks;
  const actualBlips = finiteNumber(metrics.actualBlips);

  const checks = [
    {
      name: 'Stage Duration',
      value: stageDuration,
      budget: DEFAULTS.stageDuration,
      unit: 'ms',
      reverse: false,
      telemetryAvailable: Number.isFinite(stageDuration),
    },
    {
      name: 'Memory Usage',
      value: memoryUsed,
      budget: DEFAULTS.memoryUsage,
      unit: 'MB',
      reverse: false,
      telemetryAvailable: Number.isFinite(memoryUsed),
    },
    {
      name: 'Blip Render Count',
      value: actualBlips,
      budget: minBlipCount,
      unit: '',
      reverse: true, // higher is better
      telemetryAvailable: Number.isFinite(actualBlips),
    },
    ...(harnessChecks
      ? [
          {
            name: 'Exact Child Count',
            value: finiteNumber(harnessChecks.childCount?.actual),
            budget: finiteNumber(harnessChecks.childCount?.expected),
            unit: '',
            comparison: 'exact',
            telemetryAvailable: Number.isFinite(finiteNumber(harnessChecks.childCount?.actual))
              && Number.isFinite(finiteNumber(harnessChecks.childCount?.expected)),
            explicitPassed: finiteNumber(harnessChecks.childCount?.actual)
              === finiteNumber(harnessChecks.childCount?.expected),
          },
          {
            name: 'Exact Label Count',
            value: finiteNumber(harnessChecks.labelCount?.actual),
            budget: finiteNumber(harnessChecks.labelCount?.expected),
            unit: '',
            comparison: 'exact',
            telemetryAvailable: Number.isFinite(finiteNumber(harnessChecks.labelCount?.actual))
              && Number.isFinite(finiteNumber(harnessChecks.labelCount?.expected)),
            explicitPassed: finiteNumber(harnessChecks.labelCount?.actual)
              === finiteNumber(harnessChecks.labelCount?.expected),
          },
          {
            name: 'Windowed Child Count',
            value: finiteNumber(harnessChecks.windowedCount?.actual),
            budget: finiteNumber(harnessChecks.windowedCount?.expected),
            unit: '',
            comparison: 'min, no timeout',
            telemetryAvailable: Number.isFinite(finiteNumber(harnessChecks.windowedCount?.actual))
              && Number.isFinite(finiteNumber(harnessChecks.windowedCount?.expected))
              && typeof harnessChecks.windowedCount?.timedOut === 'boolean',
            explicitPassed: harnessChecks.windowedCount?.timedOut === false
              && finiteNumber(harnessChecks.windowedCount?.actual)
                >= finiteNumber(harnessChecks.windowedCount?.expected),
          },
          ...(harnessChecks.lazySlots
            ? [{
                name: 'Lazy Slot Presence',
                value: finiteNumber(harnessChecks.lazySlots?.actual),
                budget: harnessChecks.lazySlots?.required ? 1 : 0,
                unit: '',
                comparison: harnessChecks.lazySlots?.required ? 'min' : 'diagnostic',
                telemetryAvailable: Number.isFinite(finiteNumber(harnessChecks.lazySlots?.actual))
                  && typeof harnessChecks.lazySlots?.required === 'boolean',
                explicitPassed: harnessChecks.lazySlots?.required
                  ? finiteNumber(harnessChecks.lazySlots?.actual) > 0
                  : true,
              }]
            : []),
        ]
      : []),
  ];

  const results = checks.map((check) => {
    const thresholdPassed = typeof check.explicitPassed === 'boolean'
      ? check.explicitPassed
      : (check.reverse ? check.value >= check.budget : check.value <= check.budget);
    const passed = check.telemetryAvailable && thresholdPassed;
    return { ...check, passed };
  });

  return {
    timestamp: metrics.timestamp,
    renderProfile: metrics.renderProfile || 'unknown',
    renderMode: metrics.renderMode || 'unknown',
    expectedBlips,
    minBlipCount,
    results,
  };
}

async function main() {
  try {
    const runs = await loadRecentMetrics();
    console.log(`📊 Checking performance budgets for ${runs.length} recent run(s):\n`);
    let allPassed = true;

    for (const run of runs) {
      const summary = checkRun(run);
      console.log(`Run ${summary.timestamp} (${summary.renderProfile}/${summary.renderMode}, expected blips ${summary.expectedBlips}):`);
      summary.results.forEach((r) => {
        const status = r.passed ? '✅' : '❌';
        const comparison = r.comparison || (r.reverse ? 'min' : 'max');
        const value = r.telemetryAvailable ? `${r.value}${r.unit}` : 'telemetry unavailable';
        console.log(`  ${status} ${r.name}: ${value} (${comparison}: ${r.budget}${r.unit})`);
      });
      console.log('');
      if (summary.results.some((r) => !r.passed)) allPassed = false;
    }

    if (allPassed) {
      console.log('🎉 All performance budgets are within limits.');
      process.exit(0);
    } else {
      console.log('⚠️  One or more performance budgets were exceeded.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to check performance budget:', error.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
