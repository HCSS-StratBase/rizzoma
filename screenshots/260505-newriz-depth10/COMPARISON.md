# NEW Rizzoma depth-10 Try vs OLD rizzoma.com Try — visual comparison

**Generated**: 2026-05-05
**NEW Rizzoma topic**: `https://dev.138-201-62-161.nip.io/?layout=rizzoma#/topic/1a94345b983b3a1c78f2a2da1a03d44b`
**OLD reference shots**: `screenshots/260505-rizzoma-com-vs-mine/`
**NEW screenshot batch**: `screenshots/260505-newriz-depth10/` (this dir)

## Side-by-side

| Comparison | OLD (rizzoma.com) | NEW (dev.138-201-62-161.nip.io) |
|---|---|---|
| Collapsed ToC | `00-rizzoma-com-before-anything_old-260505.png` | `00-collapsed-toc.png` |
| Depth-1 expanded | `05-rizzoma-com-subblip-with-3-bullets_old-260505.png` | `01-spine-depth-01-expanded.png` |
| Depth-3 cascading | `07-rizzoma-com-depth3-with-content_old-260505.png` | `03-spine-depth-03-expanded.png` |
| Depth-10 fullpage | `16-rizzoma-com-depth10_old-260505.png` + `17-…final-view-mode-depth10_old-260505.png` | `11-spine-depth-10-fullpage.png` |

## Build path used

NEW topic was built via `scripts/build_try_topic.mjs` (POST-driven, top-down spine
creation with `parentId+anchorPosition` at POST time, then PATCH bottom-up to wire
markers). OLD topic was built step-by-step via Ctrl+Enter through the legacy editor
on rizzoma.com (Playwright, 18 sequential keystrokes/clicks).

I attempted to replicate the OLD step-by-step Ctrl+Enter build in NEW too
(`scripts/build_try_step_by_step_new.mjs`) but hit a detection failure at
depth 1 — the new child WAS created (POST 201, marker inserted in editor),
but my script's selector `(.ProseMirror text == "")` didn't pick up the
auto-edit child within the 2.5s wait. Switched to API-build for clean
ground-truth. The Ctrl+Enter path itself works (verified in the standalone
`scripts/repro_nested_ctrl_enter.mjs` and `rizzoma_sanity_sweep.mjs`).

## Visual fidelity verdict

**Essentially identical.** Per-level cascading inset (~22px), card styling
(light pastel background, rounded corners), avatar+date right sidebar,
green `[+]` collapse markers, "Write a reply..." per-blip footer, full
depth-10 spine clearly visible — all match the original tightly.

### What MATCHES

- 3 top-level bullets (First / Second / Third) in collapsed ToC
- `[+]` only on First (Second + Third are bare leaves) — both versions
- Spine cascading right and downward at each level
- Avatar (initials) badge + month-year date on right of each card
- Tight per-card padding (no excessive whitespace between levels)
- Bullet markers (•) in front of each label
- `[+]` / `[-]` toggle character on each marker

### What's slightly DIFFERENT (cosmetic only)

- NEW: avatar badges sit a touch further right (but visually neutral)
- NEW: card background is a very light blue-gray; OLD is closer to cream.
  Both subtle, neither distracting.
- NEW: `Write a reply...` placeholder appears at every level even when not
  hovered; OLD only shows it on the active blip. Minor — could be hidden
  via `.rizzoma-parity .blip-container.nested-blip:not(.active) .reply-form
  { display: none }` if desired.

### What was BROKEN before today and is now FIXED

- Bullets disappearing in topic-root edit mode (commit `e47c56de`)
- Bullets jumping outside container in nested-blip edit mode (commit `e47c56de`)
- LI bullet broken when Ctrl+Enter inserted a marker mid-line — orphaned
  text after the marker (was the `chunks-sticky` z-index issue + parity
  flag silently inactive; both fixed in `2e3d6fd1`)
- Click `[+]` rendering child TWICE in same LI (commit `48a53931`)
- New Ctrl+Enter blip not auto-editable (commit `fb6cba9c` setEditable)
- Marker drift after parent text edits (commit `be9c7a95` drop numeric
  anchorPosition in favor of structural marker position)
- New child rendering as flat-stack BELOW editor instead of inline at
  cursor (commit `cc7caf4b` revert edit-mode-render-outside path)

## Files in this dir

| File | Description |
|---|---|
| `00-collapsed-toc.png` | Fresh topic, 3 collapsed bullets |
| `01-spine-depth-01-expanded.png` ... `10-spine-depth-10-expanded.png` | Spine expanded incrementally per depth |
| `11-spine-depth-10-fullpage.png` | Full-page screenshot at depth 10 |
| `12-root-edit-mode.png` | Topic root in edit mode |
| `13-first-label-expanded-with-toolbar.png` | First label expanded; nested toolbar visible |
| `14-marker-hover-state.png` | Hover state on a marker |
| `15a-spine-expanded-depth-5.png` / `15b-…-collapsed-after-…` / `16-…-re-expanded` | Collapse cycle |
| `17-second-and-third-labels-bare.png` | Confirms bare labels stay bare |
| `99-final-collapsed.png` / `99-final-spine-expanded.png` | From the abandoned step-by-step build attempt |

## Conclusion

**Visual parity with original rizzoma.com depth-10 fractal is achieved.**
The remaining cosmetic differences (background hue, reply-form visibility)
are tuning items, not structural. Everything user-reported earlier today
(bullets, editing, Ctrl+Enter, drift, collapse-state-preservation) is
verified live + locked in by `scripts/rizzoma_sanity_sweep.mjs` (14
checks) and `scripts/verify_state_survives_collapse.mjs` (1 check). Both
green at end of session.
