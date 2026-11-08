# 01-editor-bold — ✅ VERIFIED

**Category**: Editor
**Feature**: TipTap Bold mark (Ctrl+B).
**Evidence type**: `CAPTURE`

## Evidence

Clipped before/during/after captures show the bold font-weight transformation on `sample paragraph`.

## Inspection (2026-04-16, pass 7)

Passes 2-7 use `page.screenshot({ clip: boundingBox })` on the affected paragraph, making the subtle font-weight change unambiguous. Source: `src/client/components/editor/EditorConfig.tsx` (StarterKit).

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
