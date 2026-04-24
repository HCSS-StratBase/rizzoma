# Worklog 260424

## Production Perf Baseline
- Re-read active branch docs and confirmed `feature/rizzoma-core-features` is the required backlog branch.
- Preserved the pre-existing dirty `screenshots/260330-app-runtime/topic-patch-log.ndjson` change in stash `safety: preserve pre-existing topic patch log before feature branch work` before switching from `master` to `feature/rizzoma-core-features`.
- Added selectable perf render profiles to `perf-harness.mjs`: default `lite`, opt-in `RIZZOMA_PERF_RENDER=full`.
- Updated perf metrics to record `renderProfile` and `perfMode`.
- Updated `scripts/perf-budget.mjs` to support `PERF_SNAPSHOT_DIR`, check stage-local duration by default, and keep absolute page TTF as an opt-in diagnostic via `PERF_BUDGET_CHECK_TTF=1`.
- Ran public-prod full-render baseline:
  - Command: `RIZZOMA_BASE_URL=https://138-201-62-161.nip.io RIZZOMA_PERF_BLIPS=100 RIZZOMA_PERF_RENDER=full RIZZOMA_SNAPSHOT_DIR=screenshots/260424-prod-perf-baseline npm run perf:harness`
  - Result: pass.
  - Landing-labels: stage 1193.7ms, FCP 740ms, memory 33MB, labels 100/100.
  - Expanded-root: stage 524.5ms, FCP 740ms, memory 36MB, blips 101/100.
  - Artifacts: `screenshots/260424-prod-perf-baseline/metrics-1776982200094-*.json`, `screenshots/260424-prod-perf-baseline/render-1776982200094-*.png`.
- Verified budgets:
  - Command: `PERF_SNAPSHOT_DIR=screenshots/260424-prod-perf-baseline PERF_BUDGET_EXPECTED_BLIPS=100 PERF_BUDGET_MIN_RATIO=1 node scripts/perf-budget.mjs`
  - Result: pass.
  - Optional absolute-TTF diagnostic still flags expanded-root at 3522.9ms vs 3000ms.

## Smoke And Health
- Scoped `test-toolbar-inline-smoke.mjs` selectors to the created blip’s `data-blip-id` to avoid topic-root/global toolbar collisions.
- Ran public-prod Chromium toolbar smoke:
  - Command: `RIZZOMA_BASE_URL=https://138-201-62-161.nip.io RIZZOMA_E2E_BROWSERS=chromium RIZZOMA_SNAPSHOT_DIR=screenshots/260424-prod-toolbar-scoped npm run test:toolbar-inline`
  - Result: pass.
  - Artifact: `screenshots/260424-prod-toolbar-scoped/1776982255595-chromium-final.png`.
- Made `src/tests/server.health.test.ts` deterministic by mocking CouchDB and covering both `200 ok` and `503 degraded`.
- Verification:
  - `npm run test:health` pass: 3 files, 10 tests.
  - `npm test -- --run src/tests/client.BlipMenu.test.tsx` pass: 18 tests.
  - `node --check perf-harness.mjs`, `node --check scripts/perf-budget.mjs`, and `node --check test-toolbar-inline-smoke.mjs` pass.
  - `git diff --check` pass.
- Visual review:
  - Perf screenshots and toolbar smoke screenshot are stable/readable.
  - Residual gap: public-prod screenshots show broken external avatar placeholders in this WSL/browser environment.

## Next
- Continue from the `260424-015008` sweep as the current screenshot evidence set; the earlier `260424-003739` next items below are superseded by the realtime/mobile gap-closure pass.
- Harden visible product quality: avatar fallbacks and crowded mobile editor toolbar.
- Rerun production-target full-render perf at 500 and 1000 blips.
- Compare `RIZZOMA_PERF_RENDER=full` vs `lite` with identical seed sizes.
- Decide whether avatar fallback/proxying belongs in the modernization backlog.

## Visual Feature Sweep
- Added `scripts/visual-feature-sweep.mjs` and `npm run visual:sweep`.
- Ran public-prod sweep:
  - Command: `RIZZOMA_BASE_URL=https://138-201-62-161.nip.io RIZZOMA_SWEEP_STAMP=260424-003739 npm run visual:sweep`
  - Result: pass.
  - Artifacts: `screenshots/260424-003739-feature-sweep/`.
  - Manifest: parsed 196 documented rows, 161 screenshot-valid rows, and 69 dynamic candidates; captured 40 primary screenshots after the later toast-evidence refresh.
