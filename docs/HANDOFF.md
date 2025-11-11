## Handoff Summary — Rizzoma Modernization

Last Updated: 2025-11-11

PR Ops (CLI, mandatory)
- Use CLI only: create/edit/merge PRs via `gh`.
- Resolve conflicts locally (merge master into feature); no approval pauses.
- After merges, refresh the GDrive bundle (commands below).

Current State (Master)
- Milestone A merged (#21): Waves read‑only + unread/nav, counts, materialize + seeder.
- Milestone B Part 1 merged (#23): Editor TipTap+Yjs snapshot save/restore, WaveView toggle.
- Milestone B Part 2 merged (#26): Editor per‑blip snapshots; WaveView mounts Editor for current blip.
- Build/test posture: typecheck clean; full test suite passes locally; server+client builds succeed.

Open PRs
- None. Recent merges: #27 (build/test cleanup), #28 (housekeeping: untrack node_modules).

Next Work (Milestone B+)
- New branch: `phase4/editor-realtime`.
- Scope:
  - Editor realtime: server broadcasts incremental Yjs updates; client subscribes; remain behind `EDITOR_ENABLE=1`.
  - Search materialization polish: use stored `text`, indexes, search endpoint hardening.
  - Tests: editor routes/search + client adapter; expand Vitest include accordingly.
  - Docs: update docs/EDITOR.md with realtime and recovery tools.

Restart Checklist (new machine, same folder)
- Node 20.19.0: `node -v` (if needed: `nvm install 20.19.0 && nvm use 20.19.0`).
- Install deps: `npm ci` (or `npm install`).
- Docker Desktop WSL integration ON; start services: `docker compose up -d couchdb redis`.
- Legacy views (if needed): `npm run prep:views && npm run deploy:views` (CouchDB must be up).
- Run dev: `npm run dev` (server :8000, client :3000). Open http://localhost:3000.
- Editor flag: set `EDITOR_ENABLE=1` for editor endpoints.

Quick Status Commands
- Remote check: `git remote -v` (expect origin = HCSS-StratBase/rizzoma).
- Sync master: `git fetch origin && git checkout master && git pull --ff-only`.
- Create feature branch: `git checkout -b phase4/editor-realtime`.
- Tests: `npm test`.
- Typecheck/build: `npm run typecheck && npm run build`.

CI Notes
- CI runs typecheck, lint (non‑blocking), tests, build.
- Docker image build is skipped on pull_request to stabilize PR checks; still runs on pushes.

Backup Commands (GDrive)
- Create bundle: `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy to G: `powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force'"`

Reference Docs
- README_MODERNIZATION.md — overview, dev runbook, PR policy.
- docs/EDITOR.md — editor architecture, flags, snapshot flow, roadmap.
- docs/LINKS_REPARENT.md — links and reparent endpoints/UI.
- AGENTS.md — operational conventions (no approvals, docs‑first, backup policy).

Known Nuances
- connect-redis import currently default (v7) in server; tests mock both default and named. If upgrading to v9, switch to named import consistently.
- Legacy CouchDB views needed to populate legacy fallbacks until modern docs are present.

PR Log
- 2025-11-06: PR #23 merged (Part 1).
- 2025-11-11: PR #26 merged (Part 2, per‑blip Editor + WaveView mount).
- 2025-11-11: PR #27 merged (build/test cleanup; expanded coverage; ambient types).
- 2025-11-11: PR #28 merged (housekeeping: untrack node_modules).

