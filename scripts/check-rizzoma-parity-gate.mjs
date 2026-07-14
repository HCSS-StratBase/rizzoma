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

// Legacy baseline = the Feb per-feature set PLUS the systematic 260714 archive.
// FULL-MATRIX RULE (SDS 2026-07-14): the legacy archive must be at matrix scale —
// >=150 PNGs total, each paired with an .md note (the target is the ~243-PNG
// scale of the original app's own asset inventory).
const legacyDirs = [
  'screenshots/260224-2343-rizzoma-live-reference/feature/rizzoma-core-features',
  'screenshots/260714-legacy-reference-archive',
];
let legacyPngs = 0;
let legacyNotes = 0;
for (const dir of legacyDirs) {
  legacyPngs += filesIn(dir, (name) => name.endsWith('.png')).length;
  legacyNotes += filesIn(dir, (name) => name.endsWith('.md')).length;
}
notes.push(`legacy reference PNGs=${legacyPngs}, notes=${legacyNotes} (floor 150)`);
if (legacyPngs < 150 || legacyNotes < 150) {
  errors.push(
    `legacy reference archive below matrix scale: ${legacyPngs} PNGs / ${legacyNotes} notes across ${legacyDirs.join(' + ')} (need >=150 each; target ~243)`,
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
    // FULL-MATRIX RULE (SDS 2026-07-14): a screenshot gap is a FAIL, not a note.
    if (screenshotGaps > 0) {
      errors.push(`coverage matrix has ${screenshotGaps} screenshot gap(s) — every screenshot-valid row must be covered`);
    }
    if (screenshotCovered + dynamicCovered + nonScreenshot === 0) {
      errors.push(`coverage matrix parsed 0 rows from ${coveragePath} — coverage.md malformed or empty`);
    }
  }

  // HAND-BUILD GATE (SDS 2026-07-14, after the day of seam-patching).
  // Fixture-expansion, 44 sweep gates, 159 coverage rows, 11 single-active gates,
  // 14 sanity checks and pixel measurements ALL passed while the fractal was dying
  // at depth 3 and nested blips were persisting as bare <p>. Only a hand-build
  // through the real UI finds bugs in the CREATION path. So: UI work does not
  // close without fresh hand-build evidence.
  const handbuildDirs = fs
    .readdirSync(path.join(repoRoot, 'screenshots'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && /handbuild-d10/.test(e.name))
    .map((e) => path.join('screenshots', e.name))
    .sort();
  const latestHandbuild = handbuildDirs.at(-1) ?? null;
  if (!latestHandbuild) {
    errors.push(
      'no hand-build evidence: run scripts/handbuild_depth10.mjs (real clicks + real Ctrl+Enter + real typing, a PNG after EVERY action) and eyeball every PNG',
    );
  } else {
    const shots = filesIn(latestHandbuild, (name) => name.endsWith('.png'));
    notes.push(`hand-build ${latestHandbuild}: ${shots.length} step PNGs`);
    if (shots.length < 20) {
      errors.push(
        `hand-build evidence too thin: ${shots.length} PNGs in ${latestHandbuild} (a depth-10 build is >=20 atomic steps — one PNG per action)`,
      );
    }
    if (latestUiCommitTs > 0 && mtimeSeconds(latestHandbuild) < latestUiCommitTs) {
      errors.push(
        `hand-build ${latestHandbuild} is OLDER than today's latest UI-touching commit — re-run it against the current build`,
      );
    }
  }

  const comparisonDir = path.join(latestSweep, 'legacy-current-comparisons');
  const comparisons = filesIn(comparisonDir, (name) => name.endsWith('.png'));
  if (comparisons.length < 16) {
    errors.push(`legacy/current side-by-side comparison PNGs missing or too few: ${comparisons.length} in ${comparisonDir} (need >=16, one per comparison track)`);
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
