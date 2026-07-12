# PR #57 release-gate evidence

Source: [CI run 29175211360](https://github.com/HCSS-StratBase/rizzoma/actions/runs/29175211360) at source head `37a45f21` on 2026-07-12. This is the complete green run containing the clocked-awareness fix, restored large-wave lazy-mount path, exact perf gates, zero-error lint cleanup, and the stabilized unread assertion.

PR #57's final source head `daa3f2f3` subsequently passed [CI 29175331401](https://github.com/HCSS-StratBase/rizzoma/actions/runs/29175331401) and [iOS 29175331404](https://github.com/HCSS-StratBase/rizzoma/actions/runs/29175331404), then merged to `master` as `8840f552`. The final-head rerun reproduced the structural performance verdict at 120/120 with 101 lazy slots and 36 MB heap; measured stage durations were 394.3 ms landing and 595.6 ms expanded.

## Measured acceptance

- Two-process collaboration: **10/10 checks passed**; A-to-B relay was **1 ms** against a 5,000 ms budget, the receiving client issued **0 REST PUTs** for the remote edit, bidirectional text converged, reconnect catch-up succeeded, and mark-read remained at zero after autosave quiescence.
- Full-render landing: **120/120** child blips, **120/120** labels, **101** lazy slots, **393.1 ms** measured topic-stage work, and **36 MB** heap.
- Real child expansion: **120/120** child blips, **119/119** remaining collapsed labels, **101** lazy slots, **612.1 ms** measured topic-stage work, and **36 MB** heap.
- The landing and expanded PNGs have different MD5 hashes (`06a3937a...` and `832bd87c...`), confirming that the interaction changed the rendered frame.

## Visual inspection

- [Landing labels](perf/render-1783819731864-landing-labels.png): the topic title and visible `Perf seed` rows are aligned, unclipped, and free of overlapping controls.
- [Expanded first blip](perf/render-1783819731864-expanded-first-blip.png): the first child visibly expands into the read toolbar, content, contributor, and reply field while later labels remain aligned beneath it.
- [Chromium toolbar](browser/toolbar-inline/1783819764058-chromium-final.png), [Firefox toolbar](browser/toolbar-inline/1783819764058-firefox-final.png), and [WebKit toolbar](browser/toolbar-inline/1783819764058-webkit-final.png): all three preserve the desktop shell, active-blip outline, toolbar, reply field, and right rail without overlap. The test-generated text differs by engine; this is fixture/keystroke output, not a layout claim.
- [Desktop Follow-the-Green](browser/follow-the-green/1783819791452-desktop-all-read.png) and [mobile Follow-the-Green](browser/follow-the-green-mobile/1783819826068-mobile-all-read.png): the all-read topic view is legible at both tested form factors, with no clipped primary controls.

## Boundary

- These are CI fixture views, not a production deployment verification.
- The repo-stored images are the visually inspected artifacts from run 29175211360; the final-head run reproduced the measured gates but did not replace these PNGs.
- Merged `master` has not yet been deployed.
- The 120-blip gate continuously exercises the `>100` lazy-mount branch. Full-render resilience at 500 and 1,000 blips remains a separate follow-up.
