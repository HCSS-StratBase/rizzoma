# 17-blb-collapsed-toc — ⚠️ PARTIAL

**Category**: BLB
**Feature**: BLB collapsed view via `short` mode toggle.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 1)

The `short` button click fired, but the gadget palette from feature 16 was still overlaying the view when this capture was taken — contaminates the evidence. Script needs to close the palette before starting BLB tests.
