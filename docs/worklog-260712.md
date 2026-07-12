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

## Production acceptance and PR #60 deployment

This section supersedes the deployment boundary above.

- Corrected the release-state audit: PR #57 source head `daa3f2f3` was already serving the public URL from `/data/large-projects/stephan/rizzoma_260612`; the earlier “not yet deployed” status was wrong.
- The first strict public acceptance run exposed a real production failure: `/api/waves/:id/unread` returned HTTP 500 because unread/next/previous routes self-fetched a URL assembled from proxy-derived HTTPS metadata and a rewritten plain-HTTP backend host. The former browser smoke hid the failure by accepting a missing/stale button path, mutating the DOM count, using debug/direct-API fallbacks, and swallowing errors.
- PR [#60](https://github.com/HCSS-StratBase/rizzoma/pull/60) replaced the self-fetch with shared direct wave-tree loading, reloaded once when remote unread blips had not yet materialized in the observer DOM, exposed the real Next action on mobile, and made the smoke require the actual `button.next-button.has-unread` plus persisted `2 → 1 → 0` state.
- PR #60 CI was fully green: 62 test files, 284 passed, 3 skipped, 0 failed; typecheck passed; lint had 0 errors and 6,354 warnings; the production build transformed 3,298 modules; browser, health, performance, iOS, and aggregate gates passed. It merged as `fe6988fb`.
- Promoted the exact merge tree through the accepted staging lane, restarted its API with the public OAuth environment and RedisStore, and switched nginx atomically from Vite `:3000` to Vite `:3100`/API `:8100`. The former public `:3000`/`:8788` lane remains healthy as an immediate rollback target; nginx backup: `/root/rizzoma.conf.pre-pr60-20260712-052206`.
- Public verification passed: health HTTP 200, correct Google OAuth callback, zero API 5xx responses, RedisStore active, and 32 session keys measured after the acceptance run.
- Public collaboration passed 10/10 with a 39 ms A-to-B relay, zero receiving-client REST PUTs, bidirectional convergence, reconnect catch-up, unread drain, and no-store topic reads.
- Public Follow-the-Green passed on desktop and emulated Pixel 5 mobile. The real Next control and endpoint state moved `2 → 1 → 0`; unread reads returned HTTP 200 and individual mark-read writes returned HTTP 201. The visually inspected public evidence, including the 1280/1366/1440/1600 desktop sweep, is under `screenshots/260712-0530-pr60-production-final/`.
- Remaining boundary: the active Node/Vite processes are not supervised services, the old lane is intentionally retained for rollback, live and staging share CouchDB, physical iPhone Safari remains untested, and 500/1,000-blip full-render sweeps remain open.

## Runtime reality audit and release-label correction

- Rechecked the public URL, health/OAuth, nginx target, active process environments, Vite-transformed feature flags, source checkout, Redis, current API log, GitHub state, and native-render executable path at 05:58 CEST.
- Corrected the central release claim: public production is the React/TipTap parity path. The live client exposes parity `1` and native unset; `RizzomaTopicDetail` additionally requires `?render=native`, while `NativeWaveView` remains read-only without persistence, edit toolbar, or reply support.
- Confirmed the API runs with `NODE_ENV=production`, but the public frontend is Vite's development server (`MODE=development`, `DEV=true`) serving source modules. Node and Vite remain bare root-owned processes with no restart supervisor.
- Measured 395 requests / 0 5xx in the active API log after exactly 2,279 seconds of uptime. This is a short post-cutover sample only, not evidence of sustained reliability.
- Confirmed the clean release checkout at `3a55155a` differs from running application commit `fe6988fb` only by docs/evidence. The canonical `/mnt/c/Rizzoma` tree remains a separate dirty `feature/native-fractal-port` checkout at `6e988cc` with one tracked modification and 134 untracked entries; it was left untouched.
- Repository boundary: 3 stale PRs and 7 native-port issues remain open, CI still reports 6,354 warnings, synthetic acceptance topics remain in production, both lanes share CouchDB, and physical iPhone plus 500/1,000-blip full-render coverage remain open.
