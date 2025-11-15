## Handoff Summary — Rizzoma Modernization

Last Updated: 2025-11-14

PR Ops (CLI)
- CLI‑only: `gh pr create|edit|merge`; resolve conflicts locally; squash‑merge and auto‑delete branch.
- After merges, refresh the GDrive bundle (commands below).

Current State (master)
- Milestone A merged (#21): Waves read‑only + unread/nav, counts, materialize + seeder.
- Milestone B Part 1 merged (#23): Editor TipTap+Yjs snapshots; WaveView toggle.
- Milestone B+ merged (#30): Editor realtime (incrementals + client apply) behind `EDITOR_ENABLE=1`.
- Milestone B+ merged (#32): Editor Rooms/Presence (room‑scoped updates) with presence counts.
- Milestone B+ merged (#34): Presence identity + WaveView badge (users array in presence payload).

Open PRs
- None at this time.

Next Work
- Branch: `phase4/editor-recovery-ui`
  - Recovery UI: [BASIC DONE] WaveView button to trigger `/api/editor/:waveId/rebuild` (scopes to current blip when selected) and show results. Follow‑up: admin UI surface and status feedback.
  - Search materialization polish: add/create indexes; harden search endpoint; simple client search UI (basic `#/editor/search` view wired to `/api/editor/search`).
  - Editor pane presence UI: optional inline identity indicator (names/ids) in editor container.
  - Tests + docs for each step; keep PRs small and feature‑flagged.
  - Pre-flight status (2025‑11‑14): `npm run typecheck`, `npm test`, and `npm run build` all pass on this branch; TypeScript strictness slightly relaxed (`noImplicitOverride`/`noUncheckedIndexedAccess`) to accommodate `connect-redis` typings; editor search/rebuild routes stubbed but wired and covered by tests.

Restart Checklist (any machine)
- Node 20.19.0; `npm ci` (or `npm install`)
- Services: `docker compose up -d couchdb redis`
- Legacy views: `npm run prep:views && npm run deploy:views`
- Dev: `npm run dev` (server :8000, client :3000)
- Flag: set `EDITOR_ENABLE=1`
- Verify: `npm run typecheck && npm test && npm run build`

CI Notes
- PRs run typecheck/tests and skip full build; pushes run build and Docker image build.

Backup (GDrive)
- Bundle: `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy (PowerShell):
  `powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force'"`

PR Log
- 2025‑11‑06: #23 merged (B Part 1: snapshots)
- 2025‑11‑11: #30 merged (B+: realtime incremental updates)
- 2025‑11‑11: #32 merged (B+: rooms/presence)
- 2025‑11‑11: #34 merged (B+: presence identity + UI badge)
