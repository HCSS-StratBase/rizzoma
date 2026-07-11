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
- Verification: workflow YAML PASS; typecheck PASS; production build PASS; complete Vitest PASS at 61 files / 275 passed / 3 skipped / 0 failed.
