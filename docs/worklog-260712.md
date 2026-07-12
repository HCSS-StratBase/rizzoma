# Worklog 2026-07-12 — native-fractal release audit

## Outcome

- Audited the exact release line: `fix/single-active-editor` is a fast-forward descendant of `origin/master` and contains the native-fractal merge plus six July editor fixes.
- Preserved `origin/master`; the release candidate was not promoted because the full Vitest suite did not return a complete verdict within the available execution window.
- Refreshed HANDOFF, RESTART, RESTORE_POINT, and TESTING_STATUS so the July live cutover and remaining release boundary are no longer hidden behind March/May snapshots.

## Fixes

- Added a scoped 15-second timeout to the OAuth-provider integration test. Its slow module import caused the default five-second test budget to expire even though the request/assertion path completed; focused rerun passed 3/3.
- Added an explicit `RequestHandler` return type to `sessionMiddleware()`. This removed non-portable declaration inference through the shared `/mnt/c/Rizzoma/node_modules` path and made the production server build portable.

## Verification

- Branch-context lint: PASS.
- TypeScript no-emit check: PASS.
- Production build: PASS; server declarations emitted and Vite transformed 3,297 client modules.
- Focused OAuth suite: 3/3 PASS.
- Full suite: not green-certified. Parallel run exposed the OAuth timeout; serialized run continued without an observed assertion failure but exceeded 600 seconds before a final summary.

## Boundary

- Do not fast-forward `master` until CI or a clean local dependency installation completes the full suite and returns a final passing summary.
- Live/staging topology remains bare `nohup` development processes with MemoryStore sessions, as documented in `VPS_DEPLOYMENT.md`.
- Draft PR [#57](https://github.com/HCSS-StratBase/rizzoma/pull/57) is the merge vehicle and must remain unmerged until its complete CI verdict is green.

## CI remediation follow-up

- Inspected failed PR checks and separated infrastructure failures from application behavior.
- Linux build/health/browser jobs had installed with `--no-optional`, which removed Rollup's required platform binary. All four Linux jobs now use deterministic `npm ci` with optional packages enabled and Cypress's binary download disabled separately.
- The macOS workflow ignored Tiptap collaboration's `y-prosemirror` peer after deleting the lockfile under `legacy-peer-deps`. `y-prosemirror` is now direct, the lockfile carries it as a production dependency, and macOS uses deterministic `npm ci`.
- Restored Vite's `/api` and `/socket.io` portable default from `:8000` to the reserved backend `:8788`; VPS live/staging targets are now explicit deployment overrides.
- PR CI now runs the production build and readiness checks probe `/api/health` through Vite as well as the backend, catching dependency and proxy drift before merge.
- Raised the checked-in iOS project and Podfile deployment target from 14.0 to 15.0, matching Capacitor 8.3.0 and its Status Bar 8.0.2 podspecs; the first repaired macOS run had reached `cap sync` before exposing this native-project drift.
- Initialized the application database explicitly in both Playwright-backed CI jobs. The first fully-started run proved that a healthy CouchDB server with a missing `project_rizzoma` database produced 500s in every browser and the perf harness.
- Tightened `/api/health` to check the configured application database rather than only CouchDB's server root, so readiness can no longer return green while every data route is unusable.
- Removed 22 React Hooks-order lint errors without changing feature behavior by keeping the feature/perf guards in thin exported wrappers and moving hook-bearing implementations into unconditional child components.
- Updated the collaboration smoke to enter edit mode through `rizzoma:enter-edit-blip`; it still dispatched the retired pre-single-active-editor event and therefore timed out before testing any Y.js synchronization.
- Restored both client halves of the April Y.js fix that consolidation silently reverted: editable child blips now join their collaboration room before expansion, and only the server-authorized client may seed an empty Y.Doc. The regression left one editor outside the child room while near-simultaneous editors could independently seed divergent CRDT histories; live relay failed until reconnect merged server state.
- Made the collaboration smoke wait for authoritative initial content on each editor, not merely a mounted ProseMirror element, before exercising bidirectional typing.
- Replaced fixed collaboration sleeps with bounded waits on socket events, editor convergence, disconnect, reconnect, and catch-up state.
- Fixed `SocketIOProvider.destroy()` to remove its own Y.Doc and socket callbacks by handler identity. The previous teardown leaked ghost outbound emitters and could remove another provider's same-event listener during editor churn.
- Verification: workflow YAML PASS; typecheck PASS; production build PASS; complete Vitest PASS at 61 files / 275 passed / 3 skipped / 0 failed.

## Final CI and merge

This section supersedes the initial release boundary above.

- PR [#57](https://github.com/HCSS-StratBase/rizzoma/pull/57) merged to `master` as `8840f552` from source head `daa3f2f3` at 2026-07-12 03:38 CEST.
- PR [#58](https://github.com/HCSS-StratBase/rizzoma/pull/58) landed the final handoff and inspected evidence as `6db65e20`; the release code checkpoint remains `8840f552`.
- Final-head [CI 29175331401](https://github.com/HCSS-StratBase/rizzoma/actions/runs/29175331401) passed build, browser smokes, performance budgets, health checks, and the aggregate gate; [iOS 29175331404](https://github.com/HCSS-StratBase/rizzoma/actions/runs/29175331404) also passed.
- Final CI measured 62 files / 283 passed / 3 skipped, 3,298 transformed build modules, lint at 0 errors, and 10/10 health checks.
- The two-browser-process collaboration smoke passed 10/10: 1 ms A-to-B relay, zero receiving-client REST PUTs, bidirectional convergence, reconnect catch-up, stable unread drain, and no-store topic reads.
- The enforced full-render gate passed 120/120 labels and blips with 101 lazy slots, 394.3 ms landing, 595.6 ms expanded, and 36 MB heap.
- Rendered evidence and metric payloads are preserved under `screenshots/260712-0313-pr57-release-gates/`; the PNGs were inspected for layout, clipping, toolbar state, and desktop/mobile readability.
- Boundary: the merged source has not yet been deployed. Production verification, managed services plus Redis-backed sessions, 500/1,000 full-render sweeps, physical iPhone Safari, backup automation, and the 6,363-warning lint backlog remain separate follow-ups.
- Post-merge backup completed: `rizzoma.bundle` and dated GDrive copy `rizzoma-260712-pr57-native-fractal-release.bundle` are 630 MB, `git bundle verify` reports complete history, and all three copies match SHA-256 `c0cb22744d190426c984217943ff1785983f48f1bdffd4b6705749108a58f327`.
