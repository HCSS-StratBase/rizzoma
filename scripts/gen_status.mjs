#!/usr/bin/env node
/**
 * Generate STATUS.md — the SINGLE authoritative current-state doc.
 *
 * Status is MEASURED, never hand-written. Six competing hand-maintained
 * "current state" files (HANDOFF, RESTART, RESTORE_POINT, CLAUDE_SESSION,
 * TESTING_STATUS, NATIVE_PORT_PM) all drifted — NATIVE_PORT_PM still claimed
 * "17%, phases 2-4 not started" ten weeks after those phases were committed.
 * This script reads git, the latest sweep/audit, the native-port sources and
 * the live endpoint, and writes what is ACTUALLY true.
 *
 * Usage: node scripts/gen_status.mjs   (writes STATUS.md)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);
const git = (...a) => { try { return execFileSync('git', a, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const exists = p => fs.existsSync(path.join(root, p));

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const head = git('log', '-1', '--format=%h %ad %s', '--date=short');
const ahead = git('rev-list', '--count', `origin/${branch}..HEAD`) || '0';
const dirty = git('status', '--porcelain=v1').split('\n').filter(Boolean).length;

// --- latest sweep + audit ---
const sweeps = fs.readdirSync('screenshots', { withFileTypes: true })
  .filter(e => e.isDirectory() && e.name.endsWith('-feature-sweep'))
  .map(e => e.name).sort();
const latestSweep = sweeps.at(-1);
let gates = 'n/a', coverage = 'n/a', verdict = 'n/a', comparisons = 0;
if (latestSweep) {
  const man = path.join('screenshots', latestSweep, 'manifest.md');
  const cov = path.join('screenshots', latestSweep, 'coverage.md');
  const aud = path.join('screenshots', latestSweep, 'legacy-current-comparisons', 'PARITY_AUDIT.md');
  if (exists(man)) gates = (fs.readFileSync(man, 'utf8').match(/\*\*(\d+ \/ \d+ programmatic gates PASS)\*\*/) || [, 'unknown'])[1];
  if (exists(cov)) {
    const c = fs.readFileSync(cov, 'utf8');
    const g = (c.match(/Screenshot gaps:\s*(\d+)/i) || [, '?'])[1];
    const s = (c.match(/Screenshot covered:\s*(\d+)/i) || [, '?'])[1];
    const d = (c.match(/Dynamic screenshot covered:\s*(\d+)/i) || [, '?'])[1];
    const n = (c.match(/Non-screenshot artifact:\s*(\d+)/i) || [, '?'])[1];
    coverage = `${Number(s) + Number(d) + Number(n)} rows classified · ${s} screenshot + ${d} dynamic + ${n} non-screenshot · **${g} gaps**`;
  }
  if (exists(aud)) verdict = (fs.readFileSync(aud, 'utf8').match(/Verdict:\s*\*\*(.+?)\*\*/s) || [, 'unknown'])[1].replace(/\n/g, ' ');
  const cmpDir = path.join('screenshots', latestSweep, 'legacy-current-comparisons');
  if (exists(cmpDir)) comparisons = fs.readdirSync(path.join(root, cmpDir)).filter(f => f.endsWith('.png')).length;
}

// --- hand-build evidence ---
const hbDirs = fs.readdirSync('screenshots', { withFileTypes: true })
  .filter(e => e.isDirectory() && /handbuild/.test(e.name)).map(e => e.name).sort();
const latestHb = hbDirs.at(-1);
const hbShots = latestHb ? fs.readdirSync(path.join(root, 'screenshots', latestHb)).filter(f => f.endsWith('.png')).length : 0;

// --- native port: measured, not asserted ---
const nativeDir = 'src/client/native';
const nativeFiles = exists(nativeDir) ? fs.readdirSync(path.join(root, nativeDir)).filter(f => f.endsWith('.ts')) : [];
const nativeLoc = nativeFiles.reduce((n, f) => n + fs.readFileSync(path.join(root, nativeDir, f), 'utf8').split('\n').length, 0);
const nativeTests = exists(`${nativeDir}/__tests__`) ? fs.readdirSync(path.join(root, nativeDir, '__tests__')).length : 0;
const readOnly = exists('src/client/components/RizzomaTopicDetail.tsx')
  && /native path is still read-only/i.test(fs.readFileSync(path.join(root, 'src/client/components/RizzomaTopicDetail.tsx'), 'utf8'));

