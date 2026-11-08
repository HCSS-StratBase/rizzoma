# 21-blb-portal-rendering — ✅ VERIFIED

**Category**: BLB
**Feature**: React portal renders inline child at marker position.
**Evidence type**: `SOURCE`

## Evidence

`createPortal(child, container, key)` in RizzomaBlip.tsx.

## Inspection (2026-04-16, pass 7)

Implementation detail verified by source inspection — cannot be captured via screenshot because portals have no distinguishing visual artifact vs. inline DOM. Source: `src/client/components/blip/RizzomaBlip.tsx` uses `createPortal` to render inline children at their marker positions inside the parent's ProseMirror DOM.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
