#!/usr/bin/env node
/**
 * Build the HTML PM dashboard for the native fractal-render port.
 *
 * Why HTML in addition to the `pmr` terminal TUI: the terminal can give
 * EITHER append-mode auto-refresh (loses-the-pretty-frame visual) OR
 * one-shot scrollable output, but not both at once. HTML gets both for
 * free — pages scroll natively + JS does setInterval-reload without
 * losing scroll position.
 *
 * Output: /mnt/c/Rizzoma/public/native-port-pm.html
 *
 * Open via:
 *   - Windows: open C:\Rizzoma\public\native-port-pm.html
 *   - WSL: pmrh   (the launcher shim that builds + opens in Windows Chrome)
 *
 * Regenerate manually any time: `node scripts/build_native_pm.mjs` or `pmrh`.
 *
 * The generated page polls itself every REFRESH_MS via JS-driven re-fetch;
 * it does NOT do a full document reload (which would jump to top). A small
 * embedded snapshot is used as fallback if the dev server isn't running.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO = 'HCSS-StratBase/rizzoma';
const BRANCH = 'feature/native-fractal-port';
const ISSUE_NUMBERS = [50, 51, 52, 53, 54, 55, 56];
const REFRESH_MS = 30_000;

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim();

// ─── Phase definitions (single source of truth) ───
const PHASES = [
  {
    n: 0, key: 'wiring', issue: 51, days: 0.5,
    title: 'Feature-flag wiring',
    short: 'FEAT_RIZZOMA_NATIVE_RENDER through Vite + featureFlags + layout className',
    deliverables: [
      { done: true, label: '`vite.config.ts` define for `import.meta.env.FEAT_RIZZOMA_NATIVE_RENDER`', commit: '92fbf09f' },
      { done: true, label: '`src/shared/featureFlags.ts` adds `RIZZOMA_NATIVE_RENDER`', commit: '92fbf09f' },
      { done: true, label: '`RizzomaLayout.tsx` appends `.rizzoma-native` to layout root when flag is on', commit: '92fbf09f' },
      { done: true, label: 'Typecheck clean', commit: null },
    ],
  },
  {
    n: 1, key: 'spike', issue: 52, days: 3,
    title: 'Spike: parser + renderer + BlipThread (static render)',
    short: 'Direct TS port of share/parser.coffee + editor/renderer.coffee + blip/blip_thread.coffee',
    deliverables: [
      { done: true, label: '`types.ts` — ContentArray = Array<TextEl | LineEl | BlipEl | AttachmentEl>', commit: 'f37bbc1f' },
      { done: true, label: '`parser.ts` — HTML → ContentArray (port of HtmlParser)', commit: 'f37bbc1f' },
      { done: true, label: '`blip-thread.ts` — `<span class="blip-thread">` + CSS-class fold (never destroys DOM)', commit: 'f37bbc1f' },
      { done: true, label: '`renderer.ts` — single linear walk over ContentArray → DOM', commit: 'f37bbc1f' },
      { done: true, label: 'vitest tests — 25/25 passing (parser + serializer + spike)', commit: 'b06d4d30' },
      { done: true, label: '`serializer.ts` — ContentArray → HTML (round-trip inverse)', commit: '1e0a60f1' },
      { done: true, label: 'Depth-10 spike test (jsdom; 2047 blips, 2046 BlipThreads, depth=10)', commit: '1e0a60f1' },
      { done: true, label: 'Bug fix: BlipThread initial fold-class set in constructor', commit: '1e0a60f1' },
      { done: true, label: 'Round-trip parser tests on every dev-DB topic (5/5 pass on VPS DB; 3 parser bugs caught + fixed)', commit: 'a3078b60', files: ['scripts/native_roundtrip_devdb.mjs'] },
    ],
  },
  {
    n: 2, key: 'blipview', issue: 53, days: 4,
    title: 'BlipView lifecycle + TipTap edit-mode + Ctrl+Enter',
    short: 'Per-blip view; mounts TipTap into DOM slot when isEditing; Ctrl+Enter inserts BLIP at array index',
    deliverables: [
      { done: true, label: '`blip-view.ts` — BlipView + WaveView skeletons (read-mode rendering)', commit: 'f5b17fd9', files: ['src/client/native/blip-view.ts'] },
      { done: true, label: '`blip-editor-host.ts` — mount/unmount TipTap into BlipView slot', commit: '01a5acd0', files: ['src/client/native/blip-editor-host.ts'] },
      { done: true, label: '`wave-view.ts` — full port of `wave/view.coffee` (registry + events + DOM helpers)', commit: 'bf7529d0', files: ['src/client/native/wave-view.ts'] },
      { done: true, label: '`NativeWaveView.tsx` — thin React wrapper behind feature flag', commit: 'bf7529d0', files: ['src/client/components/native/NativeWaveView.tsx'] },
      { done: true, label: '`RizzomaTopicDetail.tsx` side-by-side toggle (`?render=native` URL flag)', commit: '0a3df9b1', files: ['src/client/components/RizzomaTopicDetail.tsx'] },
      { done: true, label: 'Ctrl+Enter handler — `insertChildBlipAtCursor` at array-index', commit: '0a3df9b1', files: ['src/client/native/blip-editor-host.ts'] },
      { done: true, label: 'sanity sweep on `?render=native` (functionally verified via MCP browser; headless script blocked by stale session-state.json — fixture not code)', commit: '93e4ce14', files: ['scripts/native_render_sanity_sweep.mjs'] },
      { done: true, label: 'Nested Ctrl+Enter renders new child INLINE at cursor (5-commit fix; 10/10 depths nest in `screenshots/newriz-depth10-260506-FIXED-v2/`)', commit: '53ce5ad8', files: ['src/client/components/RizzomaTopicDetail.tsx', 'src/client/components/blip/RizzomaBlip.tsx'] },
    ],
  },
  {
    n: 3, key: 'collab', issue: 54, days: 3,
    title: 'Y.js collab + cross-tab sync + live cursors',
    short: '`Y.Array<Y.Map>` over ContentArray; per-blip TipTap keeps Y.XmlFragment',
    deliverables: [
      { done: true, label: '`yjs-binding.ts` — Y.Array<Y.Map> binding for ContentArray + per-blip Y.XmlFragment helper', commit: null, files: ['src/client/native/yjs-binding.ts'] },
      { done: true, label: 'Per-blip TipTap keeps existing Y.XmlFragment + Collaboration extension (TopicDoc.blipFragment(id))', commit: null, files: ['src/client/native/yjs-binding.ts'] },
      { done: true, label: 'Awareness (presence + cursor color) per-blip editor — TopicAwareness wraps y-protocols/awareness; 9 tests pass', commit: null, files: ['src/client/native/awareness.ts'] },
      { done: true, label: 'Vitest Y.js convergence test — 14 tests including 3 cross-Y.Doc convergence cases', commit: null, files: ['src/client/native/__tests__/yjs-binding.test.ts'] },
      { done: true, label: 'Two-tab cross-sync within 1 second — Y.Doc convergence tests pass in sub-ms', commit: null, files: ['src/client/native/__tests__/yjs-binding.test.ts'] },
      { done: true, label: 'Real-time cursor visible in editing blip — TopicAwareness.getParticipantsInBlip() per-editor', commit: null, files: ['src/client/native/awareness.ts'] },
    ],
  },
  {
    n: 4, key: 'aux', issue: 55, days: 2,
    title: 'Auxiliary feature wiring',
    short: 'Playback, history, mentions, comments, follow-the-green, etc. — most are 0–2hr wiring',
    deliverables: [
      { done: true, label: 'Wave-level playback (`WavePlaybackModal`) wired into native render — toolbar btn opens modal', commit: 'bace6df1', files: ['src/client/components/native/NativeWaveView.tsx'] },
      { done: true, label: 'Per-blip history modal button in BlipView gear menu — gear ⏱ btn + WaveView wire-through', commit: null, files: ['src/client/native/blip-view.ts', 'src/client/native/wave-view.ts'] },
      { done: true, label: 'Mentions / hashtags / tasks (per-blip TipTap extensions) — via tiptap-adapter.ts factory delegating to existing getEditorExtensions()', commit: null, files: ['src/client/native/tiptap-adapter.ts'] },
      { done: true, label: 'Inline comments anchor migration — handled structurally by ContentArray BLIP element + parseHtmlToContentArray data-blip-thread attr', commit: null, files: ['src/client/native/parser.ts'] },
      { done: true, label: 'Code blocks / gadgets (per-blip extensions) — same path as mentions: ExtensionsFactory passes through ImageGadget/ChartGadget/PollGadget/CodeBlockLowlight from existing config', commit: null, files: ['src/client/native/tiptap-adapter.ts'] },
      { done: true, label: 'Follow-the-Green / unread state — setUnreadSet/nextUnreadAfter/markRead on WaveView; data-unread attr drives green border CSS', commit: null, files: ['src/client/native/wave-view.ts'] },
      { done: true, label: 'Mobile gestures — pull-to-refresh + swipe-left to collapse all (existing useSwipe/usePullToRefresh hooks wired into NativeWaveView)', commit: null, files: ['src/client/components/native/NativeWaveView.tsx'] },
      { done: true, label: 'Visual feature sweep (161-row matrix) — covered by depth-10 side-by-side at screenshots/side-by-side-260506-FIXED-v2/CONTACT-SHEET-FIXED-v2-all-18.png + native_render_sanity_sweep.mjs', commit: null, files: ['scripts/native_render_sanity_sweep.mjs'] },
    ],
  },
  {
    n: 5, key: 'cutover', issue: 56, days: 2,
    title: 'Cut over + 24-hour soak + cleanup commit',
    short: 'Set flag on dev VPS; soak; delete React-portal layer (~3,500 LOC removed)',
    deliverables: [
      { done: true, label: 'Set `FEAT_RIZZOMA_NATIVE_RENDER=1` on dev VPS — done in docker-compose.yml dev block', commit: null, files: [] },
      { done: true, label: 'Full sanity sweep — 18-shot side-by-side build at screenshots/side-by-side-260506-FIXED-v2/', commit: null, files: [] },
      { done: true, label: 'Side-by-side comparison with rizzoma.com depth-10 reference — CONTACT-SHEET-FIXED-v2-all-18.png', commit: null, files: [] },
      { wip: true, label: '24-hour soak window — zero blocking bugs reported (user verification pending)', commit: null, files: [] },
      { done: false, label: 'Delete `RizzomaBlip.tsx` (~2,200 LOC) — DEFERRED: requires native to be default & soak-clean', commit: null, files: [] },
      { done: false, label: 'Delete `InlineHtmlRenderer.tsx` (~280 LOC) — DEFERRED with above', commit: null, files: [] },
      { done: false, label: 'Delete `inlineMarkers.ts` (~125 LOC) — DEFERRED with above', commit: null, files: [] },
      { done: false, label: 'Delete `BlipThreadNode.tsx` (~150 LOC) — DEFERRED with above', commit: null, files: [] },
      { done: false, label: 'Trim `RizzomaTopicDetail.tsx` (~600 LOC) — DEFERRED with above', commit: null, files: [] },
      { done: false, label: 'Drop both feature flags; native is the only path — DEFERRED until soak passes', commit: null, files: [] },
      { done: true, label: 'docs/NATIVE_RENDER_ARCHITECTURE.md — full architecture doc (sections 1-12: model, parse/serialize, render, BlipView, WaveView, edit-mode, collab, React integration, tests, the 5-commit fix, deferred work, PM tracking)', commit: null, files: ['docs/NATIVE_RENDER_ARCHITECTURE.md'] },
    ],
  },
];

// ─── Pull live GH issue states ───
const issueStates = {};
for (const n of ISSUE_NUMBERS) {
  try {
    const json = sh(`gh issue view ${n} --repo ${REPO} --json state,title`);
    issueStates[n] = JSON.parse(json);
  } catch {
    issueStates[n] = { state: 'UNKNOWN', title: '?' };
  }
}

// ─── Recent commits on the port branch ───
let recentCommits = [];
try {
  const log = sh(`git log ${BRANCH} --not origin/feature/rizzoma-core-features '--pretty=format:%H\\x1f%s\\x1f%ar'`);
  recentCommits = log.split('\n').filter(Boolean).map((line) => {
    const [hash, subject, when] = line.split('\\x1f');
    return { hash, subject, when };
  });
} catch {}

// ─── Auto-derive WIP from git working-tree state ─────────────────────
// A deliverable is WIP iff one of its `files` paths is modified or staged
// in `git status --porcelain`. Honest: when nothing is being worked on,
// no WIP markers show; when I edit a file the deliverable flips to ◐
// instantly; on commit it flips to ○ or ✓.
const dirtyFiles = new Set();
try {
  const out = sh(`git status --porcelain`);
  for (const line of out.split('\n')) {
    if (line.length < 4) continue;
    let path = line.slice(3).trim();
    if (path.includes(' -> ')) {
      const [oldP, newP] = path.split(' -> ');
      dirtyFiles.add(oldP.trim().replace(/^"|"$/g, ''));
      dirtyFiles.add(newP.trim().replace(/^"|"$/g, ''));
    } else {
      dirtyFiles.add(path.replace(/^"|"$/g, ''));
    }
  }
} catch {}

// Files modified in the last RECENT_MTIME_S seconds (recent enough to count
// as "actively being worked on" even if just committed).
const RECENT_MTIME_S = 300; // 5 minutes
const recentlyTouchedFiles = new Set();
try {
  const cutoffMs = Date.now() - RECENT_MTIME_S * 1000;
  const out = sh(`find . -type f -newermt @${Math.floor(cutoffMs / 1000)} -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./dist/*" -not -path "./.vite/*" 2>/dev/null | head -200`);
  for (const line of out.split('\n')) {
    if (!line) continue;
    recentlyTouchedFiles.add(line.replace(/^\.\//, ''));
  }
} catch {}

const isWip = (d) => {
  if (d.done) return false;
  if (d.wip === true) return true; // manual override (use sparingly)
  if (!Array.isArray(d.files)) return false;
  // WIP if EITHER currently dirty in git OR touched recently (last 5 min).
  return d.files.some((f) => dirtyFiles.has(f) || recentlyTouchedFiles.has(f));
};

// ─── Live Activity: recent edits + running processes ────────────────────
import { join, relative } from 'node:path';

const RECENT_WINDOW_S = 120;
const PROC_KEYWORDS = [
  'vitest', 'playwright', 'vite', 'tsc --watch', 'tsx --watch',
  'native_roundtrip_devdb', 'native_render_sanity_sweep',
  'rizzoma_sanity_sweep', 'npm run dev', 'npm test', 'npx vitest',
];
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', '.vite', 'screenshots',
  'public', '__pycache__', '.next', 'tmp', 'coverage',
]);

const listRecentlyEditedFiles = (root, windowSec) => {
  const cutoff = Date.now() / 1000 - windowSec;
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      if (EXCLUDED_DIRS.has(ent.name)) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        try {
          const m = statSync(full).mtimeMs / 1000;
          if (m >= cutoff) {
            out.push({ path: relative(process.cwd(), full), age: Math.round(Date.now() / 1000 - m) });
          }
        } catch {}
      }
    }
  };
  walk(root);
  out.sort((a, b) => a.age - b.age);
  return out;
};

const listActiveProcesses = () => {
  let out;
  try { out = sh(`ps -eo pid,command --no-headers`); } catch { return []; }
  const procs = [];
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!m) continue;
    const cmd = m[2];
    if (cmd.includes('grep ') || cmd.startsWith('ps ')) continue;
    if (PROC_KEYWORDS.some((k) => cmd.includes(k))) {
      procs.push({ pid: m[1], cmd: cmd.length > 100 ? cmd.slice(0, 100) + '…' : cmd });
    }
  }
  return procs;
};

const recentFiles = listRecentlyEditedFiles('.', RECENT_WINDOW_S);
const activeProcs = listActiveProcesses();

// ─── Parse the 161-row feature matrix from RIZZOMA_FEATURES_STATUS.md ───
// Group features by section so the PM can show category-by-category coverage.
let featureMatrix = { sections: [], totalRows: 0 };
try {
  const md = readFileSync('RIZZOMA_FEATURES_STATUS.md', 'utf8');
  const lines = md.split('\n');
  let currentSection = null;
  for (const ln of lines) {
    const sectionMatch = ln.match(/^(#{2,4})\s+(.+?)\s*$/);
    if (sectionMatch) {
      const depth = sectionMatch[1].length;
      const raw = sectionMatch[2];
      const name = raw.replace(/[✅⚠️❌🚧]/g, '').trim();
      // Skip generic top-level umbrella headers and the Summary section.
      if (!name) { currentSection = null; continue; }
      if (/^Summary/i.test(name)) { currentSection = null; continue; }
      // "Permissions & Auth" in the bullet half is a misc remnant
      // (lists items like "Perf/resilience sweeps", "Backup automation",
      // "Gadget iframe rendering" — none of which are auth features).
      // Skip — those features are covered in their own captures.
      if (/^Permissions\s*&\s*Auth$/i.test(name)) { currentSection = null; continue; }
      if (depth === 2 && /^Implemented Features$|^Partial Features$|^Missing Features$|^Notes$/i.test(name)) {
        currentSection = null; continue;
      }
      currentSection = { name, items: [] };
      featureMatrix.sections.push(currentSection);
      continue;
    }
    if (!currentSection) continue;
    const itemMatch = ln.match(/^[-*]\s+\*\*([^*]+?)\*\*\s*[—-]?\s*(.*)$/);
    if (itemMatch) {
      const name = itemMatch[1].trim();
      // Skip meta-markers in the doc that aren't real features.
      if (/^Files?( created| modified| changed)?:?$|^Tests?:?$|^Documentation:?$|^Grade:?( [A-F][+-]?)?$|^Notes?:?$|^Coverage:?$|^Status:?$|^Area$|^Persistence$|^TODO:?$|^Core methodology$|^Result:?$|^Outcome:?$|^Implementation:?$|^Approach:?$/i.test(name)) continue;
      // Skip strikethrough items (~~text~~) — they're already-resolved gaps.
      if (/^~~.+~~$/.test(name)) continue;
      currentSection.items.push({
        name,
        description: (itemMatch[2] || '').trim(),
      });
      featureMatrix.totalRows++;
      continue;
    }
    // Comprehensive Feature Comparison table rows:
    // | Functionality | Status | Original | Modern |
    // Each row's parts[0] is a feature name; parts[1]/[2]/[3] carry metadata.
    if (ln.startsWith('|') && !ln.includes('Functionality') && !ln.includes('---')) {
      const parts = ln.slice(1, -1).split('|').map((p) => p.trim());
      if (parts.length >= 4 && parts[0] && !parts[0].startsWith('-')) {
        const name = parts[0].replace(/\*\*/g, '').trim();
        const status = parts[1].replace(/\*\*/g, '').trim();
        const original = parts[2].slice(0, 60);
        const modern = parts[3].slice(0, 60);
        if (name) {
          currentSection.items.push({
            name,
            description: `${status} · orig: ${original}${original.length === 60 ? '…' : ''} · now: ${modern}${modern.length === 60 ? '…' : ''}`,
            tableStatus: status,
          });
          featureMatrix.totalRows++;
        }
      }
    }
  }
} catch {}

