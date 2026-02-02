## Handoff Summary — Rizzoma Modernization

Last Updated: 2026-02-03 (refreshed after BLB doc corrections + dependency audit; branch snapshot current)

Branch context guardrails:
- Active branch: `feature/rizzoma-core-features`. Always include branch name + date when summarizing status, and refresh branch-specific bullets before citing them.
- The "Current State" section below reflects `feature/rizzoma-core-features` as of 2026-02-02; revalidate after further changes.

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

Current State (feature/rizzoma-core-features @ 2026-02-03)
- FEAT_ALL required: start both server (:8000) and Vite (:3000) with `FEAT_ALL=1` plus `SESSION_STORE=memory REDIS_URL=memory://` for local smokes; CouchDB/Redis via Docker.
- Tests last run (2026-02-03): `npm test -- --run src/tests/client.BlipMenu.test.tsx` pass. Playwright `npm run test:toolbar-inline` pass (assertions active; snapshots under `snapshots/toolbar-inline/1770075382628-*-final.png`). Playwright `npm run test:follow-green` pass for desktop+mobile with snapshots under `snapshots/follow-the-green/1770075636800-*` and `snapshots/follow-the-green/1770075681747-*`. Perf harness 1000 blips pass with metrics under `snapshots/perf/metrics-1770076098998-*.json` and renders under `snapshots/perf/render-1770076098998-*.png`. Prior runs: `npm test -- --run src/tests/routes.topics.follow.test.ts` pass (2026-02-02). `node test-blb-snapshots.mjs` pass with snapshots under `snapshots/blb/1770069305557-*`. Historical BLB snapshot runs remain below; re-run before merges.
- BLB inline `[+]` markers now navigate into subblip documents; Ctrl+Enter inserts marker and navigates into the new subblip (topic + blip editors).
- Topic meta-blip now renders as a single scrollable pane so the topic title is the first line in the same container as child blips.
- Read-only blip toolbar now includes Collapse/Expand buttons for legacy parity.
- Topics list enrichment: `/api/topics` now emits author name/avatar, snippets, unread totals, and follow state for signed-in users; follow/unfollow endpoints persist `topic_follow` docs with tests in `src/tests/routes.topics.follow.test.ts`.
- Perf: `perf-harness.mjs` 200-blip run PASS (TTF 2173.8ms, FCP 260ms, rendered 101/200); 1000-blip runs now PASS in `perfRender=lite` mode — latest 2026-02-02 run (1000 blips) reported stage duration ~1.5s landing and ~0.5s expanded, memory 23MB, labels rendered 1000/1000 (`snapshots/perf/metrics-1770042725851-*.json`). Windowed 200-label time ~2.6–2.9s. `perfLimit` raises `/api/blips` limits in perf mode; `x-rizzoma-perf=1` skips blip history writes during perf seeding, `perf=full` skips unread/sidebar fetches, and benchmarks now use per-stage duration. Keep working on full-render perf beyond lite mode.
- Follow-the-Green: socket host fix restores `wave:unread` delivery; CTA clears without API fallback. Snapshots under `snapshots/follow-the-green/` (desktop+mobile). RightToolsPanel uses unread sockets/refresh and logs debug when `rizzoma:debug:unread=1`.
- Toolbar/inline comments: inline toolbar parity smoke green; inline comment nav remains optional in smoke but UI renders toolbars. Snapshots under `snapshots/toolbar-inline/`.
- Health/Uploads: `/api/health` + inline comment/upload health tests green locally; uploads pipeline retains MIME/ClamAV/S3/MinIO support.
- Perf/monitoring: `scripts/perf-budget.mjs` added; `src/client/lib/performance.d.ts` supports perf monitor consumers; perf snapshots stored under `snapshots/perf/`.
- Dependency upgrades: audit captured in `docs/DEPENDENCY_UPGRADE_AUDIT.md`; minor/patch batch applied (Playwright/Vitest/Prettier, AWS SDK, session/email libs). Major editor/tooling/server upgrades remain deferred.

Open PRs
- #37: BLB: refresh snapshot harness + inline expansion

Next Work
- Branch focus (current batch): keep changes small/flagged; land perf/resilience sweeps and adapter/health/backup work in slices.
  - Perf/resilience sweeps: address 1k-blip perf harness failure (TTF + render count), add budgets/docs, and schedule runs.
  - Keep Playwright smokes/browser artifacts green; monitor follow-green socket delivery and toolbar parity as code changes land.
  - Health checks + CI gating: `/api/health` + inline comments/upload health tests pass locally; ensure CI coverage and alerting remain intact.
  - Backups: automate bundle + GDrive copy after merges and document cadence.
- Legacy cleanup: finish CoffeeScript/legacy asset disposition and dependency upgrades; rewrite onboarding/status docs to remove demo/start-all claims.
  - Audit (2026-02-02): `.coffee` files remain only in `original-rizzoma-src/` reference tree; none in active `src/`.

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
- Script: `scripts/backup-bundle.sh` (runs bundle + PowerShell copy; honors `RIZZOMA_BUNDLE_PATH` + `RIZZOMA_GDRIVE_DIR` overrides).
- Bundle (manual): `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy (manual PowerShell):
  `powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force'"`
- Last run: 2026-02-03 (bundle created + copied to GDrive via `scripts/backup-bundle.sh`).

PR Log
- 2025‑11‑06: #23 merged (B Part 1: snapshots)
- 2025‑11‑11: #30 merged (B+: realtime incremental updates)
- 2025‑11‑11: #32 merged (B+: rooms/presence)
- 2025‑11‑11: #34 merged (B+: presence identity + UI badge)
