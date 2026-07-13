#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(repoRoot);

const errors = [];
const notes = [];

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function exists(p) {
  return fs.existsSync(path.join(repoRoot, p));
}

function filesIn(dir, predicate) {
  const abs = path.join(repoRoot, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.isFile() && predicate(entry.name))
    .map((entry) => path.join(dir, entry.name));
}

function newestDir(globParent, predicate) {
  const abs = path.join(repoRoot, globParent);
  if (!fs.existsSync(abs)) return null;
  const dirs = fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && predicate(entry.name))
    .map((entry) => path.join(globParent, entry.name))
    .sort();
  return dirs.at(-1) ?? null;
}

function mtimeSeconds(relPath) {
  return Math.floor(fs.statSync(path.join(repoRoot, relPath)).mtimeMs / 1000);
}

const uiPathPattern =
  /^(src\/client\/|src\/shared\/|scripts\/visual-feature-sweep\.mjs|scripts\/verify-blb-fractal-proof\.mjs|RIZZOMA_FEATURES_STATUS\.md|.*\.(tsx|css))$/;
const uiKeywordPattern =
  /(RizzomaBlip|BlipMenu|BlipThreadNode|RightToolsPanel|RizzomaTopicDetail|EditorConfig|inlineMarker|visual-feature-sweep|verify-blb-fractal-proof)/;

const todayLog = runGit(['log', '--since=midnight', '--name-only', '--pretty=format:%ct']);
let currentCommitTs = 0;
let latestUiCommitTs = 0;
for (const rawLine of todayLog.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line) continue;
  if (/^\d{10}$/.test(line)) {
    currentCommitTs = Number(line);
    continue;
  }
  if (uiPathPattern.test(line) || uiKeywordPattern.test(line)) {
    latestUiCommitTs = Math.max(latestUiCommitTs, currentCommitTs);
  }
}

const workingChanged = runGit(['status', '--porcelain=v1'])
  .split(/\r?\n/)
  .map((line) => line.slice(3).trim())
  .filter(Boolean);
const workingUiChanged = workingChanged.filter((file) => uiPathPattern.test(file) || uiKeywordPattern.test(file));

if (latestUiCommitTs === 0 && workingUiChanged.length === 0) {
  console.log('Rizzoma parity gate: no UI/sweep/feature-matrix changes detected today; pass.');
  process.exit(0);
}

const legacyDir = 'screenshots/260224-2343-rizzoma-live-reference/feature/rizzoma-core-features';
const legacyPngs = filesIn(legacyDir, (name) => name.endsWith('.png'));
const legacyNotes = filesIn(legacyDir, (name) => name.endsWith('.md'));
if (legacyPngs.length < 20 || legacyNotes.length < 20) {
  errors.push(
    `legacy reference set incomplete: ${legacyPngs.length} PNGs and ${legacyNotes.length} MD notes in ${legacyDir}`,
  );
}

const latestSweep = newestDir('screenshots', (name) => name.endsWith('-feature-sweep'));
if (!latestSweep) {
  errors.push('no screenshots/*-feature-sweep directory found');
} else {
  const manifestPath = path.join(latestSweep, 'manifest.md');
  const coveragePath = path.join(latestSweep, 'coverage.md');
  if (!exists(manifestPath)) errors.push(`missing ${manifestPath}`);
  if (!exists(coveragePath)) errors.push(`missing ${coveragePath}`);

  if (latestUiCommitTs > 0 && mtimeSeconds(latestSweep) < latestUiCommitTs) {
    errors.push(`latest sweep ${latestSweep} is older than today's latest UI-touching commit`);
  }

  if (exists(manifestPath)) {
    const manifest = fs.readFileSync(path.join(repoRoot, manifestPath), 'utf8');
    const rows = manifest.match(/Documented rows parsed:\s*(\d+)/)?.[1] ?? 'unknown';
    const captures = manifest.match(/Captures:\s*(\d+)/)?.[1] ?? 'unknown';
    const passLine = manifest.match(/\*\*(\d+)\s*\/\s*(\d+) programmatic gates PASS\*\*/);
    notes.push(`manifest rows=${rows}, captures=${captures}, pass=${passLine ? `${passLine[1]}/${passLine[2]}` : 'unknown'}`);
    if (!passLine || passLine[1] !== passLine[2]) {
      errors.push(`manifest does not show all programmatic gates passing: ${manifestPath}`);
    }
  }

  let screenshotCovered = 0;
  let dynamicCovered = 0;
  let screenshotGaps = 0;
  let nonScreenshot = 0;
  if (exists(coveragePath)) {
    const coverage = fs.readFileSync(path.join(repoRoot, coveragePath), 'utf8');
    for (const match of coverage.matchAll(/\| VF-\d+ \|[^|]*\|[^|]*\| ([^|]+) \|/g)) {
      const status = match[1].trim();
      if (status === 'screenshot_covered') screenshotCovered += 1;
      if (status === 'dynamic_screenshot_covered') dynamicCovered += 1;
      if (status === 'screenshot_gap') screenshotGaps += 1;
      if (status === 'non_screenshot_artifact') nonScreenshot += 1;
    }
    notes.push(
      `coverage visual=${screenshotCovered + dynamicCovered}, gaps=${screenshotGaps}, nonScreenshot=${nonScreenshot}`,
    );
  }

  const comparisonDir = path.join(latestSweep, 'legacy-current-comparisons');
  const comparisons = filesIn(comparisonDir, (name) => name.endsWith('.png'));
  if (comparisons.length < 8) {
    errors.push(`legacy/current side-by-side comparison PNGs missing or too few: ${comparisons.length} in ${comparisonDir}`);
  }

  const auditPath = path.join(comparisonDir, 'PARITY_AUDIT.md');
  if (!exists(auditPath)) {
    errors.push(`missing written visual analysis: ${auditPath}`);
  } else {
    const audit = fs.readFileSync(path.join(repoRoot, auditPath), 'utf8');
    for (const required of ['Verdict:', 'Measured counts', 'Severe failures', 'Legacy/current comparisons']) {
      if (!audit.includes(required)) errors.push(`audit missing required section marker "${required}": ${auditPath}`);
    }
    if (!/screenshot gaps:\s*\**\d+/i.test(audit)) {
      errors.push(`audit does not state screenshot gap count: ${auditPath}`);
    }
  }
}

if (errors.length) {
  console.error('Rizzoma parity gate FAILED.');
  for (const error of errors) console.error(`- ${error}`);
  if (notes.length) {
    console.error('Measured context:');
    for (const note of notes) console.error(`- ${note}`);
  }
  console.error(
    'Required: run npm run visual:sweep + npm run visual:coverage, create legacy/current comparison PNGs, and write PARITY_AUDIT.md before reporting UI work as done.',
  );
  process.exit(1);
}

console.log(`Rizzoma parity gate PASS. ${notes.join('; ')}`);