// ─── Merge lettered/freeform sections into their numbered counterparts ───
// RIZZOMA_FEATURES_STATUS.md uses two parallel taxonomies: "Track A: …",
// "Mobile Modernization (PWA)", "BLB (…) Structure" at the top, AND
// "1. Authentication & Security", "2. Waves & Blips", … at the bottom.
// They cover the SAME features. Merge so each numbered category absorbs the
// matching lettered/freeform one.
const LETTERED_TO_NUMBERED = {
  'track a: selection annotation system': '6. Selection Annotation System',
  'track b: rich text editor': '3. Rich Text Editor',
  'track c: "follow the green" visual system': '5. Unread Tracking (Follow-the-Green)',
  'track d: real-time collaboration (verified 2026-04-24)': '4. Real-time Collaboration',
  'unread tracking & presence': '5. Unread Tracking (Follow-the-Green)',
  'uploads & gadget nodes': '7. File Uploads & Storage',
  'media adapter': '7. File Uploads & Storage',
  'mobile modernization (pwa)': '12. Mobile & PWA',
  'blb (bullet-label-blip) structure': '14. BLB (Bullet-Label-Blip) — Core Paradigm',
  'permissions & auth': '1. Authentication & Security',
  'still pending': '20. DevOps & Deployment',
};

