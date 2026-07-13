# Worklog — 2026-07-13

## PR #71 deployment and concurrent read-marker closeout

- PR [#71](https://github.com/HCSS-StratBase/rizzoma/pull/71) passed all seven
  GitHub checks and merged as exact master
  `0553a611c54a7cfa8faf466ac0797a13b4aa51d4`.
- The immutable production build matched all **994** lockfile-driven production
  packages. The exact release passed private green `:8102` health and asset
  checks, then replaced blue through a zero-overlap cutover. Both nginx vhosts
  now target green; CouchDB, Redis, and ClamAV report ready.
- Resumed two-account acceptance verified invitation acceptance, role changes,
  Task and mention surfaces, Yjs relay/reconnect, Follow-the-Green, recursive
  exports, public/private sharing, upload ACLs, and revocation. The final console
  gate correctly stopped on one real defect instead of accepting a partial
  result.
- Exact production evidence showed two simultaneous mark-read requests for the
  same user/wave/blip. Both read the same CouchDB revision; one returned 200 and
  the other conflict escaped as 500.

## Read-marker repair

- Added `src/server/lib/readMarkers.ts`, a shared upsert for single and bulk
  routes. New markers use a deterministic CouchDB ID; retries reread that exact
  document rather than trusting a potentially stale Mango result.
- Existing legacy random-ID markers are found once and remain in place.
  Concurrent update and initial-insert conflicts retry at most four writes;
  `readAt` uses the maximum requested/current value; unrelated CouchDB errors
  propagate unchanged.
- Regression tests enforce CouchDB revision conflicts and prove two simultaneous
  updates both return 2xx, two simultaneous first inserts both return 2xx with
  one marker, legacy reuse creates no duplicate, and a simulated 503 is not
  masked.

## Verification

- Focused unread route suite: **8 passed / 0 failed**.
- Focused unread/Follow-the-Green matrix: **18 passed / 1 skipped / 0 failed**.
- Full Vitest: **108 files / 651 passed / 3 skipped / 0 failed**.
- TypeScript no-emit: passed.
- Full-source ESLint `--quiet`: passed.
- `git diff --check`: passed.
- Production build: passed, **3,315 modules** transformed.
- Independent read-only concurrency audit: **GO** for the observed two-request
  race. The deliberate bound means an extreme perfectly lock-stepped burst can
  fail after four write attempts rather than loop forever; that is a visible
  failure, not false success.

## Boundary

- PR [#72](https://github.com/HCSS-StratBase/rizzoma/pull/72) passed all required
  checks and squash-merged as exact master
  `5e1bc271e81613768e811cfc306c0c691e71d77b`.
- That exact tree is public on managed blue `:8101`. The immutable package
  contains all **994** lockfile-required production packages. Green `:8102`
  was drained for 38 seconds with no live connections or snapshot/flush errors,
  then stopped and disabled; both nginx vhosts now target blue. Public health
  reports CouchDB, Redis, and ClamAV ready.
- The resumed public phase-2 matrix passed **49/49** checks with zero unexpected
  browser errors and real Follow-the-Green **2 -> 1 -> 0** behavior. The final
  password-reset/restart/responsive phase did not produce its report and is not
  counted as accepted evidence.

## Core BLB release blocker

- SDS's first manual use exposed a more fundamental miss than the read-marker
  race: newly created content is not guaranteed to start and persist as a
  bullet list. The application can therefore create flat paragraph bodies that
  cannot serve as BLB labels with recursively anchored `[+]` subblips.
- This invalidates the overall “fully functional” claim despite green CI,
  infrastructure health, and the 49-check phase-2 matrix. Production is
  **deployed but not accepted**.
- Next acceptance must start from a real public topic created through the UI,
  using the same content-gated fractal specification as the legacy Rizzoma
  writer. It must prove always-bulleted topic, reply, and inline-child creation;
  recursive `[+]` construction; persistence after reload and managed restart;
  and inspected 1280/1366/1440/1600/mobile PNGs.

## Public reproduction and repair candidate

- The canonical content gate passed an intended **18-node**, depth-1 fractal
  status specification. Real public controls created the
  [reality-check topic](https://138-201-62-161.nip.io/#/topic/3305bc3a42889979c79fa39f400088c7?layout=rizzoma),
  typed that spec into a real blip, saved it, and reloaded it.
- Measured readback was exact: **18 paragraphs / 0 UL / 0 LI** before and after
  reload, with zero browser errors. Visual inspection confirms one long flat
  body with no recursive `[+]` anchors. Evidence:
  `screenshots/260713-0130-public-blb-creation-failure/`.
- Root cause spans creation and durability paths: topic creation and reply boxes
  supplied prose, the server accepted it verbatim, Ctrl+Enter read the wrong
  response level, toolbars and Shift+Tab could remove the outer list, raw API
  updates and duplication bypassed the invariant, and collaboration accepted
  flat ProseMirror state.
- Branch `fix/blb-always-bulleted` adds one shared BLB content contract. Topic
  creation now seeds H1 + UL/LI; plain-text reply lines become escaped LI/P
  labels; a ProseMirror transaction filter blocks flattening before Yjs emits;
  the server independently rejects flat CRDT candidates before cache mutation
  or relay; visible/secondary toolbars and keyboard escape paths are guarded;
  API replacements, duplicates, and legacy content normalize; root and nested
  Ctrl+Enter share the same starter; and the root optimistic mapper reads the
  nested server `blip` envelope.
- The durability review then closed seven additional split-brain/bypass paths:
  Yjs undo could restore invalid state; topic H1 accepted child creation;
  reserved Yjs roots could be poisoned; existing-flat seeds were repaired only
  in memory; stale REST props could overwrite collaborative state; malformed
  HTML could escape normalization; and task-list roots were mistaken for the
  canonical outer bullet list.
- Local verification is green: full Vitest **112 files / 678 passed / 3 skipped
  / 0 failed**; typecheck; branch-context lint; full-source ESLint at **0
  errors / 8,954 baseline warnings**; and a **3,318-module** production build.
  An independent final audit returned **GO for merge-candidate testing**.
- Boundary: draft PR [#73](https://github.com/HCSS-StratBase/rizzoma/pull/73)
  is not deployed; public production still runs the broken PR #72 tree.
  Private-green two-client/reload/restart and responsive visual acceptance,
  green PR checks, exact public cutover, repair of the measured failure topic,
  and clean journals remain.
