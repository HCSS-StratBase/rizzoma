# 25-blb-ctrl-enter-child — ❌ NOT DEMONSTRATED

**Category**: BLB
**Feature**: Ctrl+Enter creates inline child at cursor.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 1)

Selection + Ctrl+Enter fired, but the resulting inline-child portal did not render (or rendered after the screenshot). Needs a wait-for-portal assertion.
