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


@dataclass
class Phase:
    n: int
    issue: int
    title: str
    short: str
    days: float
    deliverables: list[Deliverable] = field(default_factory=list)

    @property
    def done_count(self) -> int:
        return sum(1 for d in self.deliverables if d.done)

    @property
    def total(self) -> int:
        return len(self.deliverables)

    @property
    def pct(self) -> float:
        return (self.done_count / self.total) * 100 if self.total else 0

    @property
    def status(self) -> str:
        if self.pct == 100:
            return "done"
        if self.pct == 0:
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
              Deliverable("Round-trip parser tests on every dev-DB topic"),
          ]),
    Phase(2, 53, "BlipView lifecycle + TipTap edit-mode + Ctrl+Enter",
          "Per-blip view; mounts TipTap into DOM slot when isEditing; Ctrl+Enter inserts BLIP at array index",
          4, [
              Deliverable("blip-view.ts (~600 LOC) — port of blip/view.coffee"),
              Deliverable("blip-editor-host.ts — mount/unmount TipTap into BlipView slot"),
              Deliverable("wave-view.ts — port of wave/view.coffee"),
              Deliverable("NativeWaveView.tsx — thin React wrapper behind feature flag"),
              Deliverable("RizzomaTopicDetail.tsx side-by-side toggle (no demolition)"),
              Deliverable("Ctrl+Enter handler — insert BLIP at cursor array-index"),
              Deliverable("sanity sweep + state-survives-collapse pass on ?render=native"),
              Deliverable("Nested Ctrl+Enter renders new child INLINE at cursor (the cc7caf4b bug)"),
          ]),
    Phase(3, 54, "Y.js collab + cross-tab sync + live cursors",
          "Y.Array<Y.Map> over ContentArray; per-blip TipTap keeps Y.XmlFragment",
          3, [
              Deliverable("yjs-binding.ts — Y.Array<Y.Map> binding for ContentArray"),
              Deliverable("Per-blip TipTap keeps existing Y.XmlFragment + Collaboration"),
              Deliverable("Awareness (presence + cursor color) per-blip editor"),
              Deliverable("Vitest Y.js convergence test (two Y.Doc through op sequences)"),
              Deliverable("Two-tab cross-sync within 1 second"),
              Deliverable("Real-time cursor visible in editing blip"),
          ]),
    Phase(4, 55, "Auxiliary feature wiring",
          "Playback, history, mentions, comments, follow-the-green — most are 0-2hr wiring",
          2, [
              Deliverable("Wave-level playback (WavePlaybackModal) wired into native render"),
              Deliverable("Per-blip history modal button in BlipView gear menu"),
              Deliverable("Mentions / hashtags / tasks (per-blip TipTap extensions)"),
              Deliverable("Inline comments anchor migration"),
              Deliverable("Code blocks / gadgets (per-blip extensions)"),
              Deliverable("Follow-the-Green / unread state"),
              Deliverable("Mobile gestures (swipe, pull-to-refresh)"),
              Deliverable("Visual feature sweep (161-row matrix) green"),
          ]),
    Phase(5, 56, "Cut over + 24-hour soak + cleanup commit",
          "Set flag on dev VPS; soak; delete React-portal layer (~3,500 LOC removed)",
          2, [
              Deliverable("Set FEAT_RIZZOMA_NATIVE_RENDER=1 on dev VPS"),
              Deliverable("Full sanity sweep + state-survives-collapse + visual-feature-sweep all green"),
              Deliverable("Side-by-side comparison with rizzoma.com depth-10 reference"),
              Deliverable("24-hour soak — zero blocking bugs reported"),
              Deliverable("Delete RizzomaBlip.tsx (~2,200 LOC)"),
              Deliverable("Delete InlineHtmlRenderer.tsx (~280 LOC)"),
              Deliverable("Delete inlineMarkers.ts (~125 LOC)"),
              Deliverable("Delete BlipThreadNode.tsx (~150 LOC)"),
              Deliverable("Trim RizzomaTopicDetail.tsx (~600 LOC)"),
              Deliverable("Drop both feature flags; native is the only path"),
              Deliverable("Update CLAUDE.md BLB section + create docs/NATIVE_RENDER_ARCHITECTURE.md"),
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


def render_phase(p: Phase, gh_state: str) -> Panel:
    title = Text()
    title.append(f"PHASE {p.n} ", style=f"bold {COL_GOLD}")
    title.append(f"#{p.issue}", style=f"bold {COL_GOLD} underline")
    title.append(f" · GH {gh_state}", style="dim")
    title.append("   ")
    title.append(status_pill(p.status))

    header = Text()
    header.append(f"{p.title}\n", style="bold white")
    header.append(p.short + "\n", style=COL_LB)
    header.append("\n")
    header.append(render_pbar(p.pct, 50, p.status))
    header.append(f"   {p.done_count}/{p.total} · ⏱  {p.days}d", style="dim")

    table = Table(box=None, show_header=False, padding=(0, 1), pad_edge=False, expand=True)
    table.add_column("check", width=3, no_wrap=True)
    table.add_column("label", overflow="fold")
    table.add_column("commit", width=11, no_wrap=True, justify="right")
    for d in p.deliverables:
        if d.done:
            check = Text("✓", style=f"bold {COL_GREEN}")
            label = Text(d.label, style="white")
        else:
            check = Text("○", style=COL_GRAY)
            label = Text(d.label, style=COL_LB)
        commit_txt = (Text(d.commit[:8], style=COL_GOLD) if d.commit
                      else Text("", style=COL_GRAY))
        table.add_row(check, label, commit_txt)

    return Panel(Group(header, Text(""), table), title=title,
                 border_style=status_color(p.status), padding=(0, 1))


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


def build_layout(issue_states: dict[int, str], commits: list[dict]) -> Layout:
    total_days = sum(p.days for p in PHASES)
    completed_days = sum(p.days * p.pct / 100 for p in PHASES)
    overall_pct = (completed_days / total_days) * 100 if total_days else 0
    phases_done = sum(1 for p in PHASES if p.status == "done")

    overall = render_overall(completed_days, total_days, phases_done,
                             len(commits), overall_pct)

    # Phase cards stacked vertically — full-width is more legible than squeezed 2-col.
    phase_cards = [render_phase(p, issue_states.get(p.issue, "?")) for p in PHASES]

    bottom = Columns([render_commits(commits), render_calendar()],
                     expand=True, equal=True)

    return Group(overall, Text(""), *phase_cards, Text(""), bottom)


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
