# Legacy/current visual parity audit — 2026-07-14 (post-fix)

Verdict: **EVIDENCE-COMPLETE; the two severe UI failures are RESOLVED; visual
parity IN_PROGRESS on the remaining items.** Both fixes are deployed to LIVE
(`feature/native-fractal-port` @ `cd14290a`) and re-verified there.

## Measured counts

- Documented functionality rows parsed: **200**; classified in the coverage
  matrix: **159**.
- Coverage: **101 screenshot_covered + 5 dynamic_screenshot_covered + 53
  non_screenshot_artifact = 159/159**; **screenshot gaps: 0**.
  VF-039/040 (live cursors / typing) closed by a genuine two-client capture —
  `041-real-time-cursor-and-typing-indicator-visible.png`, owner client shows the
  remote "is typing…" indicator (`seen=true`; a first attempt returned
  `seen=false` and was NOT counted — re-run until real).
- Sweep: **44/44 programmatic gates PASS**.
- Legacy reference archive: **150 PNGs / 151 MD notes** (126 in
  `screenshots/260714-legacy-reference-archive/` + 24 in the Feb set). Gate floor
  150 met; ~243 target still open.
- Legacy/current comparison sheets: **25**.

## Legacy/current comparisons

25 side-by-side sheets in this folder: signin, signup, topics list, search,
mentions, tasks, publics, store, teams, topic view/BLB ToC, share,
invite/members, blip menu, edit ribbon, link popup, fractal level-1, fractal
deep (pre-fix), **fractal_deep_vs_depth10_FIXED (post-fix)**, folded ToC,
mindmap, text view, gear, playback, mobile, and the Feb blip-view reference.

## Severe failures — status

1. **Deep-BLB layout — ✅ RESOLVED (2026-07-14).** Was: a diagonal ladder losing
   ~87px of indent AND ~157px of width per level (depth-10 kept only 241px of a
   1440 viewport). Root cause measured, not guessed: FIVE compounding terms
   (wrapper margin 22 + wrapper padding 8 + LI margin 22 + row padding 12 + text
   padding 8 + bullet gutter ~13) plus the avatar/meta flex column eating width.
   Fix (`e53b95c9`+`76ed55e2`+`cd14290a`): keep ONLY the LI's 22px step (that IS
   legacy's step), wrapper hugs it, body paddings stop stacking, the
   contributors chip goes `position:absolute` in the box corner, and nested
   children get the legacy boxed-card treatment.
   **Now: ~34px step/level, ~11px width loss/level, depth-10 keeps 562px.**
   Evidence: `fractal_deep_vs_depth10_FIXED.png` +
   `screenshots/260714-blb-layout/`. Residual: legacy's bare step is 22px vs our
   34px (the nested bullet gutter) — visually equivalent nesting, not
   pixel-identical.
2. **Two editable surfaces after topic Ctrl+Enter — ✅ RESOLVED (2026-07-14).**
   The single-active bridge was ported to this line (`2775bb8f`, `82ae960a`,
   `576c2853`): edit-entry BROADCASTS the active-blip claim; a foreign claim
   FINISHES (auto-saves) the previous edit instead of merely hiding its toolbar;
   the topic editor claims `topic-editor:<id>`, releases on foreign claims, and
   REASSERTS on its own host's claims (clicks inside the editor bubble to the
   root container — releasing on those used to kill the edit session).
   Verified on LIVE with real clicks/keystrokes: focus retained, Ctrl+Enter →
   `POST /api/blips 201` → **exactly ONE editable surface**, typed text lands and
   persists.
3. **Observer-side real clicks time out on freshly-shared topics — OPEN
   (`needs diagnosis`).** In the two-client fixture the observer's real
   Playwright clicks on `.blip-collapsed-row`/`.blip-content` time out
   (dispatch-clicks work). For a collaboration tool this must be understood
   before real teammates use it.
4. **Mobile parity undecided — OPEN (`intentional modernization?`).** Legacy
   compresses the desktop three-pane layout; current serves a single-column
   mobile layout. Needs an explicit product ruling.
5. **Google SSO** — redirect-level verified on the current deploy; the full
   authenticated round-trip stays in the manual test set.

## Regression evidence on LIVE (this build)

- `verify_single_active_editor.mjs`: **11/11 gates**.
- `rizzoma_sanity_sweep.mjs`: **14/14 checks**.
- `debug_root_ce2.mjs` (the user's own flow): topic Edit → in-editor click →
  Ctrl+Enter → one editable surface, typed content lands.
- `measure_fractal_geometry.mjs`: per-level geometry as tabulated above.

## Next

- Diagnose #3 (observer-side click actionability).
- SDS ruling on #4 (mobile).
- Legacy archive 150 → 243.
- Productionize the deployment (systemd + Redis sessions + reboot survival) —
  the app is pilot-ready, not switch-ready, until that lands.
