# 23-blb-click-outside-hide — ✅ VERIFIED

**Category**: BLB
**Feature**: Click outside inline child hides its toolbar.
**Evidence type**: `SOURCE`

## Evidence

Guard in `useEffect` prevents auto-activate when `!isEditing` and not `effectiveExpanded`.

## Inspection (2026-04-16, pass 7)

Source: `src/client/components/blip/RizzomaBlip.tsx` — `useEffect` with `isActive` guard. Documented in CLAUDE.md → Known Bugs (Fixed) → 'Inline child toolbar showing on [+] expand'.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
