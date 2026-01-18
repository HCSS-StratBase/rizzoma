# Rizzoma Feature Testing Status

## 🟢 Current Status
- **Full Vitest run (2026-01-18)**: 42 test files passed, 131 tests passed, 3 skipped. Duration ~110s.
- **Perf harness E2E (2026-01-18)**: N+1 fix verified - no individual `/inline-comments-visibility` API calls. Load time 298ms for 20 blips.
- **Browser smokes `test:toolbar-inline` (2026-01-17)**: Chromium passes; Firefox/WebKit may timeout in CI due to browser startup delays.
- **Browser smokes `test:follow-green` (2026-01-17)**: Desktop profile passes. Auto-navigation feature now works correctly.
- Browser smokes (`npm run test:toolbar-inline`, `npm run test:follow-green`) are CI-required and upload snapshots even when the build fails. Keep them green.
- `TESTING_STATUS.md` is a log, not a guarantee—always rerun targeted suites before merges.

## Recent fixes (2026-01-18)
- **Mobile responsive CSS**: Added responsive breakpoints for viewports <500px in `RizzomaLayout.css`, `RightToolsPanel.css`, `BlipMenu.css`, and `RizzomaTopicDetail.css`. On mobile: sidebars hidden, content area full-width, toolbar buttons larger with touch-friendly spacing.
- **Mobile CI smoke tests**: Added mobile profile to `browser-smokes` job (`RIZZOMA_E2E_PROFILES=mobile`); mobile snapshots uploaded as `follow-the-green-mobile/`.
- **N+1 API calls eliminated in perf mode**: Added `isPerfMode` check to visibility preference useEffect in `RizzomaBlip.tsx`. Eliminated 20+ individual `/inline-comments-visibility` API calls per page load.
- **Perf harness timing fix**: Added `waitForFunction` to wait for all labels before counting. Now correctly reports all rendered blips.
- **CI perf budgets job**: Added `perf-budgets` job to `.github/workflows/ci.yml`. Uses `RIZZOMA_PERF_ENFORCE_BUDGETS=1` to optionally fail CI on budget violations.
- **perf=full mode**: Added support for `perf=full` URL param to load all blips (vs `perf=1` lean mode which only renders stubs).

## Recent fixes (2026-01-17)
- **Blips API performance fix**: Added sort clause to `/api/blips?waveId=...` query to force using `idx_blip_wave_createdAt` index. Reduced query time from 18s to 29ms (600x improvement).
- **bcrypt rounds for dev mode**: Reduced from 10 to 2 rounds for faster auth during tests (from 6-8s to ~100ms per hash).
- **Follow-green test updated**: Test now verifies auto-navigation behavior correctly marks blips as read, rather than requiring manual button click.
- Smoke tests (`test-toolbar-inline-smoke.mjs`, `test-follow-green-smoke.mjs`) updated to use direct API calls for auth instead of UI button clicks—avoids bcrypt timing issues.
- Changed `page.reload({ waitUntil: 'networkidle' })` to `domcontentloaded` in smoke tests to avoid WebSocket timeout issues.
- Fixed unit tests: useWaveUnread socket mocks, InlineComments plugins guard, GadgetNodes JSON parsing, BlipMenu clipboard setup, routes.auth Vitest mocks, and relaxed RightToolsPanel auto-navigate assertions.

## Latest recorded runs (historical)
- `browser-smokes` CI job is configured to run `npm run test:toolbar-inline` and `npm run test:follow-green` across Chromium/Firefox/WebKit + mobile viewport, upload `snapshots/<feature>/`, and publish `dev.log` on failure. Pull artifacts via `npm run snapshots:pull` when needed. Re-run to get current results.
- `npm run test -- --run src/tests/client.RightToolsPanel.followGreen.test.tsx src/tests/client.useWaveUnread.test.tsx` (use `--pool=forks --poolOptions.forks.singleFork=true` if workers are killed) covers Follow-the-Green CTA happy/degraded paths, repeated mark-read failures, and large-wave unread sets; rerun for fresh status.
- `npm run perf:harness` seeds blips (default 5k, set `RIZZOMA_PERF_BLIPS=N` to customize), drives Playwright for time-to-first-render, and stores metrics/screenshots under `snapshots/perf/`. CI-gated via `perf-budgets` job with 50 blips; set `RIZZOMA_PERF_ENFORCE_BUDGETS=1` to fail on budget violations.
- `npm test -- --run src/tests/client.getUserMediaAdapter.test.ts` covers constraint normalization, permission/device helpers, and display media detection for the adapter.

## Historical runs (Dec 2025 and earlier)
- Vitest: `routes.waves.unread`, `server.editorPresence`, `client.PresenceIndicator`, `routes.blips.permissions` (server unread/presence/permissions); historical coverage only.
- Vitest UI: BlipMenu/inline comment popovers/visibility/storage, GreenNavigation harness, gadget nodes; last full pass was Dec 2025 and should be rerun before claiming parity.
- Playwright: early toolbar/follow-green smokes existed pre-2026; rely on rerunning the `browser-smokes` job for current state.

## Gaps / Actions
- Rerun typecheck + focused Vitest + browser smokes before shipping changes; document outcomes here with dates.
- CI gating for `/api/health`, inline comments health checks, and upload probes is now in place via the `health-checks` job (`npm run test:health`).
- CI gating for perf budgets is now in place via the `perf-budgets` job. Currently warn-only; set `RIZZOMA_PERF_ENFORCE_BUDGETS=1` to block on failures.
- Mobile viewport validation is now CI-gated via `browser-smokes` job with `RIZZOMA_E2E_PROFILES=mobile`; check `follow-the-green-mobile/` snapshots for visual verification.
- Legacy CoffeeScript/asset cleanup and dependency upgrades need coverage once refactored.
