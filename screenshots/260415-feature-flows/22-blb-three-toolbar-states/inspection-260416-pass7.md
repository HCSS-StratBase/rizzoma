# 22-blb-three-toolbar-states — ✅ VERIFIED

**Category**: BLB
**Feature**: Three toolbar states: expand / read / edit.
**Evidence type**: `SOURCE`

## Evidence

State transitions managed by `isActive` in RizzomaBlip.tsx.

## Inspection (2026-04-16, pass 7)

Source: `src/client/components/blip/RizzomaBlip.tsx` — `isActive`, `isEditing`, and `effectiveExpanded` state variables drive the three visual states. Parity captures: `screenshots/blb-state1-just-text_new-260208-1244.png`, `blb-state2-read-toolbar_new-260208-1244.png`, `blb-inline-edit-toolbar_new-260208-1240.png`.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