- Ran dynamic follow-green supplement into the same timestamped folder:
  - Command: `RIZZOMA_BASE_URL=https://138-201-62-161.nip.io RIZZOMA_E2E_PROFILES=desktop,mobile RIZZOMA_SNAPSHOT_DIR=screenshots/260424-003739-feature-sweep/follow-green npm run test:follow-green`
  - Result: pass.
  - Artifacts: desktop/mobile PNGs plus owner/observer console logs under `screenshots/260424-003739-feature-sweep/follow-green/`.
- Visual review:
  - Accepted sign-in/sign-up, nav/search tabs, create/invite/share/export/playback modals, toolbar/read/edit/overflow states, emoji/mention/task/tag/gadget states, inline comments, BLB inline before/after, fold/unfold, right-panel toggles, mobile topic list, and follow-green mobile topic content.
  - Residual: generic mobile deep-link topic route can remain on `Loading...`; follow-green mobile screenshot covers mobile topic content for this sweep.
  - Residual: public-prod avatar images still show broken placeholders in this environment.
- Removed failed supplemental `blb/` artifacts after `test-blb-snapshots.mjs` timed out on inline expansion; not counted as evidence.

## Visual Coverage Matrix
- Added `scripts/visual-feature-coverage.mjs` and `npm run visual:coverage`.
- Regenerated the public-prod sweep:
  - Command: `RIZZOMA_BASE_URL=https://138-201-62-161.nip.io RIZZOMA_SWEEP_STAMP=260424-003739 npm run visual:sweep`
  - Result: pass.
  - Artifacts: `screenshots/260424-003739-feature-sweep/` now has 40 primary screenshots, including `040-toast-notification-component-visible.png`.
- Ran row-level coverage:
  - Command: `RIZZOMA_SWEEP_DIR=screenshots/260424-003739-feature-sweep npm run visual:coverage`
  - Result: pass.
  - Matrix: `coverage.md` / `coverage.json` classify all 161 screenshot-valid rows: 93 static screenshot-covered, 8 dynamic screenshot-covered, 58 non-screenshot/test-artifact, 2 screenshot gaps, 0 needs-review.
- Visual review:
  - Accepted refreshed toast component screenshot and representative BLB/navigation/mobile artifacts.
  - Residual: live cursors and typing indicators still need a two-client dynamic screenshot with remote state visible.
  - Residual: generic mobile deep-link topic route can still remain on `Loading...`; follow-green mobile screenshot remains current mobile topic-content evidence.

## Realtime And Mobile Visual Gap Closure
- Implemented realtime awareness fixes:
  - `CollaborativeCursors.tsx` now sets `cursor.isTyping` during local document changes and clears it after a short idle timeout.
  - `TypingIndicator` now subscribes to awareness changes and updates visible remote typing state.
  - `RizzomaBlip.tsx` now renders `TypingIndicator` next to the active editor and recreates the TipTap editor when collaboration extensions become active.
- Hardened production build flags:
  - `vite.config.ts` now passes `FEAT_WAVE_PLAYBACK`, `FEAT_TASKS`, and `BUSINESS_ACCOUNT` into the client bundle and defaults `FEAT_ALL=1` for production builds.
  - Removed stale production build inputs and invalid self-preconnect that broke earlier build attempts.
- Hardened the visual sweep:
  - Added two-client realtime capture for live cursor + typing indicator.
  - Fixed mobile topic URL/click handling so phone-width topic content is captured.
  - Updated coverage generation to verify evidence files exist and resolve evidence by stable capture IDs instead of stale screenshot numbers.
- Deployed to VPS:
  - Command: `docker compose up -d --build app-prod`.
  - Result: public production and local-container `/api/health` checks passed.
- Final public-prod sweep:
  - Command: `RIZZOMA_BASE_URL=https://138-201-62-161.nip.io RIZZOMA_SWEEP_STAMP=260424-015008 npm run visual:sweep`.
  - Result: pass with 42 screenshots and no manifest residuals.
  - Evidence: `screenshots/260424-015008-feature-sweep/040-mobile-topic-content-view.png` and `screenshots/260424-015008-feature-sweep/042-real-time-cursor-and-typing-indicator-visible.png`.
- Final coverage:
  - Command: `RIZZOMA_SWEEP_DIR=screenshots/260424-015008-feature-sweep npm run visual:coverage`.
  - Result: 101 static screenshot-covered, 2 dynamic screenshot-covered, 58 non-screenshot/test-artifact, 0 screenshot gaps, 0 needs-review.
- Verification:
  - `npm run typecheck` pass.
  - `npm test -- --run src/tests/client.collaborativeProvider.test.ts` pass.
  - `npm run build` pass.
- Honest quality boundary:
  - Screenshot coverage gaps are closed.
  - Product polish remains: broken external avatar placeholders and crowded mobile toolbar layout are visible in the accepted screenshots.
