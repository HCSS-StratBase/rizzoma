# Rizzoma UI Comparison Rollup (260225)

## Scope and sources
- Live reference set: `screenshots/260225/live-reference` (24 PNG + 24 MD)
- Older local captures: `screenshots/260225/old-local` (49 files)
- Prior parity bundle: `screenshots/260225/current-captures` (80 files)
- New exhaustive run (desktop+mobile profiles): `screenshots/260225/ui-exhaustive-1771981300160` (175 PNG + 175 MD)
- UI element inventory: `docs/UI_ELEMENTS_EXHAUSTIVE.md`

## Confirmed still wrong vs live-reference functionality set
From `screenshots/260225/current-captures/REPORT.md` (direct live/current pairing):
- `rizzoma-gear-menu`: gear/overflow toggle not found in that parity flow (fallback screenshot used).
- `rizzoma-search-overlay`: legacy reference appears unavailable/mislabeled; fallback used.
- `rizzoma-share-modal`: share modal unavailable in tested flow (fallback used).
- `rizzoma-share`: share button not found in tested flow (fallback used).
- `rizzoma-unread`: legacy reference appears unavailable/mislabeled; fallback used.

## Exhaustive run observations (175 scenarios)
- PASS: 0
- PARTIAL: 175
- FAIL: 0
- Notes are per screenshot under `ui-exhaustive-1771981300160/notes/`.

Top missing expected tokens in notes (strict token check):
- `Write a reply`: missing in 160 screenshots
- `short`: missing in 28
- `expanded`: missing in 28
- `Text view`: missing in 28
- `Mind map`: missing in 28
- Each nav label (`Topics`, `Mentions`, `Tasks`, `Publics`, `Store`, `Teams`, `Help`): missing in 8-10 each depending on scenario type

Interpretation:
- The exhaustive script verifies many strict text tokens in every scenario; many `PARTIAL` statuses are due to token scope mismatch (for example, checking `Write a reply` even in screens where focus/layout does not show it), not blank captures.
- The direct parity report remains the better source for confirmed functional mismatches against the 24 live-reference scenarios.

## What this now covers well
- Side navigation states across 7 sections
- Right rail view toggles (`Text view`, `Mind map`) and density states (`short`, `expanded`)
- Blip read/edit/reply states
- Invite/share attempt states
- 5 viewport/device profiles (`desktop`, `desktop-wide`, `tablet`, `mobile`, `mobile-android`)

## Remaining coverage gaps (for true all-UI exhaustiveness)
- Deep workflows not yet enumerated here: unread traversal behavior, advanced share/privacy permutations, search overlay variants, multi-level replies/inline-comment permutations, and niche gadget/store dialogs.
- Legacy live references are only 24 scenarios and do not represent all possible click paths; they are a parity subset, not full product-state coverage.

## Artifact paths
- Rollup index: `screenshots/260225/INDEX.md`
- This report: `screenshots/260225/COMPARISON_EXHAUSTIVE_260225.md`
- New exhaustive images: `screenshots/260225/ui-exhaustive-1771981300160/images`
- New exhaustive notes: `screenshots/260225/ui-exhaustive-1771981300160/notes`
