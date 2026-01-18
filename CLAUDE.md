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
4) Validate PWA on actual mobile devices (iPhone Safari, Chrome Android).

## Recently Completed Highlights
- **Major dependency upgrades (2026-01-18)**: Express 4→5, Redis 4→5, Vite 5→7, Vitest 1→4, @vitejs/plugin-react→5.0.0
- **AWS SDK v3 migration (2026-01-18)**: S3 uploads now use modular `@aws-sdk/client-s3` with lazy initialization
- **Massive legacy cleanup (2026-01-18)**: Removed 480 files, -66,949 lines:
  - All CoffeeScript files (`src/share/`, `src/*_index.coffee`)
  - All legacy static assets (`src/static/` - images, CSS, jQuery plugins)
  - Legacy test scripts
- **Mobile modernization (2026-01-18)**: Complete mobile PWA infrastructure with zero new dependencies:
  - Responsive breakpoints, mobile context/hooks, BottomSheet component
  - PWA manifest, service worker, SVG icons
  - Gesture hooks (`useSwipe`, `usePullToRefresh`), View Transitions API
  - Offline queue with mutation retry
- **N+1 API calls eliminated (2026-01-18)**: Perf mode skips individual `/inline-comments-visibility` calls
- **CI perf budgets (2026-01-18)**: Added `perf-budgets` job; set `RIZZOMA_PERF_ENFORCE_BUDGETS=1` to fail on violations
- **Blips API performance fix (2026-01-17)**: CouchDB index usage—query time 18s→29ms (600x improvement)
- Presence/unread persistence with Follow-the-Green CTA and Playwright smokes
- Upload pipeline hardened (MIME/ClamAV/S3), gadget nodes restored with TipTap
- Perf harness (`npm run perf:harness`) for large wave benchmarks

## Run/Verify
- Start infra: `docker compose up -d couchdb redis` (add `clamav` if scanning).  
- Run app: `npm run dev` (set `EDITOR_ENABLE=1` if needed).  
- Tests: `npm run test`, `npm run test:toolbar-inline`, `npm run test:follow-green`, `npm run perf:harness` (as needed).  
- Snapshots: `npm run snapshots:pull` to fetch latest artifacts without rerunning Playwright.  
- Health: `curl http://localhost:8000/api/health`.

## Notes
- Use `RIZZOMA_FEATURES_STATUS.md` for the authoritative feature snapshot; update after meaningful test runs.
- Update `TESTING_STATUS.md` when you run suites.
- Backups: use `./scripts/backup.sh --gdrive` or manual bundle via `git bundle create rizzoma.bundle --all`.
