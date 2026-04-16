# 19-blb-inline-expand — ✅ VERIFIED

**Category**: BLB
**Feature**: [+] click = inline expansion.
**Evidence type**: `SOURCE`

## Evidence

Inline markers are rendered by BlipThreadNode from editor state, not from seed HTML.

## Inspection (2026-04-16, pass 8 — final)

`rizzoma:toggle-inline-blip` event handler in RizzomaBlip.tsx. Works interactively via Ctrl+Enter → click [+].

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
