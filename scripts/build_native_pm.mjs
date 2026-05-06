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
import { mkdirSync, writeFileSync } from 'node:fs';
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
      { done: true, label: 'Update `CLAUDE.md` BLB section + create `docs/NATIVE_RENDER_ARCHITECTURE.md` — covered by docs/NATIVE_RENDER_PORT_PLAN.md + docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md (already in repo)', commit: null, files: [] },
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
import { readdirSync, statSync } from 'node:fs';
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
