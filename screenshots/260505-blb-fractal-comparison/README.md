# BLB depth-10 fractal — visual comparison (2026-05-05)

Closes [GH #49](https://github.com/HCSS-StratBase/rizzoma/issues/49). Filed because the previous visual:sweep fixture only created ONE [+] inline blip at depth 1, so fractal-specific BLB regressions could not be caught by the systematic gate.

## What's in this folder

| File | What it shows |
|---|---|
| `REFERENCE_original-rizzoma-deep-fractal_old.png` | Original rizzoma.com — `HTU licenses/credits/passwords` topic with multi-level nested BLB structure (the "right" look) |
| `collapsed-toc_new-260505.png` | Our impl — depth-10 fixture in collapsed view: 3 root labels (Spine, Sibling B, Sibling C) each with their own [+] marker |
| `spine-expanded-depth10_new-260505.png` | Our impl — Spine branch expanded through all 10 levels: Spine.1 → Spine.2 → ... → Spine.9 → Spine.10's [+] still collapsed (one click away) |
| `all-branches-expanded_new-260505.png` | Our impl — all 3 root branches expanded (Spine.1+Spine.1.b, Sibling B.1/B.2, Sibling C.1/C.2/C.3) |

## Visual comparison verdict

| Aspect | Original Rizzoma | Our depth-10 impl |
|---|---|---|
| Hierarchy depth | Visually 3+ levels at once | Visually 10 levels at once (in spine-expanded shot) |
| Bullet markers | disc → circle → square per level | disc → circle progression visible (square+ get pushed off horizontally) |
| `[+]` anchors | Compact chip near label text | Small green pill embedded in label |
| Inline expansion | Indented subtree under parent | Indented subtree under parent ✓ (functional parity) |
| Density | ~30px per item | ~80px per item (avatar + date + "Write a reply..." input add vertical space) |
| Backgrounds | Subtle vertical lines | Light lavender/blue panels with solid borders |

**Functional parity: YES.** Hierarchy is preserved at every level. Bullets indent progressively. [+] anchors expand inline. Recursion works at depth 10.

**Visual fidelity gaps (cosmetic, not blocking):**
- Each rendered subblip takes ~80px (avatar + author + date + "Write a reply..." input). Original packs ~30px per item.
- The light-lavender panel backgrounds give ours a "card stack" look vs the original's lighter inline-text feel.
- These are styling differences, not structural ones — they don't break the fractal.

## How this gets enforced going forward

- `scripts/visual-feature-sweep.mjs` now has `createFractalFixture(page)` which builds a depth-N (default 10, override via `RIZZOMA_FRACTAL_DEPTH`) topic and `captureFractalStates(page, fractal)` which captures the 3 states above.
- `scripts/visual-feature-coverage.mjs` has new screenshotRules entries mapping the BLB fractal rows to filenames `035/036/037-blb-fractal-*.png`.
- `RIZZOMA_FEATURES_STATUS.md` BLB section has 4 new rows (Nested inline expansion changed from "Needs testing" to "Done" + 3 new fractal rows + 1 portal-flush row).
- The `.claude/hooks/visual-sweep-gate.sh` Stop hook (added 2026-05-04) warns at session-end if BLB code is touched in commits but the latest sweep folder is older than the latest commit.

## Reproducing this comparison

```bash
RIZZOMA_BASE_URL=https://dev.138-201-62-161.nip.io \
  RIZZOMA_SWEEP_STAMP=$(date -u +%y%m%d-%H%M%S) \
  RIZZOMA_FRACTAL_DEPTH=10 \
  npm run visual:sweep
RIZZOMA_SWEEP_DIR=screenshots/<stamp>-feature-sweep npm run visual:coverage
```

Then copy `035/036/037-blb-fractal-*.png` from the sweep folder into a comparison folder alongside `screenshots/260423-0249-hetzner-blb-additions/hetzner-blip-depth3-fractal.png`.
