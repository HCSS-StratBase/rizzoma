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
- **Four-item sweep (2026-02-10)**: getUserMedia → modern TS ES module (removed legacy prefixed APIs, 10 tests); offline queue wired into `api()` for all 30+ mutation paths; PWA install banner + notification opt-in + offline indicator UI; collab tests hardened (reconnection, multi-client, persistence — 24 new tests total, 161/161 pass).
- **Test/Perf/PWA sweep (2026-02-10)**: 146/146 tests pass (fixed 2 WSL2-flaky timeouts). Perf harness 100-blip benchmark: landing-labels 289ms / expanded-root 523ms / 18MB memory — both PASS. PWA audit 98/100: fixed manifest.json shortcut icon `.png` → `.svg`.
- **Mobile hardening (2026-02-10)**: Touch targets (44px min) added to 11 CSS files, dead `mobile.tsx` stub removed, pull-to-refresh now waits for actual data reload, `100dvh` for mobile address bar, GadgetPalette responsive grid, iOS zoom prevention (`font-size: 16px` on inputs).
- **Zero TypeScript errors + real health check (2026-02-10)**: Fixed all 25 `tsc` errors across 14 files (unused vars, Express 5 param types, TipTap `isDestroyed` cast, index signature access). Upgraded `/api/health` from stub to real CouchDB connectivity check with latency, version, and uptime reporting (503 on failure).
- **Wave-level playback (2026-02-09)**: Full wave timeline modal showing all blips evolving chronologically:
  - `WavePlaybackModal.tsx` with split pane (content + wave overview), color-coded timeline dots
  - API: `GET /api/waves/:id/history` with CouchDB index, shared `htmlDiff.ts` utility
  - Playback controls, cluster fast-forward, date jump, per-blip diff, keyboard shortcuts
  - Feature flag: `FEAT_WAVE_PLAYBACK` (enabled by `FEAT_ALL=1`)
- **BLB implementation fix (2026-01-19)**: Audited and fixed BLB (Bullet-Label-Blip) functionality:
  - Root cause: `RizzomaTopicDetail.tsx` was active but had non-functional Fold button
  - Fixed: Wired Fold button in edit/view mode, persists to localStorage + server
  - Updated expand icons from +/− to □
  - Removed duplicate toolbar buttons in `BlipMenu.tsx`
  - Full methodology documented in `docs/BLB_LOGIC_AND_PHILOSOPHY.md`
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
- Run app: `FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev` and sign in via AuthPanel (no demo/query-string logins).  
- Tests: `npm run test`, `npm run test:toolbar-inline`, `npm run test:follow-green`, `npm run perf:harness` (as needed).  
- Snapshots: `npm run snapshots:pull` to fetch latest artifacts without rerunning Playwright.  
- Health: `curl http://localhost:8000/api/health`.

## Notes
- Use `RIZZOMA_FEATURES_STATUS.md` for the authoritative feature snapshot; update after meaningful test runs.
- Update `TESTING_STATUS.md` when you run suites.
- Backups: use `scripts/backup-bundle.sh` or manual bundle via `git bundle create rizzoma.bundle --all`.
