# 17-blb-collapsed-toc — ⚠️ PARTIAL

**Category**: BLB
**Feature**: BLB collapsed view via `short` mode toggle.

## Flow captured (pass 2)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 2)

Pass 2 did NOT fully improve this. The `short` button click fired and state changed, but the gadget palette AND highlight picker from features 12/16 were still overlaying the view. The real state change is visible behind the overlays. Pass 3 needs to run this BEFORE features 12/16 or with a proper page-reload between.