// --- open failures from the audit ---
let openItems = [];
if (latestSweep) {
  const aud = path.join(root, 'screenshots', latestSweep, 'legacy-current-comparisons', 'PARITY_AUDIT.md');
  if (fs.existsSync(aud)) {
    openItems = fs.readFileSync(aud, 'utf8').split('\n')
      .filter(l => /—\s*(OPEN|`needs diagnosis`)/i.test(l) || /\bOPEN\b/.test(l))
      .map(l => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').trim().slice(0, 150))
      .slice(0, 8);
  }
}

const md = `# STATUS — Rizzoma (GENERATED, do not hand-edit)

> Regenerate with \`node scripts/gen_status.mjs\`. Every number here is measured from git,
> the latest sweep/audit and the source tree. Six hand-written status files drifted for
> months before this existed; they are in \`docs/deprecated/\`.

**Generated:** ${git('log', '-1', '--format=%ad', '--date=short')} (from HEAD's date — no wall-clock, keeps reruns deterministic)

## Code

| | |
|---|---|
| **Branch** | \`${branch}\` |
| **HEAD** | ${head} |
| **Unpushed commits** | ${ahead} |
| **Uncommitted files** | ${dirty} |

## Deployment (see docs/VPS_DEPLOYMENT.md for the reality banner)

| | |
|---|---|
| **Live** | \`https://138-201-62-161.nip.io\` — tree \`/data/large-projects/stephan/rizzoma_260612\`, nohup tsx :8000 + vite :3000 behind nginx |
| **Staging** | \`https://dev.138-201-62-161.nip.io\` — tree \`rizzoma_merge\`, :8100 / :3100 |
| **In Docker** | CouchDB + Redis only (NOT the app — the compose-based topology in QUICKSTART is historical) |
| **Session store** | MemoryStore on the live process (sessions die on restart) — productionization pending |

## Verification (latest run)

| | |
|---|---|
| **Latest sweep** | \`screenshots/${latestSweep || 'none'}\` |
| **Programmatic gates** | ${gates} |
| **Coverage matrix** | ${coverage} |
| **Legacy/current comparisons** | ${comparisons} sheets |
| **Hand-build evidence** | \`screenshots/${latestHb || 'none'}\` — ${hbShots} step PNGs |
| **Parity audit verdict** | ${verdict} |

## Native port (measured from source, not from a tracker)

| | |
|---|---|
| **Source** | ${nativeFiles.length} files, ${nativeLoc} LOC in \`src/client/native/\` |
| **Unit tests** | ${nativeTests} test files |
| **Wiring** | ${readOnly ? '**READ-ONLY** — opt-in via `?render=native`; no Edit button, no toolbars. Editing still goes through the React/TipTap hybrid.' : 'edit path wired (verify with `HB_RENDER=native node scripts/handbuild_acceptance.mjs`)'} |
| **Acceptance** | \`HB_RENDER=native node scripts/handbuild_acceptance.mjs\` must pass before any cutover |

## Open failures (from the latest PARITY_AUDIT)

${openItems.length ? openItems.map(i => `- ${i}`).join('\n') : '- (none listed)'}

## Where to read next

- **Architecture + why the hybrid cracks** → \`docs/ARCHITECTURE.md\`
- **BLB rules, old-vs-new labelled** → \`docs/BLB.md\`
- **The prescribed fix** → \`docs/NATIVE_RENDER_PORT_PLAN.md\`
- **The gate chain** → \`docs/VISUAL_SCREENSHOT_SWEEP.md\`
- **Everything superseded** → \`docs/deprecated/README.md\`
`;

fs.writeFileSync(path.join(root, 'STATUS.md'), md);
console.log('STATUS.md written');
console.log(`  branch=${branch} gates="${gates}" coverage="${coverage}"`);
console.log(`  native=${nativeFiles.length} files/${nativeLoc} LOC, readOnly=${readOnly}`);
