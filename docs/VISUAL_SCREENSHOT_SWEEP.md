# Visual Screenshot Sweep

## 2026-04-24 Sweep

- Scope: fresh public-production sweep against `https://138-201-62-161.nip.io` for documented functionality where screenshots are the right artifact.
- Branch/commit: `feature/rizzoma-core-features` at `c988f6da` when the sweep was generated.
- Primary artifacts: [screenshots/260424-003739-feature-sweep/manifest.md](../screenshots/260424-003739-feature-sweep/manifest.md) and [manifest.json](../screenshots/260424-003739-feature-sweep/manifest.json).
- Primary coverage: 196 documented comparison rows parsed from `RIZZOMA_FEATURES_STATUS.md`; 161 rows classified as screenshot-valid; 69 rows classified as dynamic candidates; 39 fresh primary screenshots captured.
- Dynamic supplements: [follow-green desktop](../screenshots/260424-003739-feature-sweep/follow-green/1776984446760-desktop-all-read.png), [follow-green mobile](../screenshots/260424-003739-feature-sweep/follow-green/1776984446760-mobile-all-read.png), plus owner/observer console logs in the same folder.
- Automation: `npm run visual:sweep` runs [scripts/visual-feature-sweep.mjs](../scripts/visual-feature-sweep.mjs); set `RIZZOMA_BASE_URL`, `RIZZOMA_SWEEP_STAMP`, or `RIZZOMA_SWEEP_DIR` to target a different deployment/folder.

## Visual Review

- Accepted: auth sign-in/sign-up forms, topic nav/search tabs, create/invite/share/export/playback modals, read/edit/overflow toolbars, emoji/mention/task/tag/gadget states, inline comments, BLB inline marker before/after, fold/unfold, right-panel toggles, mobile topic list, and follow-green desktop/mobile topic states.
- Residual: the generic mobile deep-link route sometimes remains on `Loading...`; the sweep records this honestly and uses the follow-green mobile topic screenshot as current mobile content evidence.
- Residual: public-production screenshots still show broken external avatar placeholders in this WSL/browser path; track as visual polish separate from the screenshot-harness work.
- Not counted as evidence: the older `test-blb-snapshots.mjs` supplemental run timed out on its inline expansion wait in this batch; the failed `blb/` artifact folder was removed, and the primary sweep's BLB before/after screenshots are the evidence.

## Next Sweep Rules

- Use a new datetime-stamped folder for every full sweep; do not reuse old screenshot folders as “already covered” evidence.
- Keep primary screenshots and dynamic before/action/after captures under the same timestamp folder.
- After running, inspect representative screenshots directly before updating status docs.
- If a screenshot is blocked by a route/runtime issue, leave a residual in the manifest rather than silently counting it as covered.