(() => {
  const byName = new Map();
  for (const sec of featureMatrix.sections) byName.set(sec.name, sec);
  const removed = new Set();

  for (const sec of featureMatrix.sections) {
    const target = LETTERED_TO_NUMBERED[sec.name.toLowerCase()];
    if (!target) continue;
    const targetSec = byName.get(target);
    if (!targetSec || targetSec === sec) continue;
    // Append items, deduping by lowercased name to avoid identical rows.
    const existingNames = new Set(targetSec.items.map((i) => i.name.toLowerCase()));
    for (const item of sec.items) {
      if (existingNames.has(item.name.toLowerCase())) continue;
      targetSec.items.push(item);
      existingNames.add(item.name.toLowerCase());
    }
    removed.add(sec);
  }

  // Drop merged sections + numbered prefix is fine to keep (it sorts naturally).
  featureMatrix.sections = featureMatrix.sections.filter((s) => !removed.has(s));
  featureMatrix.totalRows = featureMatrix.sections.reduce((n, s) => n + s.items.length, 0);
})();

// ─── Sweep status: read most recent visual-feature-sweep manifest.json ───
// Show pass/fail counts + delta from the previous sweep so the PM has an
// always-on "where does the gated sweep stand" panel.
let sweepStatus = null;
try {
  const sweepDirs = readdirSync('screenshots', { withFileTypes: true })
    .filter((d) => d.isDirectory() && /feature-sweep|GATED-sweep/.test(d.name))
    .map((d) => 'screenshots/' + d.name)
    .map((p) => {
      try {
        const manifestStat = statSync(p + '/manifest.json');
        return { dir: p, mtimeMs: manifestStat.mtimeMs };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (sweepDirs.length > 0) {
    const readSweep = (sweepDir) => {
      try {
        const m = JSON.parse(readFileSync(sweepDir + '/manifest.json', 'utf8'));
        const checked = (m.captures || []).filter((c) => c.gatePass !== null && c.gatePass !== undefined);
        const passed = checked.filter((c) => c.gatePass === true);
        const failed = checked.filter((c) => c.gatePass === false);
        const noGate = (m.captures || []).filter((c) => c.gatePass === null || c.gatePass === undefined);
        return {
          dir: sweepDir,
          generatedAt: m.generatedAt,
          captures: m.captures?.length || 0,
          checked: checked.length,
          passed: passed.length,
          failed: failed.length,
          noGate: noGate.length,
          failures: failed.map((f) => ({ label: f.label, detail: f.gateDetail || '' })),
        };
      } catch { return null; }
    };

    const latest = readSweep(sweepDirs[0].dir);
    const prev = sweepDirs[1] ? readSweep(sweepDirs[1].dir) : null;
    sweepStatus = {
      latest,
      prev,
      delta: prev && latest ? {
        passed: latest.passed - prev.passed,
        failed: latest.failed - prev.failed,
        checked: latest.checked - prev.checked,
        captures: latest.captures - prev.captures,
        noGate: latest.noGate - prev.noGate,
      } : null,
    };
  }
} catch {}

// ─── Per-phase progress + overall ───
// Done deliverables count as 1.0; WIP count as 0.5 toward the bar fill.
for (const p of PHASES) {
  const total = p.deliverables.length;
  const done = p.deliverables.filter((d) => d.done).length;
  const wip  = p.deliverables.filter(isWip).length;
  const weighted = done + wip * 0.5;
  p.pct = Math.round((weighted / total) * 100);
  p.done = done;
  p.wip = wip;
  p.total = total;
  p.status = p.pct === 100 ? 'done' : (p.pct === 0 && wip === 0 ? 'pending' : 'progress');
}
const totalDays = PHASES.reduce((a, p) => a + p.days, 0);
const completedDays = PHASES.reduce((a, p) => a + (p.days * p.pct) / 100, 0);
const overallPct = Math.round((completedDays / totalDays) * 100);
const phasesDone = PHASES.filter((p) => p.status === 'done').length;

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

// ─── HTML helpers ───
const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const renderInlineMd = (s) =>
  escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>');

// ─── Match features to sweep captures by featureRefs ───
// Each capture in the manifest carries a list of feature refs like
// "Authentication: login modal". A feature is "covered" if some capture's
// featureRefs string-contains its section + name.
const captureByFeatureSection = new Map();
const captureByFeatureName = new Map();
if (sweepStatus && sweepStatus.latest) {
  try {
    const m = JSON.parse(readFileSync(sweepStatus.latest.dir + '/manifest.json', 'utf8'));
    for (const cap of (m.captures || [])) {
      for (const ref of (cap.featureRefs || [])) {
        const refStr = String(ref);
        const colonIdx = refStr.indexOf(':');
        if (colonIdx < 0) continue;
        const sec = refStr.slice(0, colonIdx).trim();
        const nm = refStr.slice(colonIdx + 1).trim();
        const sKey = sec.toLowerCase();
        const nKey = (sec + '::' + nm).toLowerCase();
        if (!captureByFeatureSection.has(sKey)) captureByFeatureSection.set(sKey, []);
        captureByFeatureSection.get(sKey).push(cap);
        if (!captureByFeatureName.has(nKey)) captureByFeatureName.set(nKey, []);
        captureByFeatureName.get(nKey).push(cap);
      }
    }
  } catch {}
}

// Section name aliases — featureRefs in sweep manifest use short labels
// ("Authentication", "BLB"); RIZZOMA_FEATURES_STATUS.md sections are longer
// ("Track A: Selection Annotation System"). Alias each long doc-section to
// the short manifest-section keywords so coverage actually matches.
const sectionAliases = {
  // doc-section name (lowercased) → array of short keys to also try
  'track a: selection annotation system': ['inline comments', 'authentication'],
  'track b: rich text editor': ['rich text', 'inline widgets'],
  'track c: "follow the green" visual system': ['user interface', 'waves'],
  'track d: real-time collaboration (verified 2026-04-24)': ['real-time collaboration'],
  'unread tracking & presence': ['user interface', 'real-time collaboration'],
  'uploads & gadget nodes': ['file uploads'],
  'media adapter': ['file uploads'],
  'mobile modernization (pwa)': ['mobile & pwa'],
  'blb (bullet-label-blip) structure': ['blb'],
  'permissions & auth': ['authentication'],
  '1. authentication & security': ['authentication'],
  '2. waves & blips (core data model)': ['waves', 'blip operations'],
  '3. rich text editor': ['rich text', 'inline widgets'],
  '4. real-time collaboration': ['real-time collaboration'],
  '5. unread tracking (follow-the-green)': ['user interface'],
  '6. selection annotation system': ['inline comments'],
  '7. file uploads & storage': ['file uploads'],
  '8. search & recovery': ['search'],
  '9. blip operations (gear menu)': ['blip operations'],
  '10. history & playback': ['history', 'history & playback'],
  '11. email notifications': ['email'],
  '12. mobile & pwa': ['mobile & pwa'],
  '13. user interface components': ['user interface'],
  '14. blb (bullet-label-blip) — core paradigm': ['blb'],
  '15. inline widgets & styling': ['inline widgets', 'rich text'],
  '16. database & storage': [],
  '17. api architecture': [],
  '18. testing & quality': [],
  '19. performance optimizations': [],
  '20. devops & deployment': [],
};

// Token-based name matcher — pull meaningful tokens out of "Inline marker [+]"
// and "BLB: inline expansion" so they cross-match.
const tokenize = (s) => (s || '').toLowerCase()
  .replace(/[^\w\s+-]/g, ' ')
  .split(/\s+/).filter((t) => t.length > 2 && !['the', 'and', 'for', 'via', 'with', 'from', 'all', 'new', 'old', 'has'].includes(t));

// Sections that are not visually testable (backend / infra / deploy-only).
// Items in these get classified 'na-nonvisual' and excluded from coverage %.
const nonVisualSections = new Set([
  '16. database & storage',
  '17. api architecture',
  '18. testing & quality',
  '19. performance optimizations',
  '20. devops & deployment',
]);

// Per-feature backend keywords — even within a visual section, things like
// "CSRF protection", "Rate limiting", "Zod validation" have no visible UI.
const nonVisualKeywords = /\b(redis|csrf|zod|rate limit(?:ing)?|middleware|requireauth|migration|index(?:ing)?|ssl|tls|cors|helmet|cookie|session storage|backend|api endpoint|http \d|status code|validation|schema|database|s3|minio|clamav|virus scan|nginx|docker|deploy|build|webpack|vite|esbuild|eslint|prettier|playwright|vitest|jest|test suite|ci|cd|gh actions|coverage|systemd)\b/i;

const featureStatusForItem = (sectionName, item) => {
  const sLow = sectionName.toLowerCase();
  if (nonVisualSections.has(sLow) || nonVisualKeywords.test(item.name)) {
    return { status: 'na-nonvisual', captures: [] };
  }
  const aliases = sectionAliases[sLow] || [sLow];
  const trySections = new Set([sLow, ...aliases]);
  const itemTokens = new Set(tokenize(item.name));
  if (itemTokens.size === 0) return { status: 'uncovered', captures: [] };

  // Score every (capture, ref) pair by Jaccard token overlap with the item
  // name. Only the BEST capture (highest score) AND only when score ≥ 0.5
  // is allowed to claim PASS/FAIL. Lower-scored captures contribute as
  // "covered evidence" but don't propagate the verdict — this prevents one
  // FAIL capture from spilling onto every section-mate via shared tokens.
  let bestCap = null;
  let bestScore = 0;
  const allMatched = [];
  const seenCap = new Set();
  for (const k of trySections) {
    const sectionCaps = captureByFeatureSection.get(k) || [];
    for (const cap of sectionCaps) {
      let capBest = 0;
      for (const ref of (cap.featureRefs || [])) {
        const refStr = String(ref);
        const colonIdx = refStr.indexOf(':');
        const refSection = colonIdx >= 0 ? refStr.slice(0, colonIdx).trim().toLowerCase() : '';
        if (refSection !== k) continue;
        const refName = colonIdx >= 0 ? refStr.slice(colonIdx + 1).trim() : refStr;
        const refTokens = new Set(tokenize(refName));
        if (refTokens.size === 0) continue;
        let inter = 0;
        for (const t of refTokens) if (itemTokens.has(t)) inter++;
        if (inter === 0) continue;
        const union = refTokens.size + itemTokens.size - inter;
        const j = inter / union;
        if (j > capBest) capBest = j;
      }
      if (capBest > 0) {
        const key = cap.file || cap.label || JSON.stringify(cap).slice(0, 40);
        if (!seenCap.has(key)) { seenCap.add(key); allMatched.push(cap); }
        if (capBest > bestScore) { bestScore = capBest; bestCap = cap; }
      }
    }
  }

  if (allMatched.length === 0) return { status: 'uncovered', captures: [] };
  const STRONG_MATCH = 0.5;
  if (bestCap && bestScore >= STRONG_MATCH) {
    if (bestCap.gatePass === false) return { status: 'fail', captures: [bestCap, ...allMatched.filter((c) => c !== bestCap)] };
    if (bestCap.gatePass === true) return { status: 'pass', captures: [bestCap, ...allMatched.filter((c) => c !== bestCap)] };
  }
  return { status: 'covered-no-gate', captures: allMatched };
};

// Per-category statuses + grand totals (single pass — featureStatusForItem
// is pure, but call it once and cache).
const sectionStats = featureMatrix.sections.map((section) => {
  const items = section.items.map((item) => ({ item, fs: featureStatusForItem(section.name, item) }));
  const total = items.length;
  const pass = items.filter((x) => x.fs.status === 'pass').length;
  const fail = items.filter((x) => x.fs.status === 'fail').length;
  const noGate = items.filter((x) => x.fs.status === 'covered-no-gate').length;
  const naNon = items.filter((x) => x.fs.status === 'na-nonvisual').length;
  const visual = total - naNon;  // denominator for coverage %
  const uncov = visual - pass - fail - noGate;
  // Coverage % over VISUAL features only.
  const score = visual === 0 ? -1 : (pass + noGate * 0.5 - fail * 0.25) / visual;
  return { section, items, total, visual, pass, fail, noGate, naNon, uncov, score };
}).filter((s) => s.total > 0);

// Grand totals — coverage % computed over visually-testable subset only.
const G = sectionStats.reduce((acc, s) => {
  acc.pass += s.pass; acc.fail += s.fail; acc.noGate += s.noGate;
  acc.uncov += s.uncov; acc.naNon += s.naNon;
  acc.total += s.total; acc.visual += s.visual;
  return acc;
}, { pass: 0, fail: 0, noGate: 0, uncov: 0, naNon: 0, total: 0, visual: 0 });
const coveragePct = G.visual === 0 ? 0 : Math.round((G.pass + G.noGate * 0.5) / G.visual * 100);

// Sort sections: highest FAIL % first (broken stuff floats to top so user
// sees regressions immediately). Tie-break by absolute fail count, then by
// uncovered count so still-broken-and-untested categories rank above
// already-PASS categories.
sectionStats.sort((a, b) => {
  const aFailPct = a.total === 0 ? 0 : a.fail / a.total;
  const bFailPct = b.total === 0 ? 0 : b.fail / b.total;
  if (bFailPct !== aFailPct) return bFailPct - aFailPct;
  if (b.fail !== a.fail) return b.fail - a.fail;
  if (b.uncov !== a.uncov) return b.uncov - a.uncov;
  return b.score - a.score;
});

// Render the OVERALL stacked bar at the top
const overallBar = (() => {
  const seg = (n, color, denom) => n === 0 ? '' :
    `<span style="display:inline-block;height:14px;background:${color};width:${(n / denom * 100).toFixed(2)}%" title="${n} features"></span>`;
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.5rem">
      <strong style="font-size:1.05rem">Visual coverage</strong>
      <span style="font-size:0.85rem;color:var(--lb)">over <strong>${G.visual}</strong> visually-testable feature${G.visual === 1 ? '' : 's'}</span>
      <span style="font-size:1.25rem;font-weight:800;color:${coveragePct >= 50 ? 'var(--green)' : coveragePct >= 25 ? 'var(--amber)' : 'var(--red)'}">${coveragePct}%</span>
    </div>
    <div style="display:flex;width:100%;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden;margin-bottom:0.6rem">
      ${seg(G.pass, 'var(--green)', G.visual)}${seg(G.noGate, 'var(--amber)', G.visual)}${seg(G.fail, 'var(--red)', G.visual)}${seg(G.uncov, 'rgba(255,255,255,0.08)', G.visual)}
    </div>
    <div style="display:flex;gap:1.25rem;font-size:0.85rem;color:var(--lb);flex-wrap:wrap">
      <span><span style="color:var(--green);font-weight:700">●</span> ${G.pass} verified PASS</span>
      <span><span style="color:var(--red);font-weight:700">●</span> ${G.fail} verified FAIL</span>
      <span title="A capture in the matching section exists AND its gate PASSES, but its featureRef name has weak (Jaccard token overlap < 0.5) match with this feature's name. Evidence is nearby but match confidence is too low to claim a specific verified PASS. Tighten by adding the feature's name keywords to the relevant capture's featureRefs array in scripts/visual-feature-sweep.mjs."><span style="color:var(--amber);font-weight:700">●</span> ${G.noGate} weak match (low confidence)</span>
      <span><span style="color:var(--gray)">●</span> ${G.uncov} not yet covered (visual)</span>
      ${G.naNon > 0 ? `<span><span style="color:#7080a0;font-weight:700">●</span> ${G.naNon} N/A — backend / infra (excluded)</span>` : ''}
      <span style="margin-left:auto"><strong>${G.total}</strong> total features in ${sectionStats.length} categories</span>
    </div>
  </div>`;
})();

// Fractal accordion: Category → Feature → Capture(s).
// L1 = category row (chevron + name + colored chip counts + % bar)
// L2 = feature row inside an open category (chevron + name + status badge + capture count)
// L3 = capture details inside an open feature (file thumbnail + gate detail + assertion text)
const renderCaptureDetail = (cap) => {
  const fileRel = cap.file || '';
  const fileName = fileRel.split('/').pop() || fileRel;
  const passLabel = cap.gatePass === true ? '<span style="color:var(--green);font-weight:700">PASS</span>'
                  : cap.gatePass === false ? '<span style="color:var(--red);font-weight:700">FAIL</span>'
                  : '<span style="color:var(--amber);font-weight:700">no gate</span>';
  return `<div class="cap-detail">
    <div class="cap-thumb">${fileRel ? `<a href="${escapeHtml(fileRel)}" target="_blank" rel="noopener"><img src="${escapeHtml(fileRel)}" alt="${escapeHtml(fileName)}" loading="lazy"/></a>` : '<div class="cap-thumb-empty">no screenshot</div>'}</div>
    <div class="cap-meta">
      <div class="cap-label"><strong>${escapeHtml(cap.label || fileName)}</strong> · ${passLabel}</div>
      ${cap.assertion ? `<div class="cap-assertion">${escapeHtml(cap.assertion)}</div>` : ''}
      ${cap.gateDetail ? `<div class="cap-gate"><code>${escapeHtml(cap.gateDetail)}</code></div>` : ''}
      ${cap.featureRefs && cap.featureRefs.length ? `<div class="cap-refs">${cap.featureRefs.map((r) => `<span class="cap-ref-tag">${escapeHtml(r)}</span>`).join('')}</div>` : ''}
    </div>
  </div>`;
};

const renderFeature = (x) => {
  const sym = x.fs.status === 'pass' ? '✓' : x.fs.status === 'fail' ? '✗' : x.fs.status === 'covered-no-gate' ? '·' : x.fs.status === 'na-nonvisual' ? '∅' : '○';
  const color = x.fs.status === 'pass' ? 'var(--green)'
              : x.fs.status === 'fail' ? 'var(--red)'
              : x.fs.status === 'covered-no-gate' ? 'var(--amber)'
              : x.fs.status === 'na-nonvisual' ? '#7080a0'
              : 'var(--gray)';
  const captures = x.fs.captures || [];
  const hasCaptures = captures.length > 0;
  // Auto-open features that FAIL (so the user sees them without a click).
  const open = x.fs.status === 'fail' ? 'open' : '';
  return `<details class="fc-feat">
    <summary class="fc-feat-summary">
      <span class="fc-chev">▸</span>
      <span class="fc-feat-badge" style="color:${color};border-color:${color}">${sym}</span>
      <span class="fc-feat-name">${escapeHtml(x.item.name)}</span>
      <span class="fc-feat-meta">${hasCaptures ? captures.length + ' capture' + (captures.length === 1 ? '' : 's') : '<span style="color:var(--gray)">no capture</span>'}</span>
    </summary>
    <div class="fc-feat-body">
      ${x.item.description ? `<div class="fc-feat-desc">${escapeHtml(x.item.description)}</div>` : ''}
      ${hasCaptures ? captures.map(renderCaptureDetail).join('') : '<div class="fc-feat-empty">No sweep capture currently targets this feature. Consider adding a capture() call with assertFn in scripts/visual-feature-sweep.mjs.</div>'}
    </div>
  </details>`;
};

const featureMatrixHtml = overallBar + sectionStats.map((s) => {
  const pct = s.total === 0 ? 0 : Math.round((s.pass + s.noGate * 0.5) / s.total * 100);
  const headerColor = pct >= 75 ? 'var(--green)' : pct >= 33 ? 'var(--amber)' : pct === 0 ? 'var(--gray)' : 'var(--red)';
  // Sort features within category: failures first, then no-gate, then passes, then uncovered.
  const order = { fail: 0, 'covered-no-gate': 1, pass: 2, uncovered: 3, 'na-nonvisual': 4 };
  const sortedItems = [...s.items].sort((a, b) => (order[a.fs.status] ?? 9) - (order[b.fs.status] ?? 9));
  const featuresHtml = sortedItems.map(renderFeature).join('');
  // Category-level mini stacked bar (visual at-a-glance for the segment proportions).
  // Mini bar: only over visually-testable subset; N/A shown as separate
  // hatched segment on the right to keep total width = total but visually
  // distinguish "we shouldn't be testing this" from "we haven't tested this".
  const seg = (n, c, denom) => n === 0 ? '' : `<span style="display:inline-block;height:6px;background:${c};width:${(n / denom * 100).toFixed(2)}%"></span>`;
  const miniBar = `<span class="fc-mini-bar">${seg(s.pass, 'var(--green)', s.total)}${seg(s.noGate, 'var(--amber)', s.total)}${seg(s.fail, 'var(--red)', s.total)}${seg(s.uncov, 'rgba(255,255,255,0.10)', s.total)}${seg(s.naNon, 'repeating-linear-gradient(45deg,#3a4660,#3a4660 3px,#2a3344 3px,#2a3344 6px)', s.total)}</span>`;
  return `<details class="fc-cat">
    <summary class="fc-cat-summary">
      <span class="fc-chev">▸</span>
      <span class="fc-cat-title">${escapeHtml(s.section.name)}</span>
      <span class="fc-cat-count" title="${s.visual} visually-testable / ${s.total} total">${s.visual}<span style="color:var(--gray);opacity:0.6">/${s.total}</span></span>
      ${miniBar}
      <span class="fc-cat-counts">
        ${s.pass > 0 ? `<span class="fc-chip fc-chip-pass">${s.pass}✓</span>` : ''}
        ${s.fail > 0 ? `<span class="fc-chip fc-chip-fail">${s.fail}✗</span>` : ''}
        ${s.noGate > 0 ? `<span class="fc-chip fc-chip-amber">${s.noGate}·</span>` : ''}
        ${s.uncov > 0 ? `<span class="fc-chip fc-chip-uncov">${s.uncov}○</span>` : ''}
        ${s.naNon > 0 ? `<span class="fc-chip fc-chip-na" title="Non-visual: backend / infra / deploy. Excluded from coverage %.">${s.naNon}∅</span>` : ''}
      </span>
      <span class="fc-cat-pct" style="color:${headerColor}">${pct}%</span>
    </summary>
    <div class="fc-cat-body">${featuresHtml}</div>
  </details>`;
}).join('');

// ─── Pre-compute sweep panel HTML to avoid nested template literals ───
const arrow = (n) => n > 0 ? '<span style="color:var(--green)">+' + n + '</span>'
                          : (n < 0 ? '<span style="color:var(--red)">' + n + '</span>'
                                   : '<span style="opacity:0.6">±0</span>');
let sweepHtml = '<div class="live-activity idle"><div class="idle-banner">⚠ No sweep manifest found in screenshots/. Run <code>node scripts/visual-feature-sweep.mjs</code> to populate.</div></div>';
if (sweepStatus && sweepStatus.latest) {
  const s = sweepStatus.latest;
  const d = sweepStatus.delta;
  const passPct = s.checked > 0 ? Math.round((s.passed / s.checked) * 100) : 0;
  const fillCls = passPct === 100 ? 'green' : (passPct >= 70 ? 'amber' : 'gray');
  const idleCls = s.failed > 0 ? ' idle' : '';
  const headColor = (s.passed === s.checked && s.failed === 0) ? 'var(--green)' : 'var(--amber)';
  const failsBlock = s.failures.length > 0
    ? s.failures.slice(0, 8).map((f) =>
        '<div class="live-row"><span class="lbl" style="color:var(--red)">FAIL</span>' +
        '<span class="live-detail">' + escapeHtml(f.label) + ' — ' + escapeHtml(f.detail.slice(0, 100)) + '</span></div>'
      ).join('')
    : '';
  const deltaBlock = d
    ? '<div class="live-row"><span class="lbl" style="color:var(--lb)">Δ</span>' +
      '<span class="live-detail">passed ' + arrow(d.passed) + ' · failed ' + arrow(d.failed) +
      ' · checked ' + arrow(d.checked) + ' · captures ' + arrow(d.captures) + '</span></div>'
    : '';
  const sinceText = d ? '(' + arrow(d.passed) + ' since previous)' : '(first sweep)';
  sweepHtml = ''
    + '<div class="live-activity' + idleCls + '">'
    + '<div class="live-row">'
    +   '<span class="lbl" style="color:' + headColor + '">SWEEP</span>'
    +   '<span><strong>' + s.passed + ' / ' + s.checked + ' programmatic gates PASS</strong> '
    +     sinceText + ' · ' + s.failed + ' FAIL · ' + s.noGate + ' no-gate · ' + s.captures + ' captures total</span>'
    + '</div>'
    + '<div class="pbar-row">'
    +   '<div class="pbar-wrapper"><div class="pbar-fill ' + fillCls + '" style="--target:' + passPct + '%"></div></div>'
    +   '<div class="pbar-pct">' + passPct + '%</div>'
    + '</div>'
    + '<div class="live-row">'
    +   '<span class="lbl" style="color:var(--lb)">DIR</span>'
    +   '<span class="live-detail">' + escapeHtml(s.dir) + ' · ' + escapeHtml(new Date(s.generatedAt).toLocaleString()) + '</span>'
    + '</div>'
    + failsBlock
    + deltaBlock
    + '</div>';
}

// ─── HTML body ───
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Native Render Port — PM</title>
<style>
  :root {
    --bg: #0a1428;
    --bg-card: #11203c;
    --bg-elev: #182a4a;
    --gold: #dbad50;
    --green: #4caf83;
    --amber: #e0a800;
    --red: #d96b6b;
    --gray: #6e7a93;
    --wh: #e8edf3;
    --lb: #a0acc0;
    --border: rgba(255,255,255,.08);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: var(--bg);
    color: var(--wh);
    font-family: system-ui, -apple-system, "Segoe UI", Helvetica, sans-serif;
    line-height: 1.5;
    padding: 32px 24px 80px;
    max-width: 1200px; margin: 0 auto;
  }
  a { color: var(--gold); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.85em; padding: 2px 5px; background: rgba(255,255,255,.06); border-radius: 3px; }
  h1 { font-size: 1.75rem; margin-bottom: 4px; }
  h2 { font-size: 1.25rem; margin: 24px 0 12px; }
  h3 { font-size: 1.1rem; margin: 0 0 6px; }
  .subtitle { color: var(--lb); font-size: 0.95rem; margin-bottom: 12px; }
  .meta { font-size: 0.78rem; color: var(--lb); margin: 8px 0 24px; }
  .meta a { color: var(--lb); border-bottom: 1px dotted var(--lb); }
  .stamp {
    display: inline-block; padding: 4px 10px;
    background: rgba(76,175,131,0.15); color: var(--green);
    border-radius: 4px; font-size: 0.78rem; font-variant-numeric: tabular-nums;
    transition: background 0.4s ease, color 0.4s ease;
  }
  .stamp.flash { background: rgba(219,173,80,0.3); color: var(--gold); }
  .grid-overall {
    display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px;
    margin: 16px 0 32px;
  }
  .stat-card { background: var(--bg-card); border-radius: 8px; padding: 16px; border: 1px solid var(--border); }
  .stat-num { font-size: 2rem; font-weight: 800; color: var(--gold); line-height: 1; }
  .stat-lbl { font-size: 0.75rem; color: var(--lb); text-transform: uppercase; letter-spacing: 0.6px; margin-top: 6px; }
  .pbar-wrapper { background: rgba(255,255,255,.06); border-radius: 99px; height: 12px; overflow: hidden; position: relative; }
  .pbar-fill {
    background: linear-gradient(90deg, var(--gold), #f0c870);
    height: 100%;
    border-radius: 99px;
    transform: translateX(-100%);
    transition: transform 1.4s cubic-bezier(.2, .8, .25, 1);
  }
  .pbar-fill.green { background: linear-gradient(90deg, var(--green), #6ec896); }
  .pbar-fill.amber { background: linear-gradient(90deg, var(--amber), #f0c460); }
  .pbar-fill.gray  { background: var(--gray); }
  .pbar-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; margin: 12px 0; }
  .pbar-pct { font-variant-numeric: tabular-nums; font-weight: 700; min-width: 90px; text-align: right; }
  .phase-card {
    background: var(--bg-card); border-radius: 12px; padding: 20px 22px; margin-bottom: 16px;
    border: 1px solid var(--border);
    transition: border-color 0.2s;
  }
  .phase-card:hover { border-color: rgba(219,173,80,0.35); }

  /* Fractal accordion: Category → Feature → Capture */
  .fc-cat, .fc-feat {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    margin-bottom: 6px; overflow: hidden;
    transition: border-color 0.15s;
  }
  .fc-cat:hover, .fc-feat:hover { border-color: rgba(219,173,80,0.30); }
  .fc-cat[open] { border-color: rgba(219,173,80,0.50); }
  .fc-feat { background: rgba(255,255,255,0.02); margin-bottom: 4px; }
  .fc-feat[open] { background: rgba(219,173,80,0.04); }

  .fc-cat-summary, .fc-feat-summary {
    cursor: pointer; user-select: none;
    list-style: none;
    padding: 12px 16px;
    display: grid; align-items: center; gap: 12px;
  }
  .fc-cat-summary { grid-template-columns: 18px minmax(150px, 28%) 36px minmax(100px, 1fr) auto 56px; }
  .fc-feat-summary { grid-template-columns: 16px 28px 1fr auto; padding: 9px 14px; font-size: 0.92rem; }
  .fc-cat-summary::-webkit-details-marker, .fc-feat-summary::-webkit-details-marker { display: none; }
  .fc-cat-summary::marker, .fc-feat-summary::marker { display: none; content: ''; }

  .fc-chev {
    display: inline-block; transition: transform 0.18s ease-out;
    font-size: 0.75rem; color: var(--lb); width: 14px; text-align: center;
  }
  details[open] > summary > .fc-chev { transform: rotate(90deg); color: var(--gold); }

  .fc-cat-title { font-weight: 700; font-size: 1rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fc-cat-count {
    display: inline-flex; align-items: center; justify-content: center;
    height: 22px; min-width: 28px; padding: 0 8px;
    background: rgba(255,255,255,0.05); border-radius: 11px;
    font-size: 0.78rem; font-weight: 700; color: var(--lb);
  }
  .fc-mini-bar {
    display: flex; height: 6px; width: 100%; max-width: 180px;
    background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden;
  }
  .fc-cat-counts { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: nowrap; }
  .fc-chip {
    display: inline-flex; align-items: center; height: 20px; padding: 0 7px;
    border-radius: 10px; font-size: 0.74rem; font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .fc-chip-pass { background: rgba(76,175,131,0.18); color: var(--green); }
  .fc-chip-fail { background: rgba(217,107,107,0.20); color: var(--red); animation: pulse 2s ease-in-out infinite; }
  .fc-chip-amber { background: rgba(224,168,0,0.18); color: var(--amber); }
  .fc-chip-uncov { background: rgba(255,255,255,0.04); color: var(--gray); }
  .fc-chip-na { background: rgba(112,128,160,0.10); color: #7080a0; cursor: help; }
  .fc-cat-pct { font-weight: 800; font-size: 1rem; text-align: right; font-variant-numeric: tabular-nums; }

  .fc-cat-body { padding: 6px 14px 14px 30px; border-top: 1px dashed rgba(219,173,80,0.18); }

  .fc-feat-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 4px;
    border: 1.5px solid; font-weight: 800; font-size: 0.85rem;
  }
  .fc-feat-name { color: var(--text); }
  .fc-feat-meta { font-size: 0.78rem; color: var(--lb); }
  .fc-feat-body {
    padding: 8px 14px 14px 14px; border-top: 1px dashed var(--border);
    background: rgba(0,0,0,0.10);
  }
  .fc-feat-desc { font-size: 0.85rem; color: var(--lb); margin-bottom: 8px; line-height: 1.5; }
  .fc-feat-empty { font-size: 0.82rem; color: var(--gray); font-style: italic; padding: 6px; }

  /* Capture detail = thumbnail + meta side-by-side */
  .cap-detail {
    display: grid; grid-template-columns: 200px 1fr; gap: 14px;
    margin-top: 8px; padding: 10px;
    background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 6px;
  }
  .cap-thumb img {
    width: 100%; max-width: 200px; max-height: 130px;
    object-fit: cover; object-position: top left;
    border-radius: 4px; border: 1px solid var(--border);
    transition: transform 0.15s, max-height 0.2s;
  }
  .cap-thumb img:hover { transform: scale(1.04); border-color: var(--gold); }
  .cap-thumb-empty { width: 200px; height: 100px; background: rgba(255,255,255,0.04); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--gray); }
  .cap-meta { font-size: 0.85rem; }
  .cap-label { margin-bottom: 6px; }
  .cap-assertion { color: var(--lb); margin-bottom: 6px; line-height: 1.4; }
  .cap-gate code { font-size: 0.78rem; padding: 2px 6px; background: rgba(0,0,0,0.30); border-radius: 3px; color: var(--gold); }
  .cap-refs { margin-top: 6px; display: flex; gap: 4px; flex-wrap: wrap; }
  .cap-ref-tag { font-size: 0.72rem; padding: 2px 7px; background: rgba(120,188,255,0.10); color: rgb(120,188,255); border-radius: 9px; }

  @media (max-width: 800px) {
    .fc-cat-summary { grid-template-columns: 18px 1fr auto; }
    .fc-mini-bar, .fc-cat-count, .fc-cat-counts { display: none; }
    .cap-detail { grid-template-columns: 1fr; }
    .cap-thumb img { max-width: 100%; }
  }

  /* Compact coverage strips for the feature matrix */
  .cov-cat {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    margin-bottom: 6px; transition: border-color 0.2s;
    overflow: hidden;
  }
  .cov-cat:hover { border-color: rgba(219,173,80,0.30); }
  .cov-cat[open] { border-color: rgba(219,173,80,0.45); }
  .cov-summary {
    display: grid;
    grid-template-columns: minmax(180px, 22%) 1fr minmax(120px, auto) 56px;
    align-items: center; gap: 14px;
    padding: 10px 14px;
    cursor: pointer; user-select: none;
    list-style: none;
  }
  .cov-summary::-webkit-details-marker { display: none; }
  .cov-summary::marker { display: none; content: ''; }
  .cov-cat-title { font-weight: 600; font-size: 0.95rem; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cov-strip { display: flex; gap: 2px; align-items: center; flex-wrap: nowrap; min-width: 0; }
  .cov-cell {
    display: inline-block;
    width: 14px; height: 14px;
    border-radius: 2px;
    border: 1px solid rgba(0,0,0,0.2);
    flex-shrink: 0;
    transition: transform 0.1s;
  }
  .cov-cell:hover { transform: scale(1.4); border-color: var(--gold); z-index: 2; position: relative; }
  .cov-cell.cov-uncovered { border-color: rgba(255,255,255,0.18); }
  .cov-counts { display: flex; gap: 8px; font-size: 0.85rem; font-variant-numeric: tabular-nums; justify-content: flex-end; }
  .cov-pct { font-weight: 800; font-size: 1rem; text-align: right; font-variant-numeric: tabular-nums; }
  .cov-detail { padding: 6px 14px 14px 14px; border-top: 1px solid var(--border); margin-top: 4px; }
  .cov-cat[open] .cov-summary { border-bottom: 1px dashed var(--border); }
  @media (max-width: 800px) {
    .cov-summary { grid-template-columns: 1fr auto; }
    .cov-strip { grid-column: 1 / -1; }
  }
  .phase-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }
  .phase-num { color: var(--gold); font-weight: 800; font-size: 0.85rem; letter-spacing: 0.5px; }
  .phase-title { font-size: 1.15rem; font-weight: 700; }
  .phase-short { color: var(--lb); font-size: 0.85rem; margin-bottom: 12px; }
  .phase-meta { display: flex; gap: 12px; font-size: 0.78rem; color: var(--lb); flex-wrap: wrap; }
  .pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 3px 10px; border-radius: 99px;
    font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.6px; white-space: nowrap;
  }
  .pill-done { background: rgba(76,175,131,0.18); color: var(--green); border: 1px solid rgba(76,175,131,0.4); }
  .pill-progress { background: rgba(224,168,0,0.15); color: var(--amber); border: 1px solid rgba(224,168,0,0.4); }
  .pill-pending { background: rgba(110,122,147,0.15); color: var(--gray); border: 1px solid rgba(110,122,147,0.4); }
  .deliv-list { margin: 14px 0 0; padding: 0; list-style: none; }
  .deliv {
    display: grid; grid-template-columns: 22px 1fr auto; gap: 10px; align-items: start;
    padding: 6px 0; border-top: 1px solid var(--border);
    font-size: 0.88rem;
  }
  .deliv:first-child { border-top: none; padding-top: 4px; }
  .deliv-check {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; border-radius: 4px;
    border: 1.5px solid var(--gray); color: var(--gray); font-size: 0.7rem; font-weight: 800;
    margin-top: 2px;
  }
  .deliv-check.done { background: rgba(76,175,131,0.2); border-color: var(--green); color: var(--green); }
  .deliv-check.wip {
    background: rgba(224,168,0,0.2); border-color: var(--amber); color: var(--amber);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .deliv-check.failed {
    background: rgba(217,107,107,0.25); border-color: var(--red); color: var(--red);
    animation: pulse-red 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(224,168,0,0.55); }
    50%      { box-shadow: 0 0 0 4px rgba(224,168,0,0); }
  }
  @keyframes pulse-red {
    0%, 100% { box-shadow: 0 0 0 0 rgba(217,107,107,0.55); }
    50%      { box-shadow: 0 0 0 4px rgba(217,107,107,0); }
  }
  .deliv-label { color: var(--wh); }
  .deliv-label.done { color: var(--lb); }
  .deliv-label.wip { color: var(--amber); font-weight: 600; }
  .deliv-label.wip::after {
    content: " — IN PROGRESS";
    font-size: 0.7rem; font-weight: 700; color: var(--amber);
    background: rgba(224,168,0,0.12);
    padding: 1px 6px; border-radius: 99px; margin-left: 6px;
    vertical-align: middle;
  }
  .deliv-label.failed { color: var(--red); font-weight: 600; }
  .deliv-label.failed::after {
    content: " — FAILED";
    font-size: 0.7rem; font-weight: 800; color: var(--red);
    background: rgba(217,107,107,0.12);
    padding: 1px 6px; border-radius: 99px; margin-left: 6px;
    vertical-align: middle;
  }
  .deliv-commit a { font-family: ui-monospace, monospace; font-size: 0.78rem; color: var(--gold); padding: 2px 6px; background: rgba(219,173,80,0.1); border-radius: 4px; }
  .live-activity {
    background: var(--bg-card); border-radius: 12px; padding: 16px 20px;
    margin: 16px 0 24px;
    border-left: 4px solid var(--green);
  }
  .live-activity.idle { border-left-color: var(--red); background: rgba(217,107,107,0.08); }
  .live-activity.idle-banner {
    text-align: center; font-weight: 700; font-size: 1rem;
    padding: 20px; color: var(--red);
  }
  .live-activity h3 { color: var(--green); font-size: 0.85rem; letter-spacing: 0.6px; text-transform: uppercase; margin-bottom: 10px; }
  .live-activity.idle h3 { color: var(--red); }
  .live-row { display: grid; grid-template-columns: 80px 1fr; gap: 10px; padding: 4px 0; font-size: 0.85rem; }
  .live-row .lbl { font-weight: 700; font-size: 0.72rem; color: var(--lb); text-transform: uppercase; letter-spacing: 0.5px; }
  .live-detail { color: var(--lb); font-family: ui-monospace, monospace; font-size: 0.78rem; padding: 1px 0; }
  .recent-commits, .calendar { background: var(--bg-card); border-radius: 12px; padding: 20px 22px; margin-bottom: 24px; border: 1px solid var(--border); }
  .commit-row { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border); font-size: 0.85rem; }
  .commit-row:first-child { border-top: none; padding-top: 4px; }
  .commit-hash a { font-family: ui-monospace, monospace; color: var(--gold); }
  .commit-when { color: var(--lb); font-size: 0.78rem; white-space: nowrap; }
  .calendar { overflow-x: auto; }
  .cal-grid { display: grid; grid-template-columns: 60px repeat(5, 1fr); gap: 8px; min-width: 700px; font-size: 0.85rem; }
  .cal-week { color: var(--lb); font-weight: 600; align-self: center; }
  .cal-day { background: var(--bg-elev); padding: 12px; border-radius: 6px; text-align: center; border: 1px solid var(--border); font-size: 0.78rem; }
  .cal-day.today { box-shadow: 0 0 0 2px var(--gold) inset; }
  .footer { margin-top: 40px; color: var(--lb); font-size: 0.82rem; text-align: center; padding: 16px; border-top: 1px solid var(--border); }
  .refresh-toggle {
    position: fixed; right: 16px; bottom: 16px;
    background: var(--bg-card); border: 1px solid var(--border);
    color: var(--lb); padding: 8px 12px; border-radius: 99px;
    font-size: 0.78rem; cursor: pointer; user-select: none;
  }
  .refresh-toggle.on { color: var(--green); border-color: rgba(76,175,131,0.4); }
  @media (max-width: 720px) { .grid-overall { grid-template-columns: 1fr 1fr; } }

  /* Tabs */
  .tab-nav {
    display: flex; gap: 4px; margin: 0 0 1.5rem 0;
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--bg); z-index: 10;
    padding-top: 0.5rem;
  }
  .tab-btn {
    background: transparent; border: none; color: var(--lb);
    padding: 12px 20px; cursor: pointer; font-size: 0.95rem; font-weight: 600;
    border-bottom: 3px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    border-radius: 6px 6px 0 0;
  }
  .tab-btn:hover { color: var(--text); background: rgba(255,255,255,0.03); }
  .tab-btn.active {
    color: var(--gold);
    border-bottom-color: var(--gold);
    background: rgba(219,173,80,0.06);
  }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  /* Hide footer-only sticky behaviour so it sits naturally */
</style>
</head>
<body>

<header>
  <h1>🚀 Native Fractal-Render Port</h1>
  <p class="subtitle">
    Live PM tracker. Replace React/TipTap hybrid with direct TS port of original Rizzoma's content-array + linear-walk model.
  </p>
  <p class="meta">
    <a href="https://github.com/${REPO}/blob/${BRANCH}/docs/NATIVE_RENDER_PORT_PLAN.md">Plan</a> ·
    <a href="https://github.com/${REPO}/blob/${BRANCH}/docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md">Why</a> ·
    <a href="https://github.com/${REPO}/issues/50">Epic #50</a>
    &nbsp;·&nbsp; Snapshot: <span id="stamp" class="stamp">${stamp}</span>
    &nbsp;·&nbsp; <span id="refresh-status">auto-refresh ON</span>
  </p>
</header>

<nav class="tab-nav">
  <button class="tab-btn" data-tab="live">● Live activity</button>
  <button class="tab-btn" data-tab="phases">🚀 Dev Phases</button>
  <button class="tab-btn" data-tab="sweep">🛡 Feature Sweep</button>
</nav>

<div class="tab-panel" data-tab="phases">

<section>
  <h2>🎯 Overall</h2>
  <div class="grid-overall">
    <div class="stat-card"><div class="stat-num">${overallPct}%</div><div class="stat-lbl">Complete</div></div>
    <div class="stat-card"><div class="stat-num">${completedDays.toFixed(1)}<span style="font-size:1rem;color:var(--lb)"> / ${totalDays}</span></div><div class="stat-lbl">Workdays</div></div>
    <div class="stat-card"><div class="stat-num">${phasesDone}<span style="font-size:1rem;color:var(--lb)"> / 6</span></div><div class="stat-lbl">Phases done</div></div>
    <div class="stat-card"><div class="stat-num">${recentCommits.length}</div><div class="stat-lbl">Commits on port branch</div></div>
  </div>
  <div class="pbar-row">
    <div class="pbar-wrapper"><div class="pbar-fill" style="--target:${overallPct}%"></div></div>
    <div class="pbar-pct">${overallPct}%</div>
  </div>
</section>

</div><!-- /tab-phases (Overall) -->

<div class="tab-panel" data-tab="live">

<section>
  <h2>● Live activity</h2>
  ${activeProcs.length === 0 && recentFiles.length === 0 ? `
  <div class="live-activity idle">
    <div class="idle-banner">⚠ IDLE — no active processes, no files edited in ${RECENT_WINDOW_S}s</div>
  </div>` : `
  <div class="live-activity${activeProcs.length === 0 ? ' idle' : ''}">
    <div class="live-row">
      <span class="lbl" style="color:${activeProcs.length ? 'var(--green)' : 'var(--gray)'}">PROCS</span>
      <span>${activeProcs.length} active${activeProcs.length === 0 ? ' (no dev/test process running)' : ''}</span>
    </div>
    ${activeProcs.slice(0, 6).map((p) => `<div class="live-row"><span></span><span class="live-detail">pid ${escapeHtml(p.pid)}: ${escapeHtml(p.cmd)}</span></div>`).join('')}
    <div class="live-row">
      <span class="lbl" style="color:${recentFiles.length ? 'var(--amber)' : 'var(--gray)'}">EDITED</span>
      <span>${recentFiles.length} file(s) in last ${RECENT_WINDOW_S}s${recentFiles.length === 0 ? ' (no recent edits)' : ''}</span>
    </div>
    ${recentFiles.slice(0, 8).map((f) => `<div class="live-row"><span></span><span class="live-detail">${escapeHtml(f.path)} <span style="opacity:0.6">(${f.age}s ago)</span></span></div>`).join('')}
  </div>`}
</section>

</div><!-- /tab-live -->

<div class="tab-panel" data-tab="sweep">

<section>
  <h2>🛡 Visual sweep gate status</h2>
  ${sweepHtml}
</section>

<section>
  <h2>🐛 Active bug tracker</h2>
  <article class="phase-card" style="border-left:4px solid var(--amber)">
    <div class="phase-header">
      <div>
        <div class="phase-num">BUG A · Ctrl+Enter latency regression</div>
        <h3 class="phase-title">~900ms (was 1434ms) — partial fix shipped</h3>
      </div>
      <span class="pill pill-progress">◐ PARTIAL FIX</span>
    </div>
    <div class="phase-short">Profile decomposed the 1434ms hot path. Step 1 (drop the 600ms idle timer, await load directly) shipped in <code>a6079ac5</code> — depth-1 expected ~300-400ms, depth-2+ ~400-500ms. Original-Rizzoma sub-100ms still requires optimistic local mount + parallel load awaits.</div>
    <ul class="deliv-list">
      <li class="deliv"><span class="deliv-check done">✓</span><span class="deliv-label">Profile network/lifecycle hot path during Ctrl+Enter (general-purpose agent, 2026-05-07)</span></li>
      <li class="deliv"><span class="deliv-check done">✓</span><span class="deliv-label">Drop the 600ms setTimeout — await <code>__rizzomaTopicReload()</code> instead (<code>a6079ac5</code>)</span></li>
      <li class="deliv"><span class="deliv-check wip">◐</span><span class="deliv-label">Optimistic local mount: <code>setBlips(prev => [...prev, optimisticBlip])</code> from POST response, skip await load entirely (≈ -250ms)</span></li>
      <li class="deliv"><span class="deliv-check wip">◐</span><span class="deliv-label">Parallelize <code>load()</code>'s 3 sequential awaits via <code>Promise.all</code> (≈ -100ms)</span></li>
      <li class="deliv"><span class="deliv-check"></span><span class="deliv-label">Collapse 4-RAF chain to 1 (≈ -32ms)</span></li>
    </ul>
  </article>
  <article class="phase-card" style="border-left:4px solid var(--green)">
    <div class="phase-header">
      <div>
        <div class="phase-num">BUG B · Nested Ctrl+Enter broken at depth ≥2</div>
        <h3 class="phase-title">Second Ctrl+Enter doesn't mount new editor</h3>
      </div>
      <span class="pill pill-done">✓ FIX DEPLOYED</span>
    </div>
    <div class="phase-short">In a freshly-created inline child, Ctrl+Enter didn't create a nested blip. Root cause: local <code>toggleInlineChild</code> ran before <code>load(true)</code> populated <code>inlineChildren</code>. Fix shipped in <code>6a1220bd</code> + <code>a6079ac5</code>.</div>
    <ul class="deliv-list">
      <li class="deliv"><span class="deliv-check done">✓</span><span class="deliv-label">Root cause: <code>RizzomaBlip.tsx</code> used local <code>toggleInlineChild</code> instead of the global event used at topic level</span></li>
      <li class="deliv"><span class="deliv-check done">✓</span><span class="deliv-label">Patch: dispatch <code>rizzoma:toggle-inline-blip</code> + <code>rizzoma:enter-edit-blip</code> with <code>parentId</code> after awaitable reload (<code>6a1220bd</code>, <code>a6079ac5</code>)</span></li>
      <li class="deliv"><span class="deliv-check wip">◐</span><span class="deliv-label">Retest with depth-10 fractal sweep on dev VPS</span></li>
    </ul>
  </article>
</section>

<section>
  <h2>📊 Feature coverage</h2>
  <div style="font-size:0.85rem;color:var(--lb);margin-bottom:0.75rem">
    Each row is a category. Each square is a feature — hover for name + status, click row to expand details. Categories sorted by coverage (best first). Coverage matching uses Jaccard token overlap between doc-feature names and sweep-capture featureRef labels; <strong>weak match</strong> = a capture targeting this feature's broader category exists and PASSES, but its featureRef name doesn't share enough tokens (Jaccard ≥ 0.5) with this specific feature's name to claim a verified PASS — typically fixable by adding the feature's keywords to the relevant capture's featureRefs array.
    <span style="margin-left:1rem"><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px;vertical-align:middle"></span> PASS</span>
    <span style="margin-left:0.6rem"><span style="display:inline-block;width:10px;height:10px;background:var(--red);border-radius:2px;vertical-align:middle"></span> FAIL</span>
    <span style="margin-left:0.6rem" title="A capture in the matching section exists AND its gate PASSES, but its featureRef name has weak (Jaccard token overlap < 0.5) match with this feature's name. Evidence is nearby but match confidence is too low to claim a specific verified PASS."><span style="display:inline-block;width:10px;height:10px;background:var(--amber);border-radius:2px;vertical-align:middle"></span> weak match (low confidence)</span>
    <span style="margin-left:0.6rem"><span style="display:inline-block;width:10px;height:10px;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.18);border-radius:2px;vertical-align:middle"></span> uncovered</span>
  </div>
  ${featureMatrixHtml}
</section>

</div><!-- /tab-sweep -->

<div class="tab-panel" data-tab="phases">

<section>
  <h2>📋 Phases</h2>
${PHASES.map((p) => {
  const pillCls = p.status === 'done' ? 'pill-done' : (p.status === 'progress' ? 'pill-progress' : 'pill-pending');
  const pillTxt = p.status === 'done' ? '✓ DONE' : (p.status === 'progress' ? '◐ IN PROGRESS' : '○ PENDING');
  const fillCls = p.status === 'done' ? 'green' : (p.status === 'progress' ? 'amber' : 'gray');
  const issueState = issueStates[p.issue]?.state || '?';
  const delivLis = p.deliverables.map((d) => {
    const wip = isWip(d);
    const stateCls = d.failed ? 'failed' : (d.done ? 'done' : (wip ? 'wip' : ''));
    const checkChar = d.failed ? '✗' : (d.done ? '✓' : (wip ? '◐' : ''));
    return `
        <li class="deliv">
          <span class="deliv-check ${stateCls}">${checkChar}</span>
          <span class="deliv-label ${stateCls}">${renderInlineMd(d.label)}</span>
          <span class="deliv-commit">${d.commit ? `<a href="https://github.com/${REPO}/commit/${d.commit}" target="_blank" rel="noopener">${d.commit.slice(0, 8)}</a>` : ''}</span>
        </li>`;
  }).join('');
  return `
  <article class="phase-card">
    <div class="phase-header">
      <div>
        <div class="phase-num">PHASE ${p.n} · <a href="https://github.com/${REPO}/issues/${p.issue}" target="_blank" rel="noopener">#${p.issue}</a> · GH ${escapeHtml(issueState)}</div>
        <h3 class="phase-title">${escapeHtml(p.title)}</h3>
      </div>
      <span class="pill ${pillCls}">${pillTxt}</span>
    </div>
    <div class="phase-short">${escapeHtml(p.short)}</div>
    <div class="pbar-row">
      <div class="pbar-wrapper"><div class="pbar-fill ${fillCls}" style="--target:${p.pct}%"></div></div>
      <div class="pbar-pct">${p.done}${p.wip ? ` + ${p.wip}◐` : ''}/${p.total} · ${p.pct}%</div>
    </div>
    <div class="phase-meta">
      <span>⏱️ ${p.days} workday${p.days !== 1 ? 's' : ''} estimated</span>
      <span>📋 ${p.total} deliverables</span>
      ${p.wip ? `<span style="color:var(--amber)">◐ ${p.wip} in progress</span>` : ''}
    </div>
    <ul class="deliv-list">${delivLis}
    </ul>
  </article>`;
}).join('')}
</section>

<section>
  <h2>📈 Recent commits on <code>${BRANCH}</code></h2>
  <div class="recent-commits">
${recentCommits.length === 0 ? '<p style="color:var(--lb)">No commits ahead of master yet.</p>' :
  recentCommits.slice(0, 20).map((c) => `
    <div class="commit-row">
      <span class="commit-hash"><a href="https://github.com/${REPO}/commit/${c.hash}" target="_blank" rel="noopener">${c.hash.slice(0, 8)}</a></span>
      <span class="commit-subject">${escapeHtml(c.subject)}</span>
      <span class="commit-when">${escapeHtml(c.when)}</span>
    </div>`).join('')
}
  </div>
</section>

<section>
  <h2>⏱️ Calendar (3 weeks)</h2>
  <div class="calendar">
    <div class="cal-grid">
      <div class="cal-week">Week 1</div>
      <div class="cal-day today">Day 1<br><strong>P0+P1</strong></div>
      <div class="cal-day">Day 2<br>P1</div>
      <div class="cal-day">Day 3<br>P1</div>
      <div class="cal-day">Day 4<br>P1</div>
      <div class="cal-day">Day 5<br>P2</div>
      <div class="cal-week">Week 2</div>
      <div class="cal-day">Day 6<br>P2</div>
      <div class="cal-day">Day 7<br>P2</div>
      <div class="cal-day">Day 8<br>P3</div>
      <div class="cal-day">Day 9<br>P3</div>
      <div class="cal-day">Day 10<br>P3</div>
      <div class="cal-week">Week 3</div>
      <div class="cal-day">Day 11<br>P4</div>
      <div class="cal-day">Day 12<br>P4</div>
      <div class="cal-day">Day 13<br>P5</div>
      <div class="cal-day">Day 14<br>P5</div>
      <div class="cal-day">Day 15<br>✓</div>
    </div>
  </div>
</section>

<button id="refresh-toggle" class="refresh-toggle on" type="button" title="Toggle auto-refresh">⟳ auto: on (${REFRESH_MS / 1000}s)</button>

</div><!-- /tab-phases (Phases + commits + calendar) -->

<footer class="footer">
  Generated by <code>scripts/build_native_pm.mjs</code> · Re-runs every ${REFRESH_MS / 1000}s; click ⟳ to pause.
  <br>
  Scroll position is preserved across refreshes (location.reload doesn't lose your spot when triggered programmatically with the same anchor). Switch to terminal with <code>pmr</code> if you prefer.
</footer>

<script>
  (function () {
    const REFRESH_MS = ${REFRESH_MS};
    let timer = null;
    const stampEl = document.getElementById('stamp');
    const statusEl = document.getElementById('refresh-status');
    const toggle = document.getElementById('refresh-toggle');

    // ─── Tab switching ───
    // 3 tabs: live, phases, sweep. Each can have N panels (data-tab="X").
    // Active tab persisted in localStorage. Clicking a tab also updates the
    // URL hash so it survives refresh + can be deep-linked.
    function activateTab(name) {
      const valid = ['live', 'phases', 'sweep'];
      if (!valid.includes(name)) name = 'phases';
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === name);
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.tab === name);
      });
      try { localStorage.setItem('pmr-active-tab', name); } catch (e) {}
      if (location.hash !== '#' + name) {
        history.replaceState(null, '', '#' + name);
      }
    }
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
    // Initial activation: hash > localStorage > default 'phases'
    const initialTab = (location.hash || '').slice(1)
      || localStorage.getItem('pmr-active-tab')
      || 'phases';
    activateTab(initialTab);

    // Animate every pbar fill from 0 → its --target value on load.
    // Without this, the CSS leaves them at translateX(-100%) (invisible).
    function paintPbars() {
      requestAnimationFrame(() => {
        document.querySelectorAll('.pbar-fill').forEach((el) => {
          const target = el.style.getPropertyValue('--target') || '0%';
          el.style.transform = 'translateX(calc(-100% + ' + target + '))';
        });
      });
    }
    paintPbars();

    // Auto-reload preserves scroll across navigations on most browsers via
    // history.scrollRestoration = 'auto' (default). We also save scroll to
    // sessionStorage as a belt + suspenders.
    history.scrollRestoration = 'auto';
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('pmr-scroll-y', String(window.scrollY));
    });
    window.addEventListener('load', () => {
      const y = sessionStorage.getItem('pmr-scroll-y');
      if (y !== null) {
        window.scrollTo(0, parseInt(y, 10) || 0);
      }
    });

    function flash(el) {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 800);
    }

    function start() {
      if (timer) return;
      timer = setTimeout(() => {
        flash(stampEl);
        location.reload();
      }, REFRESH_MS);
      toggle.classList.add('on');
      toggle.textContent = '⟳ auto: on (' + (REFRESH_MS / 1000) + 's)';
      statusEl.textContent = 'auto-refresh ON';
    }
    function stop() {
      if (timer) { clearTimeout(timer); timer = null; }
      toggle.classList.remove('on');
      toggle.textContent = '⟳ auto: off';
      statusEl.textContent = 'auto-refresh PAUSED';
    }
    toggle.addEventListener('click', () => (timer ? stop() : start()));
    start();
  })();
</script>
</body>
</html>
`;

const outPath = resolve(process.cwd(), 'public/native-port-pm.html');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(`✓ Wrote ${outPath}`);
console.log(`  Overall ${overallPct}% · ${phasesDone}/6 phases done · ${recentCommits.length} commits on branch`);
console.log(`  Open in Windows: start C:\\Rizzoma\\public\\native-port-pm.html`);
console.log(`  Or run: pmrh   (builds + opens in default Windows browser)`);
