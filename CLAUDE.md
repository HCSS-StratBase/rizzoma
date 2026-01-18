# Rizzoma Project Status (feature/rizzoma-core-features)

> **Session Continuity**: Read `CLAUDE_SESSION.md` first for detailed context from the last working session (recent fixes, test status, gotchas, key files).

This file is a lightweight status guide for the active branch. Older "phase" timelines, demo-mode flows, and auto-commit scripts are historical only—use real authentication and the current branch backlog below.

## Testing Methodology
- Use real sessions via the AuthPanel; demo/query-string logins (`?demo=true`) are not supported.
- Keep Playwright smokes green: `npm run test:toolbar-inline` and `npm run test:follow-green` (headed runs allowed for triage).
- Prefer multi-user validation when touching unread/follow-the-green/presence flows; capture snapshots if behavior changes.
- Rerun targeted Vitest suites when touching the covered areas (e.g., unread, uploads, editor gadgets).

## Current Focus
1) Perf/resilience sweeps for large waves/inline comments/playback/mobile; run `npm run perf:harness`, capture metrics/budgets, and add logging hooks.  
2) Modernize `getUserMedia` adapter + tests for new media APIs; validate on mobile.  
3) Health checks + CI gating for `/api/health`, inline comments, and uploads; keep browser smokes green.  
4) Automate bundles/backups (bundle + GDrive copy) and document cadence.  
5) Finish CoffeeScript/legacy cleanup and dependency upgrades; decide legacy static assets.

## Recently Completed Highlights
- **N+1 API calls eliminated (2026-01-18)**: Perf mode now skips individual `/inline-comments-visibility` calls (was 20+ calls, now 0).
- **CI perf budgets (2026-01-18)**: Added `perf-budgets` job to CI pipeline; set `RIZZOMA_PERF_ENFORCE_BUDGETS=1` to fail on budget violations.
- **Perf harness timing fix (2026-01-18)**: Harness now waits for all labels to render before counting.
- **Blips API performance fix (2026-01-17)**: Added sort clause to `/api/blips?waveId=...` to force CouchDB index usage—query time reduced from 18s to 29ms (600x improvement).
- **bcrypt dev mode optimization**: Reduced rounds from 10 to 2 in non-production for faster auth during tests.
- **Follow-green test stabilization**: Test now verifies auto-navigation behavior; desktop profile passes reliably.
- Presence/unread persistence with Follow-the-Green CTA, degraded toasts, and Playwright smokes (`test-follow-green-smoke.mjs` + `test-toolbar-inline-smoke.mjs`).
- Upload pipeline hardened (MIME/ClamAV/S3), gadget nodes restored with TipTap, and edge-case tests added.
- Recovery/search materialization shipped with polling UI + Mango pagination/snippets and corresponding tests.
- Perf harness added (`npm run perf:harness`) to seed large waves and capture render metrics/screenshots.

## Run/Verify
- Start infra: `docker compose up -d couchdb redis` (add `clamav` if scanning).  
- Run app: `npm run dev` (set `EDITOR_ENABLE=1` if needed).  
- Tests: `npm run test`, `npm run test:toolbar-inline`, `npm run test:follow-green`, `npm run perf:harness` (as needed).  
- Snapshots: `npm run snapshots:pull` to fetch latest artifacts without rerunning Playwright.  
- Health: `curl http://localhost:8000/api/health`.

## Notes
- Use `RIZZOMA_FEATURES_STATUS.md` for the authoritative feature snapshot; update after meaningful test runs.  
- Update `TESTING_STATUS.md` when you run suites.  
- Backups: bundle via `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`; copy to GDrive per `docs/HANDOFF.md`.
