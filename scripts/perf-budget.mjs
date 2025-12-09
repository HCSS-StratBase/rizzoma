#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULTS = {
  timeToFirstRender: Number(process.env.PERF_BUDGET_TTF || 3000), // ms
  firstContentfulPaint: Number(process.env.PERF_BUDGET_FCP || 2000), // ms
  memoryUsage: Number(process.env.PERF_BUDGET_MEMORY || 150), // MB
  expectedBlips: Number(process.env.PERF_BUDGET_EXPECTED_BLIPS || 5000),
  minBlipRatio: Number(process.env.PERF_BUDGET_MIN_RATIO || 0.5), // accept partial render for large seeds
  sampleSize: Number(process.env.PERF_BUDGET_SAMPLE || 5), // number of recent runs to check
};

const snapshotDir = path.resolve('snapshots', 'perf');

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

function checkRun({ metrics }) {
  const perf = metrics.performance;
  const expectedBlips = Number(metrics.expectedBlips ?? DEFAULTS.expectedBlips);
  const minBlipCount = Math.round(expectedBlips * DEFAULTS.minBlipRatio);

  const checks = [
    {
      name: 'Time to First Render',
      value: perf.timeToFirstRender,
      budget: DEFAULTS.timeToFirstRender,
      unit: 'ms',
      reverse: false,
    },
    {
      name: 'First Contentful Paint',
      value: perf.firstContentfulPaint,
      budget: DEFAULTS.firstContentfulPaint,
      unit: 'ms',
      reverse: false,
    },
    {
      name: 'Memory Usage',
      value: perf.memoryUsage?.used || 0,
      budget: DEFAULTS.memoryUsage,
      unit: 'MB',
      reverse: false,
    },
    {
      name: 'Blip Render Count',
      value: metrics.actualBlips,
      budget: minBlipCount,
      unit: '',
      reverse: true, // higher is better
    },
  ];

  const results = checks.map((check) => {
    const passed = check.reverse ? check.value >= check.budget : check.value <= check.budget;
    return { ...check, passed };
  });

  return {
    timestamp: metrics.timestamp,
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
      const when = new Date(summary.timestamp).toISOString();
      console.log(`Run ${when} (expected blips ${summary.expectedBlips}):`);
      summary.results.forEach((r) => {
        const status = r.passed ? '✅' : '❌';
        const comparison = r.reverse ? 'min' : 'max';
        console.log(`  ${status} ${r.name}: ${r.value}${r.unit} (${comparison}: ${r.budget}${r.unit})`);
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

main();
