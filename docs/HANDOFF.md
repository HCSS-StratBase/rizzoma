## Handoff Summary — Rizzoma Modernization

Last Updated: 2025-12-09 (refreshed after Playwright/perf/health runs; branch snapshot current)

Branch context guardrails:
- Active branch: `feature/rizzoma-core-features`. Always include branch name + date when summarizing status, and refresh branch-specific bullets before citing them.
- The "Current State" section below reflects `feature/rizzoma-core-features` as of 2025-12-09; revalidate after further changes.

### Drift warnings (actively curating)
- Many onboarding/status docs (`README*.md`, `QUICKSTART.md`, `README_MODERNIZATION.md`, `MODERNIZATION_STRATEGY.md`, `PARALLEL_DEVELOPMENT_PLAN.md`, `TESTING_GUIDE.md`, `MANUAL_TEST_CHECKLIST.md`, `CLAUDE.md`) still talk about demo-mode shortcuts, “all core features green,” or aggressive auto-merge flows that predate the unread/perf backlog. Treat them as historical until we rewrite them with the current perf harness + CI gating expectations.
- Phase language (e.g., `modernization/phase1` or “Phase 1 complete”) in README/modernization strategy docs is historical only and does not apply to `feature/rizzoma-core-features`; rely on `RIZZOMA_FEATURES_STATUS.md` for the active branch snapshot (perf/getUserMedia/health/backups still pending).
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` were refreshed to call out the perf/getUserMedia/backups/health-check gaps, but they remain summaries only; rerun tests before trusting them.
- If link management guidance is still needed, `docs/LINKS_REPARENT.md` was removed; restore or replace before directing contributors to it.
- Demo-mode login references are stale: the Rizzoma layout routes sign-in through the real `AuthPanel`, so contributors must use authenticated sessions rather than `?demo=true` fallbacks.
- Playwright smokes are required for merges: the `browser-smokes` GitHub job runs `npm run test:toolbar-inline` + `npm run test:follow-green`, uploads `snapshots/<feature>/` artifacts, and now runs even when the build stage fails so snapshots/artifacts are always available for triage. Pull them locally via `npm run snapshots:pull` if you need to inspect without rerunning Playwright.
- `README_MODERNIZATION.md` still positions Phase 1 as largely complete and omits the current perf/getUserMedia/health/backups backlog; rewrite before citing it for the active branch.
- `docs/EDITOR_REALTIME.md` "Next steps" still lists presence/recovery/search as pending even though they shipped; update the roadmap to match the current perf/resilience focus.
- `TESTING_STATUS.md` and `RIZZOMA_FEATURES_STATUS.md` reflect historical Dec 2025 runs; rerun suites before relying on them.
- `QUICKSTART.md`, `TESTING_GUIDE.md`, and `CLAUDE.md` still promote `npm run start:all`, demo-mode flows, and auto-commit/auto-merge assumptions; treat them as historical checklists until rewritten for the current perf/backups/health backlog and real-auth requirements.
- Landing view parity: topic landing page must match `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png` — only root labels visible, no children/body/editor until user clicks “+”. Perf harness landing metric should measure this collapsed state; expansion metrics can be separate.

PR Ops (CLI)
- CLI‑only: `gh pr create|edit|merge`; resolve conflicts locally; squash‑merge and auto‑delete branch.
- After merges, refresh the GDrive bundle (commands below).

Current State (feature/rizzoma-core-features @ 2025-12-09)
- FEAT_ALL required: start both server (:8000) and Vite (:3000) with `FEAT_ALL=1` plus `SESSION_STORE=memory REDIS_URL=memory://` for local smokes; CouchDB/Redis via Docker.
- Tests last run (2025-12-09): `npm run lint:branch-context` pass; Playwright `npm run test:toolbar-inline` (Chromium/Firefox/WebKit) and `npm run test:follow-green` (desktop+mobile) pass after socket host fix and feature gating; `npm run test:health` pass; targeted `npm test -- --run src/tests/client.getUserMediaAdapter.test.ts` pass.
- Perf: `perf-harness.mjs` 200-blip run PASS (TTF 2173.8ms, FCP 260ms, rendered 101/200); 1000-blip runs FAIL after lifting fetch cap (TTF 9877.7ms → 17810.9ms, FCP 396–536ms, ~159–179MB, rendered 1001/1000) and the new windowed render reports TTF 6271.8ms/14MB but only 1/1000 rendered because the harness stops at the first blip. Budgets enforced via `scripts/perf-budget.mjs`; need windowed render measurement (first 50/200) and lower large-wave TTF/memory.
- Follow-the-Green: socket host fix restores `wave:unread` delivery; CTA clears without API fallback. Snapshots under `snapshots/follow-the-green/` (desktop+mobile). RightToolsPanel uses unread sockets/refresh and logs debug when `rizzoma:debug:unread=1`.
- Toolbar/inline comments: inline toolbar parity smoke green; inline comment nav remains optional in smoke but UI renders toolbars. Snapshots under `snapshots/toolbar-inline/`.
- Health/Uploads: `/api/health` + inline comment/upload health tests green locally; uploads pipeline retains MIME/ClamAV/S3/MinIO support.
- Perf/monitoring: `scripts/perf-budget.mjs` added; `src/client/lib/performance.d.ts` supports perf monitor consumers; perf snapshots stored under `snapshots/perf/`.

Open PRs
- None at this time.

Next Work
- Branch focus (current batch): keep changes small/flagged; land perf/resilience sweeps and adapter/health/backup work in slices.
  - Perf/resilience sweeps: address 1k-blip perf harness failure (TTF + render count), add budgets/docs, and schedule runs.
  - Keep Playwright smokes/browser artifacts green; monitor follow-green socket delivery and toolbar parity as code changes land.
  - Health checks + CI gating: `/api/health` + inline comments/upload health tests pass locally; ensure CI coverage and alerting remain intact.
  - Backups: automate bundle + GDrive copy after merges and document cadence.
  - Legacy cleanup: finish CoffeeScript/legacy asset disposition and dependency upgrades; rewrite onboarding/status docs to remove demo/start-all claims.

Restart Checklist (any machine)
- Node 20.19.0; `npm ci` (or `npm install`)
- Services: `docker compose up -d couchdb redis` (add `clamav` if `CLAMAV_HOST`/`CLAMAV_PORT` are set for upload scanning)
- Legacy views: `npm run prep:views && npm run deploy:views`
- Dev: `npm run dev` (server :8000, client :3000)
- Flag: set `EDITOR_ENABLE=1`
- Verify: `npm run typecheck && npm test && npm run build`

CI Notes
- PRs run typecheck/tests and skip full build; pushes run build and Docker image build.
- `browser-smokes` GitHub job runs `npm run test:toolbar-inline` + `npm run test:follow-green`, saves `snapshots/toolbar-inline/` + `snapshots/follow-the-green/`, and uploads `dev.log` whenever the Playwright suites regress (it runs even if build fails). Keep it green before merging.

Backup (GDrive)
- Bundle: `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy (PowerShell):
  `powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force'"`

PR Log
- 2025‑11‑06: #23 merged (B Part 1: snapshots)
- 2025‑11‑11: #30 merged (B+: realtime incremental updates)
- 2025‑11‑11: #32 merged (B+: rooms/presence)
- 2025‑11‑11: #34 merged (B+: presence identity + UI badge)
