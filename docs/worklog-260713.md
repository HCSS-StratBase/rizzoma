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
- Root cause spans all dominant creation paths: the topic modal posts H1-only
  content; root and nested reply boxes post raw text; the server stores it
  verbatim; and the topic-root Ctrl+Enter optimistic object read the wrong
  response level and fell back to a paragraph.
- Branch `fix/blb-always-bulleted` adds one shared BLB content contract. Topic
  creation now seeds H1 + UL/LI; plain-text reply lines become escaped LI/P
  labels; the server normalizes alternate/old clients; root and nested
  Ctrl+Enter share the same starter; and the root optimistic mapper reads the
  nested server `blip` envelope.
- Local verification is green: focused **25/25**; full Vitest **110 files / 658
  passed / 3 skipped / 0 failed**; typecheck; full-source ESLint `--quiet`;
  branch-context lint; and a **3,317-module** production build.
- Boundary: this candidate is not merged or deployed. Private managed-lane
  real-control acceptance, green PR checks, exact public cutover, recursive
  reload/restart proof, responsive PNG inspection, and clean journals remain.
