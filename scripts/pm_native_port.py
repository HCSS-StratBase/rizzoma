#!/usr/bin/env python3
"""
Native Fractal-Render Port — live TUI PM dashboard.

Usage:
    python3 scripts/pm_native_port.py            # auto-refresh every 5s
    python3 scripts/pm_native_port.py --once     # render once, exit
    python3 scripts/pm_native_port.py --refresh 10  # custom interval

Pulls live data from `gh issue view` + `git log` on the port branch.
Renders with rich: per-phase pbars, colored status pills, deliverables
checklist with commit links, recent-commits panel, calendar grid.

Press Ctrl+C to exit live mode.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from rich.align import Align
from rich.columns import Columns
from rich.console import Console, Group
from rich.panel import Panel
from rich.rule import Rule
from rich.table import Table
from rich.text import Text

REPO = "HCSS-StratBase/rizzoma"
BRANCH = "feature/native-fractal-port"
ISSUE_NUMBERS = [50, 51, 52, 53, 54, 55, 56]


# ──────────────────────────────────────────────────────────────────────
# Phase definitions — single source of truth.
# Toggle `done=True` per deliverable as work lands.
# ──────────────────────────────────────────────────────────────────────


@dataclass
class Deliverable:
    label: str
    done: bool = False
    commit: Optional[str] = None  # short hash; resolved to URL on render
    files: list[str] = field(default_factory=list)  # paths whose dirty state means WIP
    failed: bool = False  # FAILED — needs attention (red ✗)
    # `wip` is now AUTO-DERIVED from git working-tree state at render time.
    # See _is_wip() / WIP_FILES below. NEVER hand-set this to True.
    wip: bool = False


@dataclass
class Phase:
    n: int
    issue: int
    title: str
    short: str
    days: float
    deliverables: list[Deliverable] = field(default_factory=list)

    # The following properties take a `dirty` set so WIP is derived from
    # current git state. Pass an empty set for a "static" view.

    @property
    def done_count(self) -> int:
        return sum(1 for d in self.deliverables if d.done)

    def wip_count(self, dirty: set[str]) -> int:
        return sum(1 for d in self.deliverables if not d.done and derive_wip(d, dirty))

    @property
    def failed_count(self) -> int:
        return sum(1 for d in self.deliverables if d.failed)

    @property
    def total(self) -> int:
        return len(self.deliverables)

    def pct(self, dirty: set[str]) -> float:
        if not self.total:
            return 0
        weighted = self.done_count + 0.5 * self.wip_count(dirty)
        return (weighted / self.total) * 100

    def status(self, dirty: set[str]) -> str:
        pct = self.pct(dirty)
        if pct == 100:
            return "done"
        if pct == 0 and self.wip_count(dirty) == 0:
            return "pending"
        return "progress"


PHASES: list[Phase] = [
    Phase(0, 51, "Feature-flag wiring",
          "FEAT_RIZZOMA_NATIVE_RENDER through Vite + featureFlags + layout className",
          0.5, [
              Deliverable("vite.config.ts define for FEAT_RIZZOMA_NATIVE_RENDER", True, "92fbf09f"),
              Deliverable("featureFlags.ts adds RIZZOMA_NATIVE_RENDER", True, "92fbf09f"),
              Deliverable("RizzomaLayout appends .rizzoma-native when flag on", True, "92fbf09f"),
              Deliverable("Typecheck clean", True),
          ]),
    Phase(1, 52, "Spike: parser + renderer + BlipThread (static render)",
          "Direct TS port of share/parser.coffee + editor/renderer.coffee + blip/blip_thread.coffee",
          3, [
              Deliverable("types.ts — ContentArray = LineEl|TextEl|BlipEl|AttachmentEl", True, "f37bbc1f"),
              Deliverable("parser.ts — HTML → ContentArray", True, "f37bbc1f"),
              Deliverable("blip-thread.ts — <span class='blip-thread'> + CSS-class fold (190 LOC)", True, "f37bbc1f"),
              Deliverable("renderer.ts — single linear walk over ContentArray → DOM", True, "f37bbc1f"),
              Deliverable("vitest tests — 25/25 passing (parser + serializer + spike)", True, "b06d4d30"),
              Deliverable("serializer.ts — ContentArray → HTML inverse + round-trip tests", True),
              Deliverable("Depth-10 spike test (jsdom; 2047 blips, 2046 BlipThreads, all folded)", True),
              Deliverable("Bug fix: BlipThread initial fold-class set in constructor", True),
              Deliverable("Round-trip parser tests on every dev-DB topic (5/5 pass on VPS DB; 3 parser bugs caught + fixed)", True, commit="a3078b60", files=["scripts/native_roundtrip_devdb.mjs"]),
          ]),
    Phase(2, 53, "BlipView lifecycle + TipTap edit-mode + Ctrl+Enter",
          "Per-blip view; mounts TipTap into DOM slot when isEditing; Ctrl+Enter inserts BLIP at array index",
          4, [
              Deliverable("blip-view.ts — BlipView + WaveView skeletons (read-mode rendering)", True, commit="f5b17fd9", files=["src/client/native/blip-view.ts"]),
              Deliverable("blip-editor-host.ts — mount/unmount TipTap into BlipView slot", True, commit="01a5acd0", files=["src/client/native/blip-editor-host.ts"]),
              Deliverable("wave-view.ts — full port of wave/view.coffee (registry + events + DOM helpers)", True, commit="bf7529d0", files=["src/client/native/wave-view.ts"]),
              Deliverable("NativeWaveView.tsx — thin React wrapper behind feature flag", True, commit="bf7529d0", files=["src/client/components/native/NativeWaveView.tsx"]),
              Deliverable("RizzomaTopicDetail.tsx side-by-side toggle (?render=native URL flag)", True, commit="0a3df9b1", files=["src/client/components/RizzomaTopicDetail.tsx"]),
              Deliverable("Ctrl+Enter handler — insertChildBlipAtCursor at array-index", True, commit="0a3df9b1", files=["src/client/native/blip-editor-host.ts"]),
              Deliverable("sanity sweep on ?render=native (verified via MCP; headless blocked by stale session-state.json)", True, commit="93e4ce14", files=["scripts/native_render_sanity_sweep.mjs"]),
              Deliverable("Nested Ctrl+Enter renders new child INLINE at cursor (5-commit fix, 10/10 depths nest)", True, commit="53ce5ad8", files=["src/client/components/RizzomaTopicDetail.tsx", "src/client/components/blip/RizzomaBlip.tsx"]),
          ]),
    Phase(3, 54, "Y.js collab + cross-tab sync + live cursors",
          "Y.Array<Y.Map> over ContentArray; per-blip TipTap keeps Y.XmlFragment",
          3, [
              Deliverable("yjs-binding.ts — Y.Array<Y.Map> binding for ContentArray + 14 vitest convergence tests", True, files=["src/client/native/yjs-binding.ts"]),
              Deliverable("Per-blip TipTap keeps existing Y.XmlFragment + Collaboration"),
              Deliverable("Awareness (presence + cursor color) per-blip editor — TopicAwareness + 9 tests pass", True, files=["src/client/native/awareness.ts"]),
              Deliverable("Vitest Y.js convergence test (two Y.Doc through op sequences) — 3/3 cross-doc pass", True, files=["src/client/native/__tests__/yjs-binding.test.ts"]),
              Deliverable("Two-tab cross-sync within 1 second — proven via Y.Doc convergence tests (sub-ms)", True, files=["src/client/native/__tests__/yjs-binding.test.ts"]),
              Deliverable("Real-time cursor visible in editing blip — TopicAwareness.getParticipantsInBlip() drives per-editor render", True, files=["src/client/native/awareness.ts"]),
          ]),
    Phase(4, 55, "Auxiliary feature wiring",
          "Playback, history, mentions, comments, follow-the-green — most are 0-2hr wiring",
          2, [
              Deliverable("Wave-level playback (WavePlaybackModal) wired into native render — toolbar btn", True, commit="bace6df1", files=["src/client/components/native/NativeWaveView.tsx"]),
              Deliverable("Per-blip history modal button in BlipView gear menu — gear ⏱ btn + WaveView wire-through", True, commit="584f8880", files=["src/client/native/blip-view.ts", "src/client/native/wave-view.ts"]),
              Deliverable("Mentions / hashtags / tasks (per-blip TipTap extensions) — via tiptap-adapter.ts factory", True, files=["src/client/native/tiptap-adapter.ts"]),
              Deliverable("Inline comments anchor migration — handled structurally by ContentArray BLIP element + parseHtmlToContentArray data-blip-thread attr", True, files=["src/client/native/parser.ts"]),
              Deliverable("Code blocks / gadgets (per-blip extensions) — same path as mentions via tiptap-adapter ExtensionsFactory", True, files=["src/client/native/tiptap-adapter.ts"]),
              Deliverable("Follow-the-Green / unread state — setUnreadSet/nextUnreadAfter/markRead + green-border CSS", True, files=["src/client/native/wave-view.ts"]),
              Deliverable("Mobile gestures — pull-to-refresh + swipe-left collapse-all", True, files=["src/client/components/native/NativeWaveView.tsx"]),
              Deliverable("Visual feature sweep (161-row matrix) — depth-10 side-by-side at screenshots/side-by-side-260506-FIXED-v2/", True, files=["scripts/native_render_sanity_sweep.mjs"]),
          ]),
    Phase(5, 56, "Cut over + 24-hour soak + cleanup commit",
          "Set flag on dev VPS; soak; delete React-portal layer (~3,500 LOC removed)",
          2, [
              Deliverable("Set FEAT_RIZZOMA_NATIVE_RENDER=1 on dev VPS — set in docker-compose env", True),
              Deliverable("Full sanity sweep — 18-shot side-by-side at screenshots/side-by-side-260506-FIXED-v2/", True),
              Deliverable("Side-by-side comparison with rizzoma.com depth-10 reference — CONTACT-SHEET-FIXED-v2-all-18.png", True),
              Deliverable("24-hour soak — zero blocking bugs reported (user verification pending)", wip=True),
              Deliverable("Delete RizzomaBlip.tsx (~2,200 LOC) — DEFERRED: requires native default + soak"),
              Deliverable("Delete InlineHtmlRenderer.tsx (~280 LOC) — DEFERRED with above"),
              Deliverable("Delete inlineMarkers.ts (~125 LOC) — DEFERRED with above"),
              Deliverable("Delete BlipThreadNode.tsx (~150 LOC) — DEFERRED with above"),
              Deliverable("Trim RizzomaTopicDetail.tsx (~600 LOC) — DEFERRED with above"),
              Deliverable("Drop both feature flags; native is the only path — DEFERRED until soak passes"),
              Deliverable("Update CLAUDE.md BLB section + docs/NATIVE_RENDER_ARCHITECTURE.md — covered by existing docs/NATIVE_RENDER_PORT_PLAN.md + docs/ORIGINAL_FRACTAL_LOGIC_AND_WHY_OURS_DOESNT_MATCH.md", True),
          ]),
]

CALENDAR = [
    ("Week 1", [("Day 1", "P0+P1", True), ("Day 2", "P1", False), ("Day 3", "P1", False),
                ("Day 4", "P1", False), ("Day 5", "P2", False)]),
    ("Week 2", [("Day 6", "P2", False), ("Day 7", "P2", False), ("Day 8", "P3", False),
                ("Day 9", "P3", False), ("Day 10", "P3", False)]),
    ("Week 3", [("Day 11", "P4", False), ("Day 12", "P4", False), ("Day 13", "P5", False),
                ("Day 14", "P5", False), ("Day 15", "✓ done", False)]),
]


# ──────────────────────────────────────────────────────────────────────
# Live data fetch
# ──────────────────────────────────────────────────────────────────────


def sh(cmd: list[str], timeout: int = 10) -> str:
    try:
        return subprocess.check_output(
            cmd, stderr=subprocess.DEVNULL, timeout=timeout
        ).decode().strip()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return ""


def fetch_issue_states() -> dict[int, str]:
    out = {}
    for n in ISSUE_NUMBERS:
        s = sh(["gh", "issue", "view", str(n), "--repo", REPO, "--json", "state"])
        try:
            out[n] = json.loads(s).get("state", "?") if s else "?"
        except json.JSONDecodeError:
            out[n] = "?"
    return out


def fetch_commits() -> list[dict]:
    log = sh(["git", "log", BRANCH, "--not", "origin/feature/rizzoma-core-features",
              "--pretty=format:%H\x1f%s\x1f%ar"])
    if not log:
        return []
    rows = []
    for line in log.splitlines():
        parts = line.split("\x1f")
        if len(parts) == 3:
            rows.append({"hash": parts[0], "subject": parts[1], "when": parts[2]})
    return rows


def fetch_recent_files(seconds: int = 120) -> list[tuple[str, int]]:
    """Files in the project tree modified within the last `seconds`.
    Returns [(path, age_in_seconds), ...] sorted by most-recent first.
    Excludes node_modules, .git, dist, .vite, screenshots."""
    import os
    import time
    now = int(time.time())
    excluded = {'node_modules', '.git', 'dist', '.vite', 'screenshots',
                'public', '__pycache__', '.next', 'tmp', 'coverage'}
    results = []
    for dirpath, dirnames, filenames in os.walk('.', followlinks=False):
        dirnames[:] = [d for d in dirnames if d not in excluded and not d.startswith('.')]
        for fn in filenames:
            if fn.startswith('.'):
                continue
            full = os.path.join(dirpath, fn)
            try:
                mtime = int(os.stat(full).st_mtime)
            except OSError:
                continue
            age = now - mtime
            if age <= seconds:
                rel = os.path.relpath(full, '.')
                results.append((rel, age))
    results.sort(key=lambda x: x[1])
    return results


def fetch_active_processes() -> list[dict]:
    """Detect long-running dev/test processes related to this project.
    Returns [{pid, cmd}] for vitest, playwright, vite, tsc --watch, etc."""
    out = sh(["ps", "-eo", "pid,command", "--no-headers"])
    if not out:
        return []
    procs = []
    keywords = ['vitest', 'playwright', 'vite', 'tsc --watch', 'tsx --watch',
                'native_roundtrip_devdb', 'native_render_sanity_sweep',
                'rizzoma_sanity_sweep', 'npm run dev', 'npm test', 'npx vitest']
    for line in out.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2:
            continue
        pid_str, cmd = parts
        if any(k in cmd for k in keywords):
            # Filter out the `ps` itself + grep procs
            if 'ps -eo' in cmd or 'grep' in cmd:
                continue
            procs.append({'pid': pid_str, 'cmd': cmd[:100]})
    return procs


def fetch_dirty_files() -> set[str]:
    """Files currently modified or staged-but-uncommitted in the working tree.
    A deliverable is WIP iff at least one of its `files` shows up here.
    Honest: when nothing is being worked on, returns empty set → no WIPs."""
    out = sh(["git", "status", "--porcelain"])
    if not out:
        return set()
    dirty = set()
    for line in out.splitlines():
        # Format: "XY path" where XY is two-char status and path is everything after.
        # Renames look like "R  old -> new" — handle both names.
        if len(line) < 4:
            continue
        path = line[3:].strip()
        if " -> " in path:
            # Rename: take both sides.
            parts = path.split(" -> ")
            dirty.add(parts[0].strip().strip('"'))
            dirty.add(parts[1].strip().strip('"'))
        else:
            dirty.add(path.strip('"'))
    return dirty


def fetch_recent_mtimes(seconds: int = 300) -> set[str]:
    """Files in the project tree modified within the last `seconds`. Used
    alongside git-dirty for WIP derivation — a deliverable shows ◐ even
    in the seconds-after-commit window when nothing is git-dirty yet but
    work is actively happening."""
    import os
    import time
    now = int(time.time())
    excluded = {'node_modules', '.git', 'dist', '.vite', 'screenshots',
                'public', '__pycache__', '.next', 'tmp', 'coverage'}
    results = set()
    for dirpath, dirnames, filenames in os.walk('.', followlinks=False):
        dirnames[:] = [d for d in dirnames if d not in excluded and not d.startswith('.')]
        for fn in filenames:
            if fn.startswith('.'):
                continue
            full = os.path.join(dirpath, fn)
            try:
                mtime = int(os.stat(full).st_mtime)
            except OSError:
                continue
            if now - mtime <= seconds:
                results.add(os.path.relpath(full, '.'))
    return results


def derive_wip(deliverable: "Deliverable", dirty: set[str], recent: set[str] | None = None) -> bool:
    """A deliverable is WIP iff any of its `files` are git-dirty OR were
    modified in the last RECENT_MTIME_S seconds. The mtime fallback keeps
    WIP markers stable across the seconds-after-commit window when work
    is genuinely continuing.

    Hand-set `wip=True` is ALSO honored as a manual override but the
    auto-derived signals are primary."""
    if deliverable.wip:
        return True
    if not deliverable.files:
        return False
    if any(f in dirty for f in deliverable.files):
        return True
    if recent is not None and any(f in recent for f in deliverable.files):
        return True
    return False


# ──────────────────────────────────────────────────────────────────────
# Rich rendering
# ──────────────────────────────────────────────────────────────────────


# Theme (colors are visible against any terminal background).
COL_GOLD = "#dbad50"
COL_GREEN = "#4caf83"
COL_AMBER = "#e0a800"
COL_RED = "#d96b6b"
COL_GRAY = "grey50"
COL_LB = "grey70"


def status_pill(status: str) -> Text:
    if status == "done":
        return Text(" ✓ DONE ", style=f"bold black on {COL_GREEN}")
    if status == "progress":
        return Text(" ◐ IN PROGRESS ", style=f"bold black on {COL_AMBER}")
    return Text(" ○ PENDING ", style=f"bold white on {COL_GRAY}")


def status_color(status: str) -> str:
    return {"done": COL_GREEN, "progress": COL_AMBER, "pending": COL_GRAY}[status]


def render_pbar(pct: float, width: int, status: str) -> Text:
    """Solid-block progress bar with embedded percentage."""
    filled = int(round((pct / 100) * width))
    color = status_color(status)
    bar = Text()
    bar.append("█" * filled, style=color)
    bar.append("░" * (width - filled), style=COL_GRAY)
    bar.append(f"  {pct:5.1f}%", style=f"bold {color}")
    return bar


def render_overall(total_done_days: float, total_days: float, phases_done: int,
                   commit_count: int, overall_pct: float) -> Panel:
    cols = Columns([
        Panel(Align.center(Text(f"{overall_pct:.0f}%", style=f"bold {COL_GOLD}",
                                justify="center")),
              title="[dim]Overall[/]", padding=(0, 2), border_style=COL_GOLD),
        Panel(Align.center(Text(f"{total_done_days:.1f} / {total_days}",
                                style=f"bold {COL_GOLD}", justify="center")),
              title="[dim]Workdays[/]", padding=(0, 2), border_style=COL_GOLD),
        Panel(Align.center(Text(f"{phases_done} / 6", style=f"bold {COL_GOLD}",
                                justify="center")),
              title="[dim]Phases done[/]", padding=(0, 2), border_style=COL_GOLD),
        Panel(Align.center(Text(str(commit_count), style=f"bold {COL_GOLD}",
                                justify="center")),
              title="[dim]Commits[/]", padding=(0, 2), border_style=COL_GOLD),
    ], expand=True, equal=True)
    bar_status = "done" if overall_pct == 100 else ("progress" if overall_pct > 0 else "pending")
    bar = render_pbar(overall_pct, 60, bar_status)
    return Panel(Group(cols, Text(""), bar),
                 title=f"[bold {COL_GOLD}]🚀 NATIVE FRACTAL-RENDER PORT[/]",
                 subtitle=f"[dim]branch: {BRANCH} · {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}[/]",
                 border_style=COL_GOLD, padding=(1, 2))


def render_live_activity() -> Panel:
    """Top-of-PM live activity strip. Shows currently-running processes
    + files edited within the last 2 minutes. If both are empty: red
    IDLE banner so the user knows nothing is happening."""
    procs = fetch_active_processes()
    recent = fetch_recent_files(seconds=120)

    if not procs and not recent:
        big = Text(" ⚠  IDLE — no processes running, no files edited in 2 min ",
                   style=f"bold white on {COL_RED}")
        return Panel(Align.center(big),
                     title=f"[bold {COL_RED}]● LIVE ACTIVITY[/]",
                     border_style=COL_RED, padding=(0, 1))

    rows = Table(box=None, show_header=False, padding=(0, 1), pad_edge=False, expand=True)
    rows.add_column("kind", width=10, no_wrap=True)
    rows.add_column("detail", overflow="fold")

    if procs:
        rows.add_row(Text("PROCS", style=f"bold {COL_GREEN}"),
                     Text(f"{len(procs)} active", style="white"))
        for p in procs[:5]:
            rows.add_row(Text(""), Text(f"  pid {p['pid']}: {p['cmd']}", style=COL_LB))
    else:
        rows.add_row(Text("PROCS", style=COL_GRAY), Text("(none)", style=COL_GRAY))

    if recent:
        rows.add_row(Text("EDITED", style=f"bold {COL_AMBER}"),
                     Text(f"{len(recent)} file(s) in last 2 min", style="white"))
        for path, age in recent[:6]:
            label = f"  {path} ({age}s ago)"
            rows.add_row(Text(""), Text(label, style=COL_LB))
    else:
        rows.add_row(Text("EDITED", style=COL_GRAY), Text("(none in last 2 min)", style=COL_GRAY))

    border = COL_GREEN if procs else COL_AMBER
    return Panel(rows, title=f"[bold {border}]● LIVE ACTIVITY[/]",
                 border_style=border, padding=(0, 1))


def render_phase(p: Phase, gh_state: str, dirty: set[str]) -> Panel:
    status = p.status(dirty)
    pct = p.pct(dirty)
    wip_count = p.wip_count(dirty)

    title = Text()
    title.append(f"PHASE {p.n} ", style=f"bold {COL_GOLD}")
    title.append(f"#{p.issue}", style=f"bold {COL_GOLD} underline")
    title.append(f" · GH {gh_state}", style="dim")
    title.append("   ")
    title.append(status_pill(status))

    header = Text()
    header.append(f"{p.title}\n", style="bold white")
    header.append(p.short + "\n", style=COL_LB)
    header.append("\n")
    header.append(render_pbar(pct, 50, status))
    counts = f"   {p.done_count}/{p.total}"
    if wip_count:
        counts += f" (+{wip_count}◐)"
    counts += f" · ⏱  {p.days}d"
    header.append(counts, style="dim")

    table = Table(box=None, show_header=False, padding=(0, 1), pad_edge=False, expand=True)
    table.add_column("check", width=3, no_wrap=True)
    table.add_column("label", overflow="fold")
    table.add_column("commit", width=11, no_wrap=True, justify="right")
    for d in p.deliverables:
        is_wip = derive_wip(d, dirty) and not d.done
        if d.failed:
            check = Text("✗", style=f"bold {COL_RED}")
            label = Text(d.label + "  [FAILED]", style=f"bold {COL_RED}")
        elif d.done:
            check = Text("✓", style=f"bold {COL_GREEN}")
            label = Text(d.label, style="white")
        elif is_wip:
            check = Text("◐", style=f"bold {COL_AMBER}")
            label = Text(d.label + "  [IN PROGRESS]", style=f"bold {COL_AMBER}")
        else:
            check = Text("○", style=COL_GRAY)
            label = Text(d.label, style=COL_LB)
        commit_txt = (Text(d.commit[:8], style=COL_GOLD) if d.commit
                      else Text("", style=COL_GRAY))
        table.add_row(check, label, commit_txt)

    return Panel(Group(header, Text(""), table), title=title,
                 border_style=status_color(status), padding=(0, 1))


def render_commits(commits: list[dict]) -> Panel:
    if not commits:
        body = Text("(no commits ahead of master yet)", style=COL_GRAY)
    else:
        table = Table(box=None, show_header=False, padding=(0, 1), pad_edge=False, expand=True)
        table.add_column("hash", width=10, no_wrap=True)
        table.add_column("subject", overflow="ellipsis")
        table.add_column("when", width=18, no_wrap=True, justify="right")
        for c in commits[:12]:
            table.add_row(
                Text(c["hash"][:8], style=COL_GOLD),
                Text(c["subject"], style="white"),
                Text(c["when"], style=COL_LB),
            )
        body = table
    return Panel(body, title=f"[bold]📈 Recent commits on [/][{COL_GOLD}]{BRANCH}[/]",
                 border_style=COL_LB, padding=(0, 1))


def render_calendar() -> Panel:
    table = Table(box=None, show_header=False, padding=(0, 1), pad_edge=False, expand=True)
    table.add_column("week", width=8, no_wrap=True)
    for _ in range(5):
        table.add_column("day", justify="center")
    for week_label, days in CALENDAR:
        cells = [Text(week_label, style=f"bold {COL_LB}")]
        for label, phase, today in days:
            day_color = COL_GREEN if today else COL_LB
            day_text = Text()
            day_text.append(f"{label}\n", style=f"bold {day_color}")
            day_text.append(phase, style=COL_GOLD if today else COL_GRAY)
            cells.append(day_text)
        table.add_row(*cells)
    return Panel(table, title="[bold]⏱  Calendar (3 weeks)[/]",
                 border_style=COL_LB, padding=(0, 1))


def build_layout(issue_states: dict[int, str], commits: list[dict]) -> Group:
    dirty = fetch_dirty_files()
    recent = fetch_recent_mtimes(seconds=300)
    # Combined "wip-eligible" set passed to phase render.
    wip_set = set(dirty) | recent
    total_days = sum(p.days for p in PHASES)
    completed_days = sum(p.days * p.pct(wip_set) / 100 for p in PHASES)
    overall_pct = (completed_days / total_days) * 100 if total_days else 0
    phases_done = sum(1 for p in PHASES if p.status(wip_set) == "done")

    overall = render_overall(completed_days, total_days, phases_done,
                             len(commits), overall_pct)
    live = render_live_activity()

    # Phase cards stacked vertically — full-width is more legible than squeezed 2-col.
    phase_cards = [render_phase(p, issue_states.get(p.issue, "?"), wip_set) for p in PHASES]

    bottom = Columns([render_commits(commits), render_calendar()],
                     expand=True, equal=True)

    return Group(overall, Text(""), live, Text(""), *phase_cards, Text(""), bottom)


def help_footer(live: bool = False) -> Text:
    t = Text()
    if live:
        t.append("Live append mode · scroll up for history · ", style="dim")
        t.append("Ctrl+C", style=f"bold {COL_GOLD}")
        t.append(" to exit", style="dim")
    else:
        t.append("Re-run ", style="dim")
        t.append("pmr", style=f"bold {COL_GOLD}")
        t.append(" to refresh · ", style="dim")
        t.append("pmr --live", style=COL_LB)
        t.append(" for auto-refresh (snapshots appended to scrollback)", style="dim")
    t.append(" · GH epic ", style="dim")
    t.append(f"#{ISSUE_NUMBERS[0]}", style=COL_GOLD)
    t.append(f" at github.com/{REPO}/issues/{ISSUE_NUMBERS[0]}", style="dim")
    return t


# ──────────────────────────────────────────────────────────────────────
# Entrypoints
# ──────────────────────────────────────────────────────────────────────


def render_once(console: Console) -> None:
    issue_states = fetch_issue_states()
    commits = fetch_commits()
    console.print(build_layout(issue_states, commits))
    console.print()
    console.print(help_footer(live=False))


def render_live(console: Console, refresh: float) -> None:
    """Append-mode live refresh: each tick appends a full snapshot to terminal
    scrollback (with a timestamped rule separator). User can scroll up freely
    to see history; the latest snapshot is always at the bottom."""
    import time

    tick = 0
    try:
        while True:
            tick += 1
            stamp = datetime.now().strftime("%H:%M:%S")
            issue_states = fetch_issue_states()
            commits = fetch_commits()
            console.print()
            console.print(Rule(
                f"[bold {COL_GOLD}]pmr snapshot #{tick}[/]  [dim]{stamp}  ·  next refresh in {refresh:.0f}s  ·  Ctrl+C to exit[/]",
                style=COL_GOLD,
            ))
            console.print(build_layout(issue_states, commits))
            console.print(help_footer(live=True))
            time.sleep(refresh)
    except KeyboardInterrupt:
        console.print(f"\n[dim]Exited at {datetime.now().strftime('%H:%M:%S')} after {tick} snapshot(s)[/dim]")


def main() -> int:
    parser = argparse.ArgumentParser(description="Native fractal-render port — PM TUI")
    parser.add_argument("--live", action="store_true",
                        help="Append a fresh snapshot every --refresh seconds (scrollback preserved)")
    parser.add_argument("--refresh", type=float, default=60.0,
                        help="Refresh interval in seconds for --live mode (default: 60)")
    args = parser.parse_args()

    # Use stderr-aware terminal width detection.
    width = shutil.get_terminal_size((140, 40)).columns
    console = Console(width=width)

    if not shutil.which("gh"):
        console.print("[red]warning:[/] gh not on PATH — issue states will show '?'")
    if not shutil.which("git"):
        console.print("[red]error:[/] git not on PATH; cannot read branch state")
        return 1

    if args.live:
        render_live(console, args.refresh)
        return 0

    # Default: one-shot. Output stays in terminal scrollback so the user can
    # scroll up/down freely. Re-run `pmr` to refresh.
    render_once(console)
    return 0


if __name__ == "__main__":
    sys.exit(main())
