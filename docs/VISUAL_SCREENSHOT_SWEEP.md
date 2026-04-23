# Visual Screenshot Sweep

## 2026-04-24 Sweep

- Scope: fresh public-production sweep against `https://138-201-62-161.nip.io` for documented functionality where screenshots are the right artifact.
- Branch/checkpoint: `feature/rizzoma-core-features`, regenerated on 2026-04-24 01:15 CEST.
- Primary artifacts: [manifest.md](../screenshots/260424-003739-feature-sweep/manifest.md), [manifest.json](../screenshots/260424-003739-feature-sweep/manifest.json), [coverage.md](../screenshots/260424-003739-feature-sweep/coverage.md), and [coverage.json](../screenshots/260424-003739-feature-sweep/coverage.json).
- Primary coverage: 196 documented comparison rows parsed from `RIZZOMA_FEATURES_STATUS.md`; 161 rows classified as screenshot-valid; 69 rows classified as dynamic candidates; 40 fresh primary screenshots captured.
- Coverage matrix: 93 rows are static screenshot-covered, 8 rows are dynamic screenshot-covered, 58 rows are non-screenshot/test-artifact rows, and 2 rows remain explicit screenshot gaps.
- Dynamic supplements: [follow-green desktop](../screenshots/260424-003739-feature-sweep/follow-green/1776984446760-desktop-all-read.png), [follow-green mobile](../screenshots/260424-003739-feature-sweep/follow-green/1776984446760-mobile-all-read.png), plus owner/observer console logs in the same folder.
- Automation: `npm run visual:sweep` runs [scripts/visual-feature-sweep.mjs](../scripts/visual-feature-sweep.mjs); `npm run visual:coverage` runs [scripts/visual-feature-coverage.mjs](../scripts/visual-feature-coverage.mjs) against `RIZZOMA_SWEEP_DIR` or the default sweep folder.

## Visual Review

- Accepted: auth sign-in/sign-up forms, topic nav/search tabs, create/invite/share/export/playback modals, read/edit/overflow toolbars, emoji/mention/task/tag/gadget states, inline comments, BLB inline marker before/after, fold/unfold, right-panel toggles, toast component state, mobile topic list, and follow-green desktop/mobile topic states.
- Residual: row-level coverage leaves only two screenshot gaps: live cursors and typing indicators, both requiring a genuine two-client dynamic capture with remote cursor/typing visible.
- Residual: the generic mobile deep-link route sometimes remains on `Loading...`; the sweep records this honestly and uses the follow-green mobile topic screenshot as current mobile content evidence.
- Residual: public-production screenshots still show broken external avatar placeholders in this WSL/browser path; track as visual polish separate from the screenshot-harness work.
- Not counted as evidence: the older `test-blb-snapshots.mjs` supplemental run timed out on its inline expansion wait in this batch; the failed `blb/` artifact folder was removed, and the primary sweep's BLB before/after screenshots are the evidence.

## Next Sweep Rules

- Use a new datetime-stamped folder for every full sweep; do not reuse old screenshot folders as “already covered” evidence.
- Keep primary screenshots and dynamic before/action/after captures under the same timestamp folder.
- Regenerate `coverage.md`/`coverage.json` after every full sweep via `npm run visual:coverage`.
- After running, inspect representative screenshots directly before updating status docs.
- If a screenshot is blocked by a route/runtime issue, leave a residual in the manifest rather than silently counting it as covered.
