# Legacy/current visual parity audit — 2026-07-13

Verdict: **FAIL / IN_PROGRESS**. The current public sweep is useful evidence, but it is not a completed parity pass against legacy Rizzoma.

## Measured counts

- Documented functionality rows parsed by the latest sweep: **200**.
- Rows classified in current coverage matrix: **159**.
- Old Rizzoma reference artifacts: **24 PNG screenshots** and **24 MD notes** in `screenshots/260224-2343-rizzoma-live-reference/feature/rizzoma-core-features/`.
- Latest new-Rizzoma public sweep: **44 PNG screenshots** in `screenshots/260713-225614-public-parity-sweep-feature-sweep/`.
- Visual screenshot row coverage in latest new sweep: **104 / 159** (`101 screenshot_covered` + `3 dynamic_screenshot_covered`) = **65.4%** of the classified matrix, or **52.0%** of all 200 documented rows.
- Non-screenshot/test-artifact rows: **53 / 159**.
- Current screenshot gaps: **2** (`VF-039` live cursors and `VF-040` typing indicators were not included in this sweep's realtime screenshot set).
- Legacy/current comparison sheets generated in this folder: **10**.
- Completed written visual analyses before this audit file: **0**.

## Legacy/current comparisons

- `main_vs_landing.png`
- `blip_view_vs_read_toolbar.png`
- `blip_edit_vs_edit_toolbar.png`
- `nested_vs_depth10.png`
- `toolbar_vs_active_terminal.png`
- `gear_vs_read_gear.png`
- `invite_vs_invite.png`
- `share_vs_share.png`
- `search_vs_search.png`
- `mobile_vs_mobile.png`

## Severe failures

1. **BLB/fractal bullet behavior was not acceptable until the 2026-07-13 fixes.** The main Rizzoma affordance must be recursively bulleted BLB rows; earlier states could render terminal-looking content without the required visible `[+]` path.
2. **Per-blip toolbar parity was broken and user-visible.** The user's `2026-07-13_22-41-24.png` screenshot showed full menus on every expanded blip. Commit `b517102b` fixed this with single active-blip claiming, and `04-terminal-active-only-toolbar.png` verifies only the terminal active blip shows the menu.
3. **Google SSO previously returned `502 Bad Gateway`.** The nginx upstream was stale; the public hostname was cut over to the new app and health/OAuth redirects were rechecked, but full authenticated Google login must remain in the parity test set.
4. **Deep BLB layout is functional but visually divergent.** `nested_vs_depth10.png` shows the current depth-10 spine expanding into a wide diagonal ladder with substantial whitespace, while legacy nested blips use tighter indentation and visibly boxed blip blocks. This is not yet “essentially identical.”
5. **Mobile parity is undecided, not proven.** `mobile_vs_mobile.png` compares a legacy desktop-like three-panel narrow layout against a current single-column top-bar layout. This may be an intentional modernization, but it cannot be counted as legacy parity without an explicit product decision.

## Immediate next fixes/checks

- Inspect all 10 comparison sheets and classify each difference as `legacy regression`, `intentional modernization`, or `fixture/content mismatch`.
- Add the missing realtime screenshot capture for `VF-039` and `VF-040`, or document why realtime proof is supplied elsewhere.
- Extend the gate so every future UI-status handoff requires this audit file, not just `manifest.md` programmatic pass lines.
- Continue fixing the largest visible divergences before claiming broad parity.
