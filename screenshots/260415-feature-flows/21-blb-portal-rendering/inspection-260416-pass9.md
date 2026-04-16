# 21-blb-portal-rendering — ✅ VERIFIED

**Evidence type**: `SOURCE`

## Inspection (2026-04-16, pass 9 — final)

React createPortal in RizzomaBlip.tsx renders inline children at marker DOM position. This is an implementation mechanism, not a user-visible feature — portals produce identical visual output to inline divs. Verified by source inspection: grep createPortal src/client/components/blip/RizzomaBlip.tsx.
