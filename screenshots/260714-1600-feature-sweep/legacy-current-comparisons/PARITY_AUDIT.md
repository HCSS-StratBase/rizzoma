# Legacy/current visual parity audit — 2026-07-14 (post hand-build)

Verdict: **EVIDENCE-COMPLETE; four severe failures RESOLVED; visual parity
IN_PROGRESS on the rest.** Live = `feature/native-fractal-port` @ `4f586fa3`.

## ⚠️ Why this audit supersedes the one from an hour earlier

The previous audit declared the deep-BLB work done on the strength of a
**pre-built fixture** expanded programmatically. SDS rejected that: *"Did you
even TRY writing a 10-deep blip and making and analyzing screenshots every step
of the way?"* He was right. A genuine hand-build through the real UI (S10
protocol: one atomic action per step, a PNG after **every** action, each PNG
eyeballed) immediately exposed **two further product-breaking bugs that every
prior gate, sweep and measurement had missed**. Fixture-driven verification
cannot see them, because they only occur while *creating* depth.

## Severe failures — status

1. **Deep-BLB layout (diagonal ladder) — ✅ RESOLVED.** Indent step 87px→34px
   per level; width loss 157px→11px; depth-10 usable width 241px→562px. Nested
   children now render as contained boxed cards.
2. **Two editable surfaces after topic Ctrl+Enter — ✅ RESOLVED.** Single-active
   bridge ported; edit-entry broadcasts the claim, foreign claims finish
   (auto-save) the previous edit, the topic editor claims/releases/reasserts.
3. **🆕 Nested Ctrl+Enter created a DEAD child — the fractal died at depth 3 —
   ✅ RESOLVED (`396c707b`).** Ctrl+Enter from inside a nested child created the
   grandchild container but it stayed in VIEW mode with no editor and **no
   focus**: keystrokes went nowhere. Cause: the child's single-active claim
   FINISHES the parent's edit, unmounting the child's first mount (it lives in
   the parent editor's BlipThreadNode portal); it re-mounts in the parent's VIEW
   render *after* the single RAF has fired. The topic-level path had a re-drive
   loop; the NESTED path did not. Evidence:
   `screenshots/260714-handbuild-d10/07-ctrl-enter-to-L3.png` (empty box, no
   toolbar, `editable=0 focus=""`).
4. **🆕 Nested blips were NOT BULLETED (BLB §19 row 1 violation) — ✅ RESOLVED
   (`b0fcca4f`+`4f586fa3`).** Every level below the first persisted as a bare
   paragraph: L2 body = `<ul><li><p>L2 label`, but L4/L7 = `<p>L4 label` — no
   list at all. The server seeds `<ul><li><p></p></li></ul>`, but the client
   opens the child's editor before that content propagates; TipTap initialises a
   bare `<p>` and the first auto-save overwrites the server's list. Fixed with
   `ensureBulletedBody()` at all three editor-content injection sites (the
   enter-edit *listener* path never goes through `handleStartEdit`, which is why
   the first attempt at this fix did nothing).
5. **Observer-side real clicks time out on freshly-shared topics — OPEN.**
6. **Mobile parity — OPEN (needs a product ruling).**

## Hand-build evidence (the acceptance test that actually matters)

`scripts/handbuild_depth10.mjs` — real clicks, real Ctrl+Enter, real typing;
a PNG after every atomic action; every PNG eyeballed.
- Run 1 (`screenshots/260714-handbuild-d10/`): **died at depth 3.**
- Run 4 (`screenshots/260714-handbuild-d10-run4/`, post-fix): **all 10 levels
  build**, each child opens editable and focused, each accepts typed text;
  after reload + expand, **L1…L10 all persist**; probe confirms **every** level
  is `<ul><li>` (bulleted). Final render:
  `handbuilt_d10_FINAL.png` and `handbuilt_d10_legacy_vs_current.png`.

## Legacy/current comparisons

26 side-by-side sheets in this folder, including the hand-built depth-10 vs the
2026-05-05 legacy depth-10 reference.

## Measured counts

- Documented rows: **200**; matrix rows: **159**.
- Coverage: 101 screenshot + 5 dynamic + 53 non-screenshot = **159/159**;
  **screenshot gaps: 0** (VF-039/040 closed by a genuine two-client capture,
  `seen=true`).
- Sweep: **44/44 programmatic gates PASS**.
- Regressions on live: 11/11 single-active gates; 14/14 sanity checks.
- Legacy reference archive: **150 PNGs / 151 notes** (target ~243 open).

## Lesson recorded

Fixture-driven verification is NOT acceptance for a *creation* flow. Any claim
about BLB/fractal behaviour must be backed by a hand-build through the real UI
with a screenshot after every action, each one eyeballed — the two bugs above
were invisible to 44 sweep gates, 159 coverage rows, 11 single-active gates,
14 sanity checks and pixel measurements.

## Next

- Diagnose observer-side click actionability (#5).
- SDS ruling on mobile (#6).
- Root body line renders without a bullet (minor BLB gap at the topic root).
- Legacy archive 150 → 243; productionize (systemd + Redis sessions).
