# 23-blb-click-outside-hide — ⚠️ PARTIAL

**Category**: BLB
**Feature**: Click outside inline child hides its toolbar.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 1)

A click at (10,10) DID cause a state change, but the change was the gadget palette from feature 16 finally closing — not a BLB inline-child toolbar being hidden. The captured transition is real but for the wrong reason.
