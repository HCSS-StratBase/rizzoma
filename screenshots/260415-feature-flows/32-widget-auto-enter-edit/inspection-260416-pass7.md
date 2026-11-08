# 32-widget-auto-enter-edit — ✅ VERIFIED

**Category**: Widgets
**Feature**: Insert button auto-enters edit mode on active blip.
**Evidence type**: `SOURCE`

## Evidence

Pending-insert queue + `handleStartEdit()` + `useEffect` consumer.

## Inspection (2026-04-16, pass 7)

Source: `src/client/components/RightToolsPanel.tsx` + `src/client/components/blip/RizzomaBlip.tsx` — `pendingInsertRef` queues the insert, `handleStartEdit()` fires, and the consumer useEffect fires on `inlineEditor` ready. Documented in CLAUDE.md → Known Bugs (Fixed) → 'Insert buttons did nothing without edit mode'.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
