#!/usr/bin/env node
/**
 * Build a single-file, self-contained HTML PM dashboard for the native
 * fractal-render port. Pulls GH issue state + git log; writes
 * public/native-port-pm.html.
 *
 * Run via: node scripts/build_native_pm.mjs
 *
 * Output: public/native-port-pm.html — open as file://, or via dev VPS at
 *         https://dev.138-201-62-161.nip.io/native-port-pm.html
 *
 * Design goals:
 *   - Single static HTML file (no fetches at runtime → no glitches)
 *   - Inline CSS + JS, dark theme, animated pbars on load
 *   - Click commits → GitHub diff. Click issue # → GitHub issue.
 *   - Regenerate after every commit on feature/native-fractal-port.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO = 'HCSS-StratBase/rizzoma';
const BRANCH = 'feature/native-fractal-port';
const ISSUE_NUMBERS = [50, 51, 52, 53, 54, 55, 56];

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim();

// ─── Phase definitions (the source of truth for the dashboard) ───
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
      { done: true, label: 'vitest tests — 8/8 passing (parser smoke)', commit: 'b06d4d30' },
      { done: false, label: '`serializer.ts` — ContentArray → HTML (round-trip inverse)', commit: null },
      { done: false, label: 'Spike harness HTML page rendering depth-10 fractal from JSON fixture', commit: null },
      { done: false, label: 'Pixel-match against `screenshots/260505-rizzoma-com-vs-mine/16-rizzoma-com-depth10_old-260505.png`', commit: null },
      { done: false, label: 'Round-trip parser tests on every dev-DB topic (no data loss)', commit: null },
    ],
  },
  {
    n: 2, key: 'blipview', issue: 53, days: 4,
    title: 'BlipView lifecycle + TipTap edit-mode + Ctrl+Enter',
    short: 'Per-blip view class; mounts TipTap into its DOM slot when isEditing; Ctrl+Enter inserts BLIP at array index',
    deliverables: [
      { done: false, label: '`blip-view.ts` (~600 LOC) — port of `blip/view.coffee`', commit: null },
      { done: false, label: '`blip-editor-host.ts` — mount/unmount TipTap into BlipView slot', commit: null },
      { done: false, label: '`wave-view.ts` — port of `wave/view.coffee`', commit: null },
      { done: false, label: '`NativeWaveView.tsx` — thin React wrapper behind feature flag', commit: null },
      { done: false, label: '`RizzomaTopicDetail.tsx` side-by-side toggle (no demolition)', commit: null },
      { done: false, label: 'Ctrl+Enter handler — insert BLIP at cursor array-index', commit: null },
      { done: false, label: 'sanity sweep + state-survives-collapse pass on `?render=native`', commit: null },
      { done: false, label: 'Nested Ctrl+Enter renders new child INLINE at cursor (the bug from `cc7caf4b`)', commit: null },
    ],
  },
  {
    n: 3, key: 'collab', issue: 54, days: 3,
    title: 'Y.js collab + cross-tab sync + live cursors',
    short: '`Y.Array<Y.Map>` over ContentArray; per-blip TipTap keeps Y.XmlFragment',
    deliverables: [
      { done: false, label: '`yjs-binding.ts` — Y.Array<Y.Map> binding for ContentArray', commit: null },
      { done: false, label: 'Per-blip TipTap keeps existing Y.XmlFragment + Collaboration extension', commit: null },
      { done: false, label: 'Awareness (presence + cursor color) per-blip editor', commit: null },
      { done: false, label: 'Vitest Y.js convergence test (two Y.Doc instances through op sequences)', commit: null },
      { done: false, label: 'Two-tab cross-sync within 1 second', commit: null },
      { done: false, label: 'Real-time cursor visible in editing blip', commit: null },
    ],
  },
  {
    n: 4, key: 'aux', issue: 55, days: 2,
    title: 'Auxiliary feature wiring',
    short: 'Playback, history, mentions, comments, follow-the-green, etc. — most are 0–2hr wiring',
    deliverables: [
      { done: false, label: 'Wave-level playback (`WavePlaybackModal.tsx`) wired into native render', commit: null },
      { done: false, label: 'Per-blip history modal button in BlipView gear menu', commit: null },
      { done: false, label: 'Mentions / hashtags / tasks (per-blip TipTap extensions)', commit: null },
      { done: false, label: 'Inline comments anchor migration', commit: null },
      { done: false, label: 'Code blocks / gadgets (per-blip extensions)', commit: null },
      { done: false, label: 'Follow-the-Green / unread state', commit: null },
      { done: false, label: 'Mobile gestures (swipe, pull-to-refresh)', commit: null },
      { done: false, label: 'Visual feature sweep (161-row matrix) green', commit: null },
    ],
  },
  {
    n: 5, key: 'cutover', issue: 56, days: 2,
    title: 'Cut over + 24-hour soak + cleanup commit',
    short: 'Set flag on dev VPS; soak; delete React-portal layer (~3,500 LOC removed)',
    deliverables: [
      { done: false, label: 'Set `FEAT_RIZZOMA_NATIVE_RENDER=1` on dev VPS', commit: null },
      { done: false, label: 'Full sanity sweep + state-survives-collapse + visual-feature-sweep all green', commit: null },
      { done: false, label: 'Side-by-side comparison with rizzoma.com depth-10 reference', commit: null },
      { done: false, label: '24-hour soak window — zero blocking bugs reported', commit: null },
      { done: false, label: 'Delete `RizzomaBlip.tsx` (~2,200 LOC)', commit: null },
      { done: false, label: 'Delete `InlineHtmlRenderer.tsx` (~280 LOC)', commit: null },
      { done: false, label: 'Delete `inlineMarkers.ts` (~125 LOC)', commit: null },
      { done: false, label: 'Delete `BlipThreadNode.tsx` (~150 LOC)', commit: null },
      { done: false, label: 'Trim `RizzomaTopicDetail.tsx` (~600 LOC)', commit: null },
      { done: false, label: 'Drop both feature flags; native is the only path', commit: null },
      { done: false, label: 'Update `CLAUDE.md` BLB section + create `docs/NATIVE_RENDER_ARCHITECTURE.md`', commit: null },
    ],
  },
];

// ─── Pull live GH issue states ───
const issueStates = {};
for (const n of ISSUE_NUMBERS) {
  try {
    const json = sh(`gh issue view ${n} --repo ${REPO} --json state,title`);
    const parsed = JSON.parse(json);
    issueStates[n] = parsed;
  } catch {
    issueStates[n] = { state: 'UNKNOWN', title: '?' };
  }
}

// ─── Recent commits on the port branch ───
let recentCommits = [];
try {
  // Git emits `\x1f` as the literal 4-char string (not the 0x1f byte) — split on the literal.
  const log = sh(`git log ${BRANCH} --not origin/feature/rizzoma-core-features '--pretty=format:%H\\x1f%s\\x1f%ar'`);
  recentCommits = log.split('\n').filter(Boolean).map((line) => {
    const [hash, subject, when] = line.split('\\x1f');
    return { hash, subject, when };
  });
} catch {}

// ─── Per-phase progress + overall ───
for (const p of PHASES) {
  const total = p.deliverables.length;
  const done = p.deliverables.filter((d) => d.done).length;
  p.pct = Math.round((done / total) * 100);
  p.done = done;
  p.total = total;
  if (p.pct === 100) p.status = 'done';
  else if (p.pct === 0) p.status = 'pending';
  else p.status = 'progress';
}
const totalDays = PHASES.reduce((a, p) => a + p.days, 0);
const completedDays = PHASES.reduce((a, p) => a + (p.days * p.pct) / 100, 0);
const overallPct = Math.round((completedDays / totalDays) * 100);

const now = new Date();
const stampHuman = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

// ─── HTML generation ───
const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const renderInlineMd = (s) =>
  escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>');

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
  .subtitle { color: var(--lb); font-size: 0.95rem; margin-bottom: 24px; }
  .meta { font-size: 0.78rem; color: var(--lb); margin-top: 8px; }
  .meta a { color: var(--lb); border-bottom: 1px dotted var(--lb); }
  .grid-overall {
    display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px;
    margin: 16px 0 32px;
  }
  .stat-card {
    background: var(--bg-card); border-radius: 8px; padding: 16px;
    border: 1px solid var(--border);
  }
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
  .pbar-fill.gray { background: var(--gray); }
  .pbar-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; margin: 12px 0; }
  .pbar-pct { font-variant-numeric: tabular-nums; font-weight: 700; min-width: 50px; text-align: right; }
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
  .deliv-check.done {
    background: rgba(76,175,131,0.2); border-color: var(--green); color: var(--green);
  }
  .deliv-label { color: var(--wh); }
  .deliv-label.done { color: var(--lb); }
  .deliv-commit a { font-family: ui-monospace, monospace; font-size: 0.78rem; color: var(--gold); padding: 2px 6px; background: rgba(219,173,80,0.1); border-radius: 4px; }
  .recent-commits { background: var(--bg-card); border-radius: 12px; padding: 20px 22px; margin-bottom: 24px; border: 1px solid var(--border); }
  .commit-row { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border); font-size: 0.85rem; }
  .commit-row:first-child { border-top: none; padding-top: 4px; }
  .commit-hash a { font-family: ui-monospace, monospace; color: var(--gold); }
  .commit-when { color: var(--lb); font-size: 0.78rem; white-space: nowrap; }
  .calendar { background: var(--bg-card); border-radius: 12px; padding: 20px 22px; margin-bottom: 24px; border: 1px solid var(--border); overflow-x: auto; }
  .cal-grid { display: grid; grid-template-columns: 60px repeat(5, 1fr); gap: 8px; min-width: 700px; font-size: 0.85rem; }
  .cal-week { color: var(--lb); font-weight: 600; align-self: center; }
  .cal-day { background: var(--bg-elev); padding: 12px; border-radius: 6px; text-align: center; border: 1px solid var(--border); font-size: 0.78rem; }
  .cal-day.done { border-color: var(--green); color: var(--green); background: rgba(76,175,131,0.08); }
  .cal-day.progress { border-color: var(--amber); color: var(--amber); background: rgba(224,168,0,0.08); }
  .cal-day.today { box-shadow: 0 0 0 2px var(--gold) inset; }
  .footer { margin-top: 40px; color: var(--lb); font-size: 0.82rem; text-align: center; padding: 16px; border-top: 1px solid var(--border); }
  .ext { font-size: 0.7rem; color: var(--lb); text-decoration: none; padding-left: 4px; }
  .stamp { display: inline-block; padding: 4px 10px; background: rgba(76,175,131,0.15); color: var(--green); border-radius: 4px; font-size: 0.78rem; font-variant-numeric: tabular-nums; }
  @media (max-width: 720px) {
    .grid-overall { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body>

<header>
  <h1>🚀 Native Fractal-Render Port</h1>
  <p class="subtitle">
    Live PM tracker. Replace React/TipTap hybrid with direct TS port of
    original Rizzoma's content-array + linear-walk model.
    <a href="https://github.com/${REPO}/blob/${BRANCH}/docs/NATIVE_RENDER_PORT_PLAN.md">Plan</a> ·
    <a href="https://github.com/${REPO}/blob/${BRANCH}/docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md">Why</a> ·
    <a href="https://github.com/${REPO}/issues/50">Epic #50</a>
  </p>
  <p class="meta">Snapshot: <span class="stamp">${stampHuman}</span> · regenerate: <code>node scripts/build_native_pm.mjs</code></p>
</header>

<section>
  <h2>🎯 Overall</h2>
  <div class="grid-overall">
    <div class="stat-card">
      <div class="stat-num">${overallPct}%</div>
      <div class="stat-lbl">Complete</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${completedDays.toFixed(1)}<span style="font-size: 1rem; color: var(--lb)"> / ${totalDays}</span></div>
      <div class="stat-lbl">Workdays</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${PHASES.filter((p) => p.status === 'done').length}<span style="font-size: 1rem; color: var(--lb)"> / 6</span></div>
      <div class="stat-lbl">Phases done</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${recentCommits.length}</div>
      <div class="stat-lbl">Commits on port branch</div>
    </div>
  </div>
  <div class="pbar-row">
    <div class="pbar-wrapper"><div class="pbar-fill" style="--target: ${overallPct}%"></div></div>
    <div class="pbar-pct">${overallPct}%</div>
  </div>
</section>

<section>
  <h2>📋 Phases</h2>
${PHASES.map((p) => {
  const issueState = issueStates[p.issue]?.state || '?';
  const pillCls = p.status === 'done' ? 'pill-done' : (p.status === 'progress' ? 'pill-progress' : 'pill-pending');
  const pillTxt = p.status === 'done' ? '✓ DONE' : (p.status === 'progress' ? '◐ IN PROGRESS' : '○ PENDING');
  const fillCls = p.status === 'done' ? 'green' : (p.status === 'progress' ? 'amber' : 'gray');
  const delivLis = p.deliverables.map((d) => `
        <li class="deliv">
          <span class="deliv-check${d.done ? ' done' : ''}">${d.done ? '✓' : ''}</span>
          <span class="deliv-label${d.done ? ' done' : ''}">${renderInlineMd(d.label)}</span>
          <span class="deliv-commit">${d.commit ? `<a href="https://github.com/${REPO}/commit/${d.commit}" target="_blank" rel="noopener">${d.commit.slice(0, 8)}</a>` : ''}</span>
        </li>`).join('');
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
      <div class="pbar-wrapper"><div class="pbar-fill ${fillCls}" style="--target: ${p.pct}%"></div></div>
      <div class="pbar-pct">${p.done}/${p.total} · ${p.pct}%</div>
    </div>
    <div class="phase-meta">
      <span>⏱️ ${p.days} workday${p.days !== 1 ? 's' : ''} estimated</span>
      <span>📋 ${p.total} deliverables</span>
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
  recentCommits.slice(0, 15).map((c) => `
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
      <div class="cal-day done today">Day 1<br><strong>P0+P1</strong></div>
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

<footer class="footer">
  Generated by <code>scripts/build_native_pm.mjs</code> from live <code>gh issue view</code> + <code>git log</code> data.
  Single static file, no runtime fetches → no glitches.
  <br>
  <a href="https://github.com/${REPO}/blob/${BRANCH}/docs/NATIVE_PORT_PM.md">Markdown version</a> ·
  <a href="https://github.com/${REPO}/labels/native-port">All native-port issues</a> ·
  <a href="https://github.com/${REPO}/tree/${BRANCH}/src/client/native">Source dir <code>src/client/native/</code></a>
</footer>

<script>
  // Animate pbars from 0 → target on load.
  document.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(() => {
      document.querySelectorAll('.pbar-fill').forEach((el) => {
        const target = el.style.getPropertyValue('--target') || '0%';
        el.style.transform = 'translateX(calc(-100% + ' + target + '))';
      });
    });
  });
</script>
</body>
</html>
`;

const outPath = resolve(process.cwd(), 'public/native-port-pm.html');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html);
console.log(`✓ Wrote ${outPath}`);
console.log(`  Overall ${overallPct}% · ${PHASES.filter((p) => p.status === 'done').length}/6 phases done · ${recentCommits.length} commits on branch`);
console.log(`  Open: file://${outPath}`);
console.log(`  Or:   https://dev.138-201-62-161.nip.io/native-port-pm.html (after deploy)`);
