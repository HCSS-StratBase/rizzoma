# Legacy/current visual parity audit — 2026-07-14

Verdict: **EVIDENCE-COMPLETE / VISUAL PARITY IN_PROGRESS**. The full gate chain
(sweep → coverage → comparisons → audit) now has every required artifact at
matrix scale, with zero coverage gaps. Visual parity itself is NOT yet
"essentially identical" — the remaining divergences are enumerated below with
classifications.

## Measured counts

- Documented functionality rows parsed by this sweep: **200**.
- Rows classified in the coverage matrix: **159**.
- Coverage: **101 screenshot_covered + 5 dynamic_screenshot_covered + 53
  non_screenshot_artifact = 159/159**; screenshot gaps: **0** (VF-039/VF-040
  live-cursor/typing closed by the two-client capture
  `041-real-time-cursor-and-typing-indicator-visible.png` — "User 59 is
  typing…" indicator visible in the owner client).
- Old Rizzoma reference artifacts: **150 PNGs / 151 MD notes** total —
  **126 PNGs** in the new systematic archive
  `screenshots/260714-legacy-reference-archive/` (captured 2026-07-14, 4
  passes: full-page states, element crops, per-topic content states, mobile +
  1280 widths; read-only, sandbox-only edit chrome, fold-dispatch unfolds so no
  unread-greens were consumed) plus **24 PNGs** in the Feb reference set. Gate
  floor (150) met exactly; the ~243 target remains open (next tranche: per-VF-row
  element crops on legacy, settings subpages, gadget detail pages).
- Latest current-app sweep: **45 PNGs** (44 sweep captures, all **44/44
  programmatic gates PASS**, + the standalone realtime pair capture).
- Legacy/current comparison sheets in this folder: **24** (was 10 on 07-13).
- Deployed build audited: `feature/native-fractal-port` @ `11c4e15e` on
  `https://138-201-62-161.nip.io`.

## Legacy/current comparisons (24 sheets)

signin, signup, topics list, search, mentions, tasks, publics, store, teams,
topic view/BLB ToC, share, invite/members, blip menu, edit ribbon, link popup,
fractal level-1, fractal deep, folded ToC, mindmap, text view, gear, playback,
mobile, Feb blip-view reference.

## Severe failures / divergences (classified)

1. **Deep BLB layout divergence — `legacy regression`, the #1 visual gap.**
   `fractal_deep_vs_depth10.png`: legacy renders depth-10 as TIGHT nested boxed
   blip blocks (~15px indent per level, bordered, fits the content column);
   current splays a wide diagonal ladder with large horizontal steps and
   whitespace, no boxing. Carried over from the 07-13 audit; unchanged.
2. **Two editable surfaces after topic-editor Ctrl+Enter — `legacy
   regression`.** On the deployed line, the topic-level editor stays editable
   while the new child edits (verified 2026-07-14: `editableAnywhere: 2`).
   Legacy keeps ONE edit surface. The superseded `fix/single-active-editor`
   branch contains a working `EditSurfaceActiveBridge` for exactly this;
   porting it is the identified fix.
3. **Observer-side real clicks time out on freshly-shared topics —
   `needs diagnosis`.** In the two-client fixture the observer's real Playwright
   clicks on `.blip-collapsed-row`/`.blip-content` consistently timed out
   (dispatch-clicks work). May indicate an overlay/actionability defect a real
   second user would feel on first visit to a shared topic.
4. **Mobile parity undecided — `intentional modernization (pending product
   decision)`.** Legacy serves the desktop three-pane layout compressed;
   current serves a single-column mobile layout. Carried from 07-13; needs an
   explicit SDS ruling before it can be closed either way.
5. **Google SSO — regression-tested only at redirect level** (`redirect_uri`
   correct on the current deploy); full authenticated round-trip remains in the
   manual test set.

## Immediate next fixes/checks

- Fix the deep-BLB indentation/boxing to match legacy's tight nesting (#1).
- Port `EditSurfaceActiveBridge` to `feature/native-fractal-port` (#2).
- Diagnose the observer-side click actionability failure (#3).
- Grow the legacy archive from 150 toward the 243 target with per-VF-row crops.
- SDS ruling on mobile layout intent (#4).
