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

## Documentation and Tana closeout

- Published the eight-file correction through PR [#62](https://github.com/HCSS-StratBase/rizzoma/pull/62); it merged as `9c4fb68f` after build, browser, health, performance, aggregate, and branch-update checks all passed.
- Created separate, top-level HCSS output `8mGAbLRiBnne` on the 2026-07-12 daily note with `#Rizzoma modernization`, `#Rizzoma`, human provenance, exact GPT-5.6 Sol / Codex CLI 0.144.1 provenance, six result/boundary bullets, and GitHub artifacts.
- Renamed and bounded PR #60 discussion `cJolEA2G4Lvb`, cross-linked it to the new output, and clarified that zero 5xx applied to the bounded acceptance run.
- Marked the 9 July single-active-editor precursor `74Hvd17c3Vfc` complete and added both missing Rizzoma tags so tag searches surface the detailed history.
- Verified both 12 July entries directly on the HCSS day node, read back fields and tags, and swept the helper-created empty content placeholder while preserving field tuples. Updated the global `HANDOFF.md` to the same final state.

## Sharing authorization implementation

### Outcome

- Built the change on isolated branch `fix/sharing-access-control` from `origin/master` `1241428b`; no production checkout, deployment, or remote branch was changed.
- Replaced display-only sharing with persisted owner-controlled private/link/public policy plus viewer/commenter/editor/owner capabilities.
- Centralized authorization across topic/wave listing and reads, topic/blip/comments/links/editor mutations, participants and both invitation endpoints, unread access, and Socket.IO collaboration.
- Bound the compatibility rule: new topics are private; documents missing both policy shapes and true legacy waves missing metadata remain public read-only, never public-write.

### Security and UI

- Socket.IO now reads identity from the same Express session store and ignores client-supplied user identity. Viewers can sync but cannot publish Yjs or awareness updates; live role/policy changes immediately revoke lost room/write authority.
- Sharing settings hydrate from the server, disable on load failure, canonicalize edit ⇒ comment, and clear public flags when made private.
- Invite UI now assigns viewer, commenter, or editor; alternate notification invitations are owner-only as well.
- Added the read-only `npm run sharing:count-legacy` inventory utility. It reports exact missing-policy counts and samples without stamping or modifying documents.

### Verification

- Full Vitest: 66 files / 346 passed / 3 skipped / 0 failed.
- Focused authorization suite: 62/62 passed, including the six-identity route matrix and real session-backed Socket.IO spoof/demotion cases.
- Typecheck and production build passed; ESLint measured 0 errors / 6,664 warnings, and Vite transformed 3,298 modules. The warning backlog remains maintenance debt.
- Playwright captured Share and Invite modals at 1280, 1366, 1440, and 1600 × 900. All eight PNGs were inspected and showed centered, fully visible controls without clipping or overlap. Evidence: [`screenshots/260712-122218-sharing-access-ui/`](../screenshots/260712-122218-sharing-access-ui/).

### Boundary

- The original implementation branch did not connect to CouchDB or mutate production; a later read-only inventory measured the exact production boundary during stacked integration.
- The implementation was not deployed. Staging role checks remain required before cutover.

## Sharing authorization stacked on production hardening

### Integration

- Created isolated branch `codex/sharing-access-control-stack` from production-hardening head `dda4d1d5` and cherry-picked sharing commit `888b16fa`.
- After PR #64 squash-merged and its source branch was deleted, rebased the one resolved sharing commit onto merged commit `2595d2de`. The pre/post tree hash remained identical, so the published PR contains only the 54-file sharing/documentation diff rather than replaying hardening history.
- Resolved documentation conflicts by preserving the hardening/runtime incident checkpoint and adding the sharing checkpoint. Resolved backend overlaps by retaining the managed shutdown order and layering shared-session Socket.IO authorization on top.
- The first focused run exposed a duplicate `closeSocket` export from the automatic merge. The duplicate sharing lifecycle hook would also have destroyed the Yjs cache before the hardening flush; it was removed so shutdown remains Socket.IO close → HTTP drain → version-aware Yjs flush → Redis close.
- Incorporated the read-only production inventory: **26 topic metadata documents / 0 explicit policies / 26 missing-policy legacy / 0 malformed**. No titles, content, or policy documents were read or changed.

### Verification

- Focused authorization suite: **62/62 passed**.
- Full stacked Vitest: **67 files / 361 passed / 3 skipped / 0 failed**.
- Typecheck and production build passed; Vite transformed **3,298 modules**.
- ESLint measured **0 errors / 6,684 warnings**; warnings remain explicit maintenance debt.
- Independently read all eight checked-in Share/Invite PNGs at 1280, 1366, 1440, and 1600 × 900. Both 500-pixel modals stay centered and fully visible; controls and labels remain unclipped at every width. The exact bounds are in the [visual manifest](../screenshots/260712-122218-sharing-access-ui/manifest.json).

### Boundary

- This stacked branch is not deployed and does not mutate the VPS. Normal CI plus isolated staging/public role and live-demotion acceptance remain release gates.

## Private attachment authorization

### Outcome

- Built isolated branch `codex/private-upload-acl` from committed PR #66 head `9e003d88`; no remote branch, production file, or database document was changed.
- Replaced public static upload serving with opaque CouchDB metadata plus a per-request wave-read authorization check.
- Required every upload to name its canonical blip and pass current edit authorization. The metadata wave comes from the stored blip; a conflicting client wave claim is rejected.
- Kept the existing `/uploads/<id>` HTML contract while making logout and participant revocation effective immediately for known URLs.
- Failed S3/MinIO closed until object bytes can be proxied through the same ACL; public and pre-signed URLs are not treated as revocable.

### Evidence

- Read-only VPS inventory measured zero files and zero bytes in the active legacy checkout, current public checkout, managed release, and persistent `/var/lib/rizzoma/uploads` directory. There is no live attachment migration boundary.
- Focused stacked Vitest passed 70/70 across upload lifecycle, central access, and the six-role route matrix. The 14 upload cases include anonymous/private denial, non-editor upload denial, canonical-wave metadata, wave mismatch, local cleanup on metadata failure, no-store/nosniff streaming, and a known URL changing from HTTP-success eligibility to 403 after participant removal.
- TypeScript no-emit and the production build passed.

### Boundary

- This branch is local-only and must be rebased onto the final sharing/cache head before CI or merge.
- `public/sw.js` is intentionally untouched here. The companion integration must make `/uploads/*` network-only and purge the old dynamic cache before this route may deploy.
- Task and mention residue is outside this isolated slice and remains owned by the sharing route-ACL patch.

### Attachment scanner and cancellation hardening

- Made production scanning fail closed: absent configuration, connection/timeout failure, an empty response, and an unrecognized ClamAV response now return `virus_scan_unavailable`; only an explicit terminal `OK` verdict admits bytes, while `FOUND` remains a malware rejection.
- Added CSRF to the multipart upload route and restricted declared image MIME types to the existing allowlist instead of accepting every `image/*` subtype.
- Closed the preflight cancellation race in `createUploadTask`: canceling while CSRF setup is pending now rejects as `upload_aborted` without opening or sending the XHR.
- Verification: **20/20** focused tests passed across upload authorization, scanner protocol verdicts, and pre-CSRF cancellation; full TypeScript typecheck and `git diff --check` passed.
- Production dependency preflight then started a restart-persistent, loopback-only ClamAV container. Docker reported `healthy`; a raw INSTREAM clean probe returned `OK` and EICAR returned `FOUND`. Evidence is in [`screenshots/260712-1449-clamav-preflight/`](../screenshots/260712-1449-clamav-preflight/). The app is not yet wired to it until final candidate deployment.
- Closed the remaining same-origin active-content carrier: SVG is no longer an accepted image type, `.html`/`.js`/`.svg` and related active extensions are rejected even when declared as text or image, WebP has byte-signature recognition, and private storage extensions are derived from the admitted MIME/signature rather than the untrusted filename. Authorized downloads still use metadata-controlled MIME, `nosniff`, and attachment disposition for non-raster content.
- Focused verification after this hardening passed **24/24** across upload authorization, ClamAV protocol, and upload cancellation; typecheck and `git diff --check` passed.
