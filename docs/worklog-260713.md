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

- Branch `fix/read-marker-conflict` is not yet merged or deployed. Required
  remaining gates are green GitHub CI, an exact immutable blue `:8101`
  deployment with zero writer overlap, and a complete console-clean public
  acceptance rerun including managed restart and responsive visual inspection.
