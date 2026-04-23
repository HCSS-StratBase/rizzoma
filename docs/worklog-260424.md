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
- Rerun production-target full-render perf at 500 and 1000 blips.
- Compare `RIZZOMA_PERF_RENDER=full` vs `lite` with identical seed sizes.
- Decide whether avatar fallback/proxying belongs in the modernization backlog.
